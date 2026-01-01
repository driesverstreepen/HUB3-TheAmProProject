const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

function calculateDuration(startTime, endTime) {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

async function generateLessonsForGroup(programId, groupDetails, locationIds, programTitle) {
  if (!groupDetails || !groupDetails.season_start || !groupDetails.season_end) return [];
  const startDate = new Date(groupDetails.season_start);
  const endDate = new Date(groupDetails.season_end);
  const targetWeekday = parseInt(groupDetails.weekday, 10);

  let currentDate = new Date(startDate);
  while (currentDate.getDay() !== targetWeekday) {
    currentDate.setDate(currentDate.getDate() + 1);
  }

  const lessons = [];
  let lessonNumber = 1;
  while (currentDate <= endDate) {
    const locationId = (locationIds && locationIds.length > 0) ? locationIds[0] : null;
    lessons.push({
      program_id: programId,
      location_id: locationId,
      title: `${programTitle} - Les ${lessonNumber}`,
      date: currentDate.toISOString().split('T')[0],
      time: groupDetails.start_time,
      duration_minutes: calculateDuration(groupDetails.start_time, groupDetails.end_time),
    });
    lessonNumber++;
    currentDate.setDate(currentDate.getDate() + 7);
  }

  return lessons;
}

async function run() {
  console.log('Starting backfill: detect proeflessen');

  // find candidate programs that look like proeflessen
  // Note: some environments may not have the `is_trial` column. Avoid selecting it to prevent errors.
  const { data: programs, error } = await supabase
    .from('programs')
    .select('id, title, program_type, price, group_details(*), workshop_details(*)')
    .or("title.ilike.%proef%,program_type.ilike.%trial%,price.eq.0")
    .limit(1000);

  if (error) {
    console.error('Error fetching candidate programs', error);
    process.exit(1);
  }

  console.log(`Found ${programs.length} candidate programs`);

  const summary = { updated: 0, lessonsCreated: 0 };

  for (const p of programs) {
    try {
      // mark program as is_trial if not already
      if (!p.is_trial) {
        const { error: upErr } = await supabase.from('programs').update({ is_trial: true }).eq('id', p.id);
        if (upErr) console.warn('Failed to mark program as is_trial', p.id, upErr);
        else summary.updated++;
      }

      // create lessons for workshops
      if (p.program_type === 'workshop') {
        const wds = p.workshop_details || [];
        for (const w of wds) {
          // Support both new schema (date + start_time/end_time) and legacy (start_datetime/end_datetime)
          let dateStr = null;
          let timeStr = null;
          let duration = null;

            if (w.date && w.start_time) {
            dateStr = String(w.date);
            timeStr = String(w.start_time).split(':').slice(0,2).join(':');
            if (w.end_time) {
              // calculate duration from times
              const [sh, sm] = String(w.start_time).split(':').map(Number);
              const [eh, em] = String(w.end_time).split(':').map(Number);
              duration = (eh * 60 + em) - (sh * 60 + sm);
            }
          } else if (w.start_datetime) {
            const start = new Date(w.start_datetime);
            const end = w.end_datetime ? new Date(w.end_datetime) : null;
            dateStr = start.toISOString().split('T')[0];
            const hh = String(start.getHours()).padStart(2, '0');
            const mm = String(start.getMinutes()).padStart(2, '0');
            timeStr = `${hh}:${mm}`;
            if (end) duration = Math.round((end.getTime() - start.getTime()) / 60000);
          } else {
            continue; // nothing to derive
          }

          // check if a lesson exists for this program/date/time
          const { data: exists, error: exErr } = await supabase
            .from('lessons')
            .select('id')
            .eq('program_id', p.id)
            .eq('date', dateStr)
            .eq('time', timeStr)
            .limit(1);

          if (exErr) {
            console.warn('Error checking existing lesson', p.id, exErr);
            continue;
          }

          if (!exists || exists.length === 0) {
            if (duration) {
              const payload = {
                program_id: p.id,
                title: p.title,
                date: dateStr,
                time: timeStr,
                duration_minutes: duration,
              };
              const { error: insErr } = await supabase.from('lessons').insert(payload);
              if (insErr) console.warn('Failed to insert workshop-derived lesson', insErr);
              else summary.lessonsCreated++;
            } else {
              // Try to infer duration from an existing lesson
              const { data: lessonMatch, error: lmErr } = await supabase
                .from('lessons')
                .select('id, duration_minutes')
                .eq('program_id', p.id)
                .eq('date', dateStr)
                .eq('time', timeStr)
                .limit(1)
                .maybeSingle();

              if (lmErr) {
                console.warn('Error checking lesson to infer duration', p.id, lmErr);
              } else if (lessonMatch && lessonMatch.duration_minutes) {
                const inferredDuration = lessonMatch.duration_minutes;
                // Try to update workshop_details row if it exists (support both schemas)
                if (w.id) {
                  const updates = {};
                  if (!w.end_time && w.start_datetime) {
                    // compute end_time from inferred duration
                    const start = new Date(w.start_datetime);
                    const end = new Date(start.getTime() + inferredDuration * 60000);
                    updates.end_time = `${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`;
                  }
                  if (Object.keys(updates).length > 0) {
                    const { error: updErr } = await supabase
                      .from('workshop_details')
                      .update(updates)
                      .eq('id', w.id);
                    if (updErr) console.warn('Failed to update workshop_details end_time', p.id, w.id, updErr);
                    else console.log('Updated workshop_details end_time for program', p.id, 'detail', w.id);
                  }
                }
              } else {
                console.log('No duration and no matching lesson to infer duration for workshop', p.id, dateStr, timeStr);
              }
            }
          }
        }
      }

      // create lessons for group programs based on group_details
      if (p.program_type === 'group' && p.group_details && p.group_details.length > 0) {
        const gd = Array.isArray(p.group_details) ? p.group_details[0] : p.group_details;

        // if lessons already exist for this program, skip generating duplicates
        const { data: existingLessons } = await supabase.from('lessons').select('id').eq('program_id', p.id).limit(1);
        if (!existingLessons || existingLessons.length === 0) {
          const generated = await generateLessonsForGroup(p.id, gd, [], p.title);
          if (generated.length > 0) {
            const { error: insErr } = await supabase.from('lessons').insert(generated);
            if (insErr) console.warn('Failed to insert generated group lessons', insErr);
            else summary.lessonsCreated += generated.length;
          }
        }
      }
    } catch (e) {
      console.error('Error processing program', p.id, e);
    }
  }

  console.log('Backfill completed:', summary);
  process.exit(0);
}

run();

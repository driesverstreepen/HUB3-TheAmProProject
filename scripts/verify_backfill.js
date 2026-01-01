const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

async function run() {
  console.log('Running verification queries...');

  // 1) Programs that look like proeflessen
  const { data: programs, error: pErr } = await supabase
    .from('programs')
    .select('id, title, program_type, price, is_trial, created_at, updated_at')
    .or("title.ilike.%proef%,program_type.ilike.%trial%,price.eq.0")
    .order('updated_at', { ascending: false })
    .limit(50);

  if (pErr) console.error('Error fetching programs:', pErr.message || pErr);
  else {
    console.log('\n=== Matched Programs ===');
    console.log(`Found ${programs.length} program(s)`);
    programs.forEach(p => {
      console.log(`${p.id} | ${p.title} | ${p.program_type} | price=${p.price} | is_trial=${p.is_trial} | updated_at=${p.updated_at}`);
    });
  }

  // 2) Recent workshop_details updates
  const { data: wds, error: wErr } = await supabase
    .from('workshop_details')
    .select('id, program_id, date, start_time, end_time, created_at, updated_at')
    .limit(50);

  if (wErr) console.error('Error fetching workshop_details:', wErr.message || wErr);
  else {
    console.log('\n=== Recent workshop_details ===');
    console.log(`Found ${wds.length} record(s)`);
    wds.forEach(w => {
      console.log(`${w.id} | program=${w.program_id} | date=${w.date} | start=${w.start_time} | end=${w.end_time} | updated_at=${w.updated_at}`);
    });
  }

  // 3) Recent lessons created
  const { data: lessons, error: lErr } = await supabase
    .from('lessons')
    .select('id, program_id, date, time, duration_minutes, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (lErr) console.error('Error fetching lessons:', lErr.message || lErr);
  else {
    console.log('\n=== Recent lessons ===');
    console.log(`Found ${lessons.length} lesson(s)`);
    lessons.slice(0, 50).forEach(ld => {
      console.log(`${ld.id} | program=${ld.program_id} | date=${ld.date} | time=${ld.time} | duration=${ld.duration_minutes} | created_at=${ld.created_at}`);
    });
  }

  process.exit(0);
}

run().catch(err => {
  console.error('Unexpected error', err);
  process.exit(1);
});

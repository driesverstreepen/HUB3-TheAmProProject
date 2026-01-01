import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkStudioAccess, checkStudioPermission } from "@/lib/supabaseHelpers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function getUserFromBearer(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return { user: null as any, error: "Unauthorized" };
  }

  const token = authHeader.substring("Bearer ".length);
  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error,
  } = await supabaseUser.auth.getUser();

  if (error || !user) return { user: null as any, error: "Unauthorized" };
  return { user, error: null };
}

function calculateDuration(startTime: string, endTime: string): number {
  const [startHour, startMin] = String(startTime).split(":").map(Number);
  const [endHour, endMin] = String(endTime).split(":").map(Number);
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  return endMinutes - startMinutes;
}

function shiftDate(dateStr: string | null | undefined, deltaDays: number) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().split("T")[0];
}

async function generateGroupLessons(
  supabase: any,
  args: {
    programId: string;
    groupDetails: any;
    programTitle: string;
    locationId: string | null;
    teacherId: string | null;
    schoolYearId: string;
  },
) {
  const { groupDetails } = args;
  if (!groupDetails?.season_start || !groupDetails?.season_end) return;

  const startDate = new Date(groupDetails.season_start);
  const endDate = new Date(groupDetails.season_end);
  const targetWeekday = parseInt(String(groupDetails.weekday));

  let currentDate = new Date(startDate);
  while (currentDate.getDay() !== targetWeekday) {
    currentDate.setDate(currentDate.getDate() + 1);
  }

  const lessons: any[] = [];
  let lessonNumber = 1;
  while (currentDate <= endDate) {
    lessons.push({
      program_id: args.programId,
      location_id: args.locationId,
      title: `${args.programTitle} - Les ${lessonNumber}`,
      date: currentDate.toISOString().split("T")[0],
      time: groupDetails.start_time,
      duration_minutes: calculateDuration(
        groupDetails.start_time,
        groupDetails.end_time,
      ),
      teacher_id: args.teacherId,
      school_year_id: args.schoolYearId,
    });
    lessonNumber++;
    currentDate.setDate(currentDate.getDate() + 7);
  }

  if (lessons.length === 0) return;

  const { error } = await supabase.from("lessons").insert(lessons);
  if (error) {
    const msg = (error as any)?.message ? String((error as any).message) : "";
    // Back-compat if lessons.school_year_id isn't deployed yet.
    if (msg.toLowerCase().includes("school_year_id")) {
      const retryLessons = lessons.map((l) => {
        const { school_year_id: _omit, ...rest } = l;
        return rest;
      });
      const retry = await supabase.from("lessons").insert(retryLessons);
      if (retry.error) throw retry.error;
      return;
    }
    throw error;
  }
}

async function generateWorkshopLesson(
  supabase: any,
  args: {
    programId: string;
    programTitle: string;
    date: string;
    start_time: string;
    end_time: string;
    locationId: string | null;
    teacherId: string | null;
    schoolYearId: string;
  },
) {
  const payload: any = {
    program_id: args.programId,
    location_id: args.locationId,
    title: args.programTitle,
    date: args.date,
    time: args.start_time,
    duration_minutes: calculateDuration(args.start_time, args.end_time),
    teacher_id: args.teacherId,
    school_year_id: args.schoolYearId,
  };

  let { error } = await supabase.from("lessons").insert(payload);
  if (error) {
    const msg = (error as any)?.message ? String((error as any).message) : "";
    if (msg.toLowerCase().includes("school_year_id")) {
      const { school_year_id: _omit, ...retryPayload } = payload;
      const retry = await supabase.from("lessons").insert(retryPayload);
      error = retry.error;
    }
  }
  if (error) throw error;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ studioId: string }> },
) {
  try {
    const { studioId } = await params;

    const { user, error } = await getUserFromBearer(request);
    if (error) return NextResponse.json({ error }, { status: 401 });

    const access = await checkStudioAccess(supabaseAdmin, studioId, user.id);
    if (!access.hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const perm = await checkStudioPermission(
      supabaseAdmin,
      studioId,
      user.id,
      "studio.programs",
      { requireWrite: true },
    );
    if (!perm.allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({} as any));

    const sourceSchoolYearIdRaw = (body as any)?.source_school_year_id
      ? String((body as any).source_school_year_id)
      : null;
    const newYear = (body as any)?.new_school_year || null;

    const copyPrograms = (body as any)?.copy_programs !== false;

    if (!newYear?.label || !newYear?.starts_on || !newYear?.ends_on) {
      return NextResponse.json(
        { error: "new_school_year (label, starts_on, ends_on) is required" },
        { status: 400 },
      );
    }

    const makeActive = (newYear as any)?.is_active !== false;
    const alsoSelectForUser = (body as any)?.select_for_user === true;

    // Load source school year (defaults to studio active year)
    let sourceYear: any = null;
    if (sourceSchoolYearIdRaw) {
      const { data, error: srcErr } = await supabaseAdmin
        .from("studio_school_years")
        .select("id, starts_on, ends_on")
        .eq("studio_id", studioId)
        .eq("id", sourceSchoolYearIdRaw)
        .maybeSingle();
      if (srcErr) return NextResponse.json({ error: srcErr.message }, { status: 500 });
      sourceYear = data;
    }

    if (!sourceYear) {
      const { data, error: activeErr } = await supabaseAdmin
        .from("studio_school_years")
        .select("id, starts_on, ends_on")
        .eq("studio_id", studioId)
        .eq("is_active", true)
        .maybeSingle();
      if (activeErr) return NextResponse.json({ error: activeErr.message }, { status: 500 });
      sourceYear = data;
    }

    if (!sourceYear?.id) {
      return NextResponse.json(
        { error: "No source school year found" },
        { status: 400 },
      );
    }

    const deltaDays = (() => {
      const srcStart = new Date(sourceYear.starts_on);
      const dstStart = new Date(String(newYear.starts_on));
      if (Number.isNaN(srcStart.getTime()) || Number.isNaN(dstStart.getTime())) return 0;
      const ms = dstStart.getTime() - srcStart.getTime();
      return Math.round(ms / (1000 * 60 * 60 * 24));
    })();

    // Create new school year (optionally making it active)
    if (makeActive) {
      await supabaseAdmin
        .from("studio_school_years")
        .update({ is_active: false })
        .eq("studio_id", studioId);
    }

    const { data: createdYear, error: createYearErr } = await supabaseAdmin
      .from("studio_school_years")
      .insert({
        studio_id: studioId,
        label: String(newYear.label),
        starts_on: String(newYear.starts_on),
        ends_on: String(newYear.ends_on),
        is_active: makeActive,
      })
      .select("id, label, starts_on, ends_on, is_active")
      .single();

    if (createYearErr || !createdYear?.id) {
      return NextResponse.json(
        { error: "school_year_create_failed", details: createYearErr?.message },
        { status: 500 },
      );
    }

    const newSchoolYearId = String(createdYear.id);

    // Clone programs (optional)
    const createdPrograms: any[] = [];
    if (copyPrograms) {
      const { data: sourcePrograms, error: programsErr } = await supabaseAdmin
        .from("programs")
        .select("*")
        .eq("studio_id", studioId)
        .eq("school_year_id", String(sourceYear.id));

      if (programsErr) {
        return NextResponse.json(
          { error: "programs_load_failed", details: programsErr.message },
          { status: 500 },
        );
      }

      const oldPrograms = Array.isArray(sourcePrograms) ? sourcePrograms : [];
      const oldProgramIds = oldPrograms.map((p: any) => String(p.id));

      // Load related rows upfront
      const [groupRes, workshopRes, locRes, teacherRes] = await Promise.all([
        supabaseAdmin
          .from("group_details")
          .select("*")
          .in("program_id", oldProgramIds),
        supabaseAdmin
          .from("workshop_details")
          .select("*")
          .in("program_id", oldProgramIds),
        supabaseAdmin
          .from("program_locations")
          .select("*")
          .in("program_id", oldProgramIds),
        supabaseAdmin
          .from("teacher_programs")
          .select("*")
          .in("program_id", oldProgramIds),
      ]);

    if (groupRes.error) {
      return NextResponse.json(
        { error: "group_details_load_failed", details: groupRes.error.message },
        { status: 500 },
      );
    }
    if (workshopRes.error) {
      return NextResponse.json(
        { error: "workshop_details_load_failed", details: workshopRes.error.message },
        { status: 500 },
      );
    }
    if (locRes.error) {
      return NextResponse.json(
        { error: "program_locations_load_failed", details: locRes.error.message },
        { status: 500 },
      );
    }
    if (teacherRes.error) {
      return NextResponse.json(
        { error: "teacher_programs_load_failed", details: teacherRes.error.message },
        { status: 500 },
      );
    }

    const groupByOldProgramId = new Map<string, any>();
    (groupRes.data || []).forEach((gd: any) => {
      groupByOldProgramId.set(String(gd.program_id), gd);
    });

    const workshopByOldProgramId = new Map<string, any>();
    (workshopRes.data || []).forEach((wd: any) => {
      workshopByOldProgramId.set(String(wd.program_id), wd);
    });

    const locationsByOldProgramId = new Map<string, string[]>();
    (locRes.data || []).forEach((pl: any) => {
      const pid = String(pl.program_id);
      const arr = locationsByOldProgramId.get(pid) || [];
      arr.push(String(pl.location_id));
      locationsByOldProgramId.set(pid, arr);
    });

    const teachersByOldProgramId = new Map<string, string[]>();
    (teacherRes.data || []).forEach((tp: any) => {
      const pid = String(tp.program_id);
      const arr = teachersByOldProgramId.get(pid) || [];
      if (tp.teacher_id) arr.push(String(tp.teacher_id));
      teachersByOldProgramId.set(pid, arr);
    });

      const oldToNewProgramId = new Map<string, string>();

      for (const oldProgram of oldPrograms) {
      const insertPayload: any = {
        studio_id: studioId,
        program_type: oldProgram.program_type,
        title: oldProgram.title,
        description: oldProgram.description ?? null,
        dance_style: oldProgram.dance_style ?? null,
        level: oldProgram.level ?? null,
        capacity: oldProgram.capacity ?? null,
        price: oldProgram.price ?? null,
        // Cloned programs should start hidden on the studio public profile.
        is_public: false,
        // newer schema fields (best-effort)
        accepts_class_passes: (oldProgram as any).accepts_class_passes ?? false,
        class_pass_product_id: (oldProgram as any).class_pass_product_id ?? null,
        is_trial: (oldProgram as any).is_trial ?? false,
        accepts_payment: (oldProgram as any).accepts_payment ?? false,
        linked_form_id: (oldProgram as any).linked_form_id ?? null,
        linked_trial_program_id: (oldProgram as any).linked_trial_program_id ?? null,
        show_capacity_to_users: (oldProgram as any).show_capacity_to_users ?? true,
        waitlist_enabled: (oldProgram as any).waitlist_enabled ?? false,
        school_year_id: newSchoolYearId,
      };

      // Some deployments may have teacher_id column on programs
      if ((oldProgram as any)?.teacher_id) {
        insertPayload.teacher_id = (oldProgram as any).teacher_id;
      }

      let { data: newProgram, error: insertErr } = await supabaseAdmin
        .from("programs")
        .insert(insertPayload)
        .select("*")
        .single();

      if (insertErr) {
        const msg = (insertErr as any)?.message ? String((insertErr as any).message) : "";
        // Back-compat: if programs.school_year_id isn't deployed yet.
        if (msg.toLowerCase().includes("school_year_id")) {
          const { school_year_id: _omit, ...retryPayload } = insertPayload;
          const retry = await supabaseAdmin
            .from("programs")
            .insert(retryPayload)
            .select("*")
            .single();
          newProgram = retry.data;
          insertErr = retry.error;
        }
      }

      if (insertErr || !newProgram?.id) {
        return NextResponse.json(
          { error: "program_clone_failed", details: insertErr?.message },
          { status: 500 },
        );
      }

      oldToNewProgramId.set(String(oldProgram.id), String(newProgram.id));
        createdPrograms.push(newProgram);

      // Clone group_details / workshop_details with shifted dates
      if (String(oldProgram.program_type) === "group") {
        const gd = groupByOldProgramId.get(String(oldProgram.id));
        if (gd) {
          const seasonStart = shiftDate(gd.season_start, deltaDays);
          const seasonEnd = shiftDate(gd.season_end, deltaDays);
          const { error: gdErr } = await supabaseAdmin.from("group_details").insert({
            program_id: String(newProgram.id),
            weekday: gd.weekday,
            start_time: gd.start_time,
            end_time: gd.end_time,
            season_start: seasonStart,
            season_end: seasonEnd,
          });
          if (gdErr) {
            return NextResponse.json(
              { error: "group_details_clone_failed", details: gdErr.message },
              { status: 500 },
            );
          }
        }
      } else if (String(oldProgram.program_type) === "workshop") {
        const wd = workshopByOldProgramId.get(String(oldProgram.id));
        if (wd) {
          const shiftedDate = shiftDate(wd.date, deltaDays);
          const { error: wdErr } = await supabaseAdmin
            .from("workshop_details")
            .insert({
              program_id: String(newProgram.id),
              date: shiftedDate,
              start_time: wd.start_time,
              end_time: wd.end_time,
            });
          if (wdErr) {
            return NextResponse.json(
              { error: "workshop_details_clone_failed", details: wdErr.message },
              { status: 500 },
            );
          }
        }
      }

      // Clone program_locations (keeps same location ids)
      const oldLocs = locationsByOldProgramId.get(String(oldProgram.id)) || [];
      if (oldLocs.length > 0) {
        const inserts = oldLocs.map((locationId) => ({
          program_id: String(newProgram.id),
          location_id: locationId,
        }));
        const { error: locErr } = await supabaseAdmin
          .from("program_locations")
          .insert(inserts);
        if (locErr) {
          // locations are optional, but keep it strict for cloning consistency
          return NextResponse.json(
            { error: "program_locations_clone_failed", details: locErr.message },
            { status: 500 },
          );
        }
      }

      // Clone teacher_programs (best-effort)
      const oldTeacherIds = teachersByOldProgramId.get(String(oldProgram.id)) || [];
      if (oldTeacherIds.length > 0) {
        const teacherInserts = oldTeacherIds.map((teacherId) => ({
          teacher_id: teacherId,
          program_id: String(newProgram.id),
          studio_id: studioId,
          assigned_by: user.id,
        }));
        const { error: tpErr } = await supabaseAdmin
          .from("teacher_programs")
          .insert(teacherInserts);
        if (tpErr) {
          return NextResponse.json(
            { error: "teacher_programs_clone_failed", details: tpErr.message },
            { status: 500 },
          );
        }
      }
    }

      // Generate lessons for cloned programs (optional)
      const generateLessons = (body as any)?.generate_lessons !== false;
      if (generateLessons) {
        for (const newProgram of createdPrograms) {
          const oldId = [...oldToNewProgramId.entries()].find(([, v]) => v === String(newProgram.id))?.[0];
          if (!oldId) continue;

        const locs = locationsByOldProgramId.get(oldId) || [];
        const teacherIds = teachersByOldProgramId.get(oldId) || [];
        const teacherId = teacherIds.length > 0 ? teacherIds[0] : null;
        const locationId = locs.length > 0 ? locs[0] : null;

        if (String(newProgram.program_type) === "group") {
          const { data: gd, error: gdErr } = await supabaseAdmin
            .from("group_details")
            .select("*")
            .eq("program_id", String(newProgram.id))
            .maybeSingle();
          if (gdErr) {
            return NextResponse.json(
              { error: "group_details_reload_failed", details: gdErr.message },
              { status: 500 },
            );
          }
          if (gd) {
            await generateGroupLessons(supabaseAdmin, {
              programId: String(newProgram.id),
              groupDetails: gd,
              programTitle: String(newProgram.title),
              locationId,
              teacherId,
              schoolYearId: newSchoolYearId,
            });
          }
        }

        if (String(newProgram.program_type) === "workshop") {
          const { data: wd, error: wdErr } = await supabaseAdmin
            .from("workshop_details")
            .select("*")
            .eq("program_id", String(newProgram.id))
            .maybeSingle();
          if (wdErr) {
            return NextResponse.json(
              { error: "workshop_details_reload_failed", details: wdErr.message },
              { status: 500 },
            );
          }
          if (wd?.date) {
            await generateWorkshopLesson(supabaseAdmin, {
              programId: String(newProgram.id),
              programTitle: String(newProgram.title),
              date: String(wd.date),
              start_time: String(wd.start_time),
              end_time: String(wd.end_time),
              locationId,
              teacherId,
              schoolYearId: newSchoolYearId,
            });
          }
        }
        }
      }
    }

    // Optionally set the user's selected school year preference to this new one
    if (alsoSelectForUser) {
      try {
        await supabaseAdmin
          .from("studio_user_school_year_preferences")
          .upsert(
            {
              studio_id: studioId,
              user_id: user.id,
              selected_school_year_id: newSchoolYearId,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "studio_id,user_id" },
          );
      } catch {
        // Ignore if the table isn't deployed yet.
      }
    }

    return NextResponse.json({
      success: true,
      source_school_year_id: String(sourceYear.id),
      new_school_year: createdYear,
      cloned_programs: createdPrograms.length,
      delta_days: deltaDays,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Unexpected error", details: e?.message || String(e) },
      { status: 500 },
    );
  }
}

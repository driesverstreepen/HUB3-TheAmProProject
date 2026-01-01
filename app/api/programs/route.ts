import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autoSyncProgramToStripe } from "@/lib/stripeAutoSync";
import { createNotificationsAndPush } from "@/lib/notify";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.warn("Missing Supabase env for programs endpoint");
}

/**
 * Generate lessons for a group program based on season dates and weekday
 */
async function generateLessonsForGroupProgram(
  supabase: any,
  programId: string,
  groupDetails: any,
  locationIds: string[],
  programTitle: string,
  teacherId?: string | null,
  schoolYearId?: string | null,
) {
  if (!groupDetails.season_start || !groupDetails.season_end) {
    console.log("Skipping lesson generation: no season dates provided");
    return;
  }

  const startDate = new Date(groupDetails.season_start);
  const endDate = new Date(groupDetails.season_end);
  const targetWeekday = parseInt(groupDetails.weekday); // 0 = Sunday, 1 = Monday, etc.

  // Find the first occurrence of the target weekday on or after startDate
  let currentDate = new Date(startDate);
  while (currentDate.getDay() !== targetWeekday) {
    currentDate.setDate(currentDate.getDate() + 1);
  }

  const lessons = [];
  let lessonNumber = 1;

  // Generate lessons for each week until endDate
  while (currentDate <= endDate) {
    // Use first location if multiple are provided, or null if none
    const locationId = locationIds && locationIds.length > 0
      ? locationIds[0]
      : null;

    const lessonPayload: any = {
      program_id: programId,
      location_id: locationId,
      title: `${programTitle} - Les ${lessonNumber}`,
      date: currentDate.toISOString().split("T")[0], // YYYY-MM-DD
      time: groupDetails.start_time,
      duration_minutes: calculateDuration(
        groupDetails.start_time,
        groupDetails.end_time,
      ),
    };

    if (teacherId) lessonPayload.teacher_id = teacherId;
    if (schoolYearId) lessonPayload.school_year_id = schoolYearId;

    lessons.push(lessonPayload);

    lessonNumber++;
    // Move to next week
    currentDate.setDate(currentDate.getDate() + 7);
  }

  if (lessons.length > 0) {
    const { error } = await supabase.from("lessons").insert(lessons);
    if (error) {
      const msg = (error as any)?.message ? String((error as any).message) : "";
      // Back-compat if lessons.school_year_id isn't deployed yet.
      if (msg.toLowerCase().includes("school_year_id") && schoolYearId) {
        const retryLessons = lessons.map((l: any) => {
          const { school_year_id: _omit, ...rest } = l;
          return rest;
        });
        const retry = await supabase.from("lessons").insert(retryLessons);
        if (retry.error) {
          console.error("Error generating lessons (retry):", retry.error);
        }
      } else {
        console.error("Error generating lessons:", error);
      }
    } else {
      console.log(
        `Generated ${lessons.length} lessons for program ${programId}`,
      );
    }
  }
}

/**
 * Calculate duration in minutes between start and end time (HH:MM format)
 */
function calculateDuration(startTime: string, endTime: string): number {
  const [startHour, startMin] = startTime.split(":").map(Number);
  const [endHour, endMin] = endTime.split(":").map(Number);
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  return endMinutes - startMinutes;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      access_token,
      program,
      groupDetails,
      workshopDetails,
      locationIds,
      teacherIds,
    } = body;

    if (!access_token) {
      return NextResponse.json({ error: "missing_access_token" }, {
        status: 400,
      });
    }

    const supabase = createClient(
      SUPABASE_URL || "",
      SUPABASE_SERVICE_ROLE || "",
    );

    // Validate token
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        apikey: SUPABASE_SERVICE_ROLE || "",
      },
    });

    if (!userResp.ok) {
      return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }

    const userData = await userResp.json();
    const userId = userData?.id;

    if (!userId) {
      return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }

    // Verify user is studio_admin for this studio OR is the studio owner
    const { data: userRole, error: roleError } = await supabase
      .from("user_roles")
      .select("role, studio_id")
      .eq("user_id", userId)
      .eq("role", "studio_admin")
      .eq("studio_id", program.studio_id)
      .maybeSingle();

    // Also check if user is the studio owner
    const { data: studioOwner, error: ownerError } = await supabase
      .from("studios")
      .select("eigenaar_id")
      .eq("id", program.studio_id)
      .maybeSingle();

    // Also allow studio members with admin role stored in studio_members
    const { data: studioMember, error: studioMemberError } = await supabase
      .from("studio_members")
      .select("role")
      .eq("studio_id", program.studio_id)
      .eq("user_id", userId)
      .maybeSingle();

    console.log("Authorization check:", {
      userId,
      studioId: program.studio_id,
      userRole,
      roleError,
      studioOwner,
      ownerError,
      isOwner: studioOwner?.eigenaar_id === userId,
    });

    const memberIsAdmin = studioMember &&
      ["owner", "admin", "studio_admin"].includes(String(studioMember.role));
    const isAuthorized = userRole ||
      (studioOwner && studioOwner.eigenaar_id === userId) || memberIsAdmin;

    if (!isAuthorized) {
      console.warn(
        "/api/programs unauthorized: user is not studio_admin or owner",
        { userId, studioId: program?.studio_id },
      );
      return NextResponse.json({ error: "unauthorized" }, { status: 403 });
    }

    const waitlistEnabled = !!program?.waitlist_enabled &&
      typeof program?.capacity === "number" &&
      program.capacity > 0;

    // Determine school_year_id (required on newer DBs)
    let schoolYearId: string | null =
      (program as any)?.school_year_id
        ? String((program as any).school_year_id)
        : (body as any)?.school_year_id
        ? String((body as any).school_year_id)
        : null;

    try {
      // Validate requested year belongs to studio; otherwise fall back to active.
      if (schoolYearId) {
        const { data: yearRow, error: yearErr } = await supabase
          .from("studio_school_years")
          .select("id")
          .eq("id", schoolYearId)
          .eq("studio_id", program.studio_id)
          .maybeSingle();
        if (yearErr) {
          const msg = (yearErr as any)?.message
            ? String((yearErr as any).message)
            : "";
          if (String((yearErr as any)?.code) === "PGRST205") {
            // Missing table in older deployments.
            schoolYearId = null;
          } else if (!yearRow) {
            schoolYearId = null;
          }
        } else if (!yearRow) {
          schoolYearId = null;
        }
      }

      if (!schoolYearId) {
        const { data: activeYear, error: activeErr } = await supabase
          .from("studio_school_years")
          .select("id")
          .eq("studio_id", program.studio_id)
          .eq("is_active", true)
          .maybeSingle();
        if (!activeErr && activeYear?.id) schoolYearId = String(activeYear.id);
        if (activeErr && String((activeErr as any)?.code) === "PGRST205") {
          schoolYearId = null;
        }
      }
    } catch (e) {
      // Fail open if table isn't available yet.
      schoolYearId = null;
    }

    // Insert program
    const programInsertPayload: any = {
        studio_id: program.studio_id,
        program_type: program.program_type,
        accepts_class_passes: program.accepts_class_passes ?? false,
        class_pass_product_id: program.class_pass_product_id || null,
        is_trial: program.is_trial ?? false,
        title: program.title,
        description: program.description || null,
        dance_style: program.dance_style || null,
        level: program.level || null,
        capacity: program.capacity || null,
        waitlist_enabled: waitlistEnabled,
        price: program.price || null,
        min_age: program.min_age || null,
        max_age: program.max_age || null,
        is_public: program.is_public ?? true,
        accepts_payment: program.accepts_payment ?? false,
        linked_form_id: program.linked_form_id ?? null,
        linked_trial_program_id: program.linked_trial_program_id ?? null,
        show_capacity_to_users: program.show_capacity_to_users ?? true,
      };

    if (schoolYearId) programInsertPayload.school_year_id = schoolYearId;

    let programData: any = null;
    let programError: any = null;

    {
      const res = await supabase
        .from("programs")
        .insert(programInsertPayload)
        .select()
        .single();
      programData = res.data;
      programError = res.error;
    }

    // Back-compat: if programs.school_year_id isn't deployed yet.
    if (programError) {
      const msg = (programError as any)?.message
        ? String((programError as any).message)
        : "";
      if (msg.toLowerCase().includes("school_year_id") && schoolYearId) {
        const { school_year_id: _omit, ...retryPayload } = programInsertPayload;
        const retry = await supabase
          .from("programs")
          .insert(retryPayload)
          .select()
          .single();
        programData = retry.data;
        programError = retry.error;
      }
    }

    if (programError) {
      console.error("Program insert error:", programError);
      return NextResponse.json(
        { error: "program_insert_failed", details: programError.message },
        { status: 500 },
      );
    }

    // Insert type-specific details
    if (program.program_type === "group" && groupDetails) {
      const { error: detailsError } = await supabase
        .from("group_details")
        .insert({
          program_id: programData.id,
          weekday: groupDetails.weekday,
          start_time: groupDetails.start_time,
          end_time: groupDetails.end_time,
          season_start: groupDetails.season_start || null,
          season_end: groupDetails.season_end || null,
        });

      if (detailsError) {
        console.error("Group details insert error:", detailsError);
        // Rollback program
        await supabase.from("programs").delete().eq("id", programData.id);
        return NextResponse.json(
          { error: "details_insert_failed", details: detailsError.message },
          { status: 500 },
        );
      }

      // Also update the programs row with a shallow copy of schedule fields so
      // the client (which may be subject to RLS on group_details) can display
      // the schedule without needing to select group_details directly.
      try {
        const { error: progUpdateErr } = await supabase
          .from("programs")
          .update({
            weekday: groupDetails.weekday,
            start_time: groupDetails.start_time,
            end_time: groupDetails.end_time,
          })
          .eq("id", programData.id);
        if (progUpdateErr) {
          console.warn(
            "Failed to update programs schedule columns after inserting group_details",
            progUpdateErr,
          );
        }
      } catch (e) {
        console.warn("Unexpected error updating program schedule columns", e);
      }
    } else if (program.program_type === "workshop" && workshopDetails) {
      const { error: detailsError } = await supabase
        .from("workshop_details")
        .insert({
          program_id: programData.id,
          date: workshopDetails.date,
          start_time: workshopDetails.start_time,
          end_time: workshopDetails.end_time,
        });

      if (detailsError) {
        console.error("Workshop details insert error:", detailsError);
        // Rollback program
        await supabase.from("programs").delete().eq("id", programData.id);
        return NextResponse.json(
          { error: "details_insert_failed", details: detailsError.message },
          { status: 500 },
        );
      }
      // For workshops, create a single lesson from the provided start/end datetimes so it appears in the Lessons section
      try {
        // Build lesson from date + start_time/end_time
        const dateStr = workshopDetails.date;
        const timeStr = workshopDetails.start_time;
        const durationMinutes = calculateDuration(
          workshopDetails.start_time,
          workshopDetails.end_time,
        );

        const lessonPayload: any = {
          program_id: programData.id,
          location_id: (locationIds && locationIds.length > 0)
            ? locationIds[0]
            : null,
          // Use the program title as the lesson title for workshops
          title: program.title,
          date: dateStr,
          time: timeStr,
          duration_minutes: durationMinutes,
          teacher_id: teacherIds && teacherIds.length > 0
            ? teacherIds[0]
            : null,
        };

        if (schoolYearId) lessonPayload.school_year_id = schoolYearId;

        let { error: lessonError } = await supabase.from("lessons").insert(
          lessonPayload,
        );

        if (lessonError) {
          const msg = (lessonError as any)?.message
            ? String((lessonError as any).message)
            : "";
          if (msg.toLowerCase().includes("school_year_id") && schoolYearId) {
            const { school_year_id: _omit, ...retryPayload } = lessonPayload;
            const retry = await supabase.from("lessons").insert(retryPayload);
            lessonError = retry.error;
          }
        }

        if (lessonError) {
          console.error("Failed to create workshop lesson:", lessonError);
        } else {
          console.log("Created lesson for workshop", programData.id);
        }
      } catch (e) {
        console.error("Error creating workshop lesson:", e);
      }
    }

    // Insert a single location link for the program (we expect 1 location per program)
    if (locationIds && locationIds.length > 0) {
      if (locationIds.length > 1) {
        // Enforce single location policy: return error to the client
        console.warn(
          "Creation request contains multiple locationIds; reject to enforce single-location-per-program policy",
          { programId: programData.id, provided: locationIds },
        );
        return NextResponse.json({ error: "only_one_location_allowed" }, {
          status: 400,
        });
      }

      const locationInserts = [
        {
          program_id: programData.id,
          location_id: locationIds[0],
        },
      ];

      const { error: locError } = await supabase.from("program_locations")
        .insert(locationInserts);
      if (locError) {
        console.error("Program locations insert error:", locError);
        // Don't rollback, just log - locations are optional
      }
    }

    // Generate lessons automatically for group programs
    if (program.program_type === "group" && groupDetails) {
      // Use only the first location id if provided (one location per program)
      const locs = locationIds && locationIds.length > 0
        ? [locationIds[0]]
        : [];
      await generateLessonsForGroupProgram(
        supabase,
        programData.id,
        groupDetails,
        locs,
        program.title,
        teacherIds && teacherIds.length > 0 ? teacherIds[0] : null,
        schoolYearId,
      );
    }

    // Insert teacher assignments
    if (teacherIds && teacherIds.length > 0) {
      const teacherInserts = teacherIds.map((teacherId: string) => ({
        teacher_id: teacherId,
        program_id: programData.id,
        studio_id: program.studio_id,
        assigned_by: userId,
      }));

      const { error: teacherError } = await supabase.from("teacher_programs")
        .insert(teacherInserts);
      if (teacherError) {
        console.error("Teacher assignments insert error:", teacherError);
        // Don't rollback, just log - teacher assignments are optional
      }
    }

    // Auto-sync to Stripe if studio has Stripe Connect configured
    // This runs in background and doesn't block the response
    autoSyncProgramToStripe(
      programData.id,
      program.studio_id,
      program.title,
      program.description,
      program.price,
    ).then((result) => {
      if (result.success) {
        console.log(
          `[Auto-sync] Successfully synced program ${programData.id} to Stripe`,
        );
      } else if (result.error) {
        console.warn(
          `[Auto-sync] Failed to sync program ${programData.id}:`,
          result.error,
        );
      }
    });

    // Best-effort: notify users who follow this studio when a new public program is created
    // (do not block the response)
    try {
      if (program?.is_public ?? true) {
        (async () => {
          const { data, error } = await supabase
            .from("user_followed_studios")
            .select("user_id")
            .eq("studio_id", program.studio_id)
            .neq("user_id", userId);

          if (error) {
            console.warn("Failed to load studio followers for push", error);
            return;
          }

          const followerIds = (data || [])
            .map((r: any) => r?.user_id)
            .filter(Boolean);

          if (followerIds.length === 0) return;

          // Load per-user preferences in one go (missing row = defaults)
          const { data: prefsRows } = await supabase
            .from('user_notification_preferences')
            .select('user_id, disable_all, new_programs_scope, new_programs_channel')
            .in('user_id', followerIds);

          const prefByUser = new Map<string, any>();
          for (const row of (prefsRows || []) as any[]) {
            if (row?.user_id) prefByUser.set(row.user_id, row);
          }

          const inAppOnlyIds: string[] = [];
          const pushIds: string[] = [];

          for (const followerId of followerIds) {
            const pref = prefByUser.get(followerId) || {};
            if (pref?.disable_all) continue;
            const scope = String(pref?.new_programs_scope || 'all');
            const channel = String(pref?.new_programs_channel || 'push');
            if (scope === 'workshops' && String(program.program_type) !== 'workshop') continue;
            if (channel === 'none') continue;
            if (channel === 'in_app') {
              inAppOnlyIds.push(followerId);
            } else {
              // 'push' => push + in-app
              pushIds.push(followerId);
            }
          }

          if (inAppOnlyIds.length > 0) {
            const result = await createNotificationsAndPush({
              userIds: inAppOnlyIds,
              type: "announcement",
              title: "Nieuw programma",
              message: `${program.title}`,
              action_type: "view_program",
              action_data: { program_id: programData.id, studio_id: program.studio_id },
              url: `/program/${programData.id}`,
              channels: { inApp: true, push: false },
            });
            if (!result.ok) console.warn("Notify followers (in-app) failed", result);
          }

          if (pushIds.length > 0) {
            const result = await createNotificationsAndPush({
              userIds: pushIds,
              type: "announcement",
              title: "Nieuw programma",
              message: `${program.title}`,
              action_type: "view_program",
              action_data: { program_id: programData.id, studio_id: program.studio_id },
              url: `/program/${programData.id}`,
              channels: { inApp: true, push: true },
            });
            if (!result.ok) console.warn("Notify followers (push) failed", result);
          }
        })().catch((e) => {
          console.warn("Unexpected error notifying followers", e);
        });
      }
    } catch (e) {
      console.warn("Unexpected error preparing follower push", e);
    }

    return NextResponse.json({ program: programData });
  } catch (err: any) {
    console.error("Server program create error", err);
    return NextResponse.json(
      { error: "server_error", details: err?.message || String(err) },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const {
      access_token,
      programId,
      program,
      groupDetails,
      workshopDetails,
      locationIds,
      teacherIds,
    } = body;

    if (!access_token || !programId) {
      return NextResponse.json({ error: "missing_required_fields" }, {
        status: 400,
      });
    }

    const supabase = createClient(
      SUPABASE_URL || "",
      SUPABASE_SERVICE_ROLE || "",
    );

    // Validate token
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        apikey: SUPABASE_SERVICE_ROLE || "",
      },
    });

    if (!userResp.ok) {
      return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }

    const userData = await userResp.json();
    const userId = userData?.id;

    if (!userId) {
      return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }

    // Verify user is studio_admin for this studio OR is the studio owner
    const { data: userRole, error: roleError } = await supabase
      .from("user_roles")
      .select("role, studio_id")
      .eq("user_id", userId)
      .eq("role", "studio_admin")
      .eq("studio_id", program.studio_id)
      .maybeSingle();

    // Also check if user is the studio owner
    const { data: studioOwner, error: ownerError } = await supabase
      .from("studios")
      .select("eigenaar_id")
      .eq("id", program.studio_id)
      .maybeSingle();

    console.log("Authorization check (PUT):", {
      userId,
      studioId: program.studio_id,
      userRole,
      roleError,
      studioOwner,
      ownerError,
      isOwner: studioOwner?.eigenaar_id === userId,
    });

    const isAuthorized = userRole ||
      (studioOwner && studioOwner.eigenaar_id === userId);

    // Also allow studio members with admin role stored in studio_members
    const { data: studioMember, error: studioMemberError } = await supabase
      .from("studio_members")
      .select("role")
      .eq("studio_id", program.studio_id)
      .eq("user_id", userId)
      .maybeSingle();

    const memberIsAdmin = studioMember &&
      ["owner", "admin", "studio_admin"].includes(String(studioMember.role));
    const finalAuthorized = isAuthorized || memberIsAdmin;

    if (!finalAuthorized) {
      return NextResponse.json({ error: "unauthorized" }, { status: 403 });
    }

    // Snapshot current schedule/location so we can notify enrolled users if something important changes.
    const [{ data: prevProgram }, { data: prevGroup }, { data: prevWorkshop }, { data: prevLocations }] =
      await Promise.all([
        supabase
          .from('programs')
          .select('id,title,program_type,weekday,start_time,end_time')
          .eq('id', programId)
          .maybeSingle(),
        supabase
          .from('group_details')
          .select('weekday,start_time,end_time,season_start,season_end')
          .eq('program_id', programId)
          .maybeSingle(),
        supabase
          .from('workshop_details')
          .select('date,start_time,end_time')
          .eq('program_id', programId)
          .maybeSingle(),
        supabase
          .from('program_locations')
          .select('location_id')
          .eq('program_id', programId),
      ]);

    const waitlistEnabled = !!program?.waitlist_enabled &&
      typeof program?.capacity === "number" &&
      program.capacity > 0;

    // Update program
    const { error: programError } = await supabase
      .from("programs")
      .update({
        accepts_class_passes: program.accepts_class_passes ?? false,
        class_pass_product_id: program.class_pass_product_id || null,
        is_trial: program.is_trial ?? false,
        title: program.title,
        description: program.description || null,
        dance_style: program.dance_style || null,
        level: program.level || null,
        capacity: program.capacity || null,
        waitlist_enabled: waitlistEnabled,
        price: program.price || null,
        min_age: program.min_age || null,
        max_age: program.max_age || null,
        is_public: program.is_public ?? true,
        accepts_payment: program.accepts_payment ?? false,
        linked_form_id: program.linked_form_id ?? null,
        linked_trial_program_id: program.linked_trial_program_id ?? null,
        show_capacity_to_users: program.show_capacity_to_users ?? true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", programId);

    if (programError) {
      console.error("Program update error:", programError);
      return NextResponse.json(
        { error: "program_update_failed", details: programError.message },
        { status: 500 },
      );
    }

    // Update type-specific details
    if (program.program_type === "group" && groupDetails) {
      // Delete old details
      await supabase.from("group_details").delete().eq("program_id", programId);

      // Insert new details
      const { error: detailsError } = await supabase
        .from("group_details")
        .insert({
          program_id: programId,
          weekday: groupDetails.weekday,
          start_time: groupDetails.start_time,
          end_time: groupDetails.end_time,
          season_start: groupDetails.season_start || null,
          season_end: groupDetails.season_end || null,
        });

      if (detailsError) {
        console.error("Group details update error:", detailsError);
        return NextResponse.json(
          { error: "details_update_failed", details: detailsError.message },
          { status: 500 },
        );
      }

      // Mirror schedule fields into programs table so UIs can read them when
      // direct SELECT on group_details is not permitted by RLS for the caller.
      try {
        const { error: progUpdateErr } = await supabase
          .from("programs")
          .update({
            weekday: groupDetails.weekday,
            start_time: groupDetails.start_time,
            end_time: groupDetails.end_time,
          })
          .eq("id", programId);
        if (progUpdateErr) {
          console.warn(
            "Failed to update programs schedule columns after updating group_details",
            progUpdateErr,
          );
        }
      } catch (e) {
        console.warn(
          "Unexpected error updating program schedule columns (PUT)",
          e,
        );
      }
    } else if (program.program_type === "workshop" && workshopDetails) {
      // Delete old details
      await supabase.from("workshop_details").delete().eq(
        "program_id",
        programId,
      );
      // Insert new details (date + times)
      const { error: detailsError } = await supabase
        .from("workshop_details")
        .insert({
          program_id: programId,
          date: workshopDetails.date,
          start_time: workshopDetails.start_time,
          end_time: workshopDetails.end_time,
        });

      if (detailsError) {
        console.error("Workshop details update error:", detailsError);
        return NextResponse.json(
          { error: "details_update_failed", details: detailsError.message },
          { status: 500 },
        );
      }

      // Update any linked lessons for this workshop program to match the new schedule
      try {
        const newDate = workshopDetails.date;
        const newTime = workshopDetails.start_time;
        const newDuration = calculateDuration(
          workshopDetails.start_time,
          workshopDetails.end_time,
        );

        const { error: updateLessonsError } = await supabase
          .from("lessons")
          .update({
            date: newDate,
            time: newTime,
            duration_minutes: newDuration,
            teacher_id: teacherIds && teacherIds.length > 0
              ? teacherIds[0]
              : null,
          })
          .eq("program_id", programId);

        if (updateLessonsError) {
          console.warn(
            "Failed to update linked lessons for workshop program",
            programId,
            updateLessonsError,
          );
        } else {
          console.log("Updated linked lessons for workshop program", programId);
        }
      } catch (e) {
        console.error(
          "Error updating linked lessons for workshop program",
          programId,
          e,
        );
      }
    }

    // Update location links - enforce single-location-per-program
    await supabase.from("program_locations").delete().eq(
      "program_id",
      programId,
    );

    if (locationIds && locationIds.length > 0) {
      if (locationIds.length > 1) {
        console.warn(
          "Update request contains multiple locationIds; reject to enforce single-location-per-program policy",
          { programId, provided: locationIds },
        );
        return NextResponse.json({ error: "only_one_location_allowed" }, {
          status: 400,
        });
      }

      const locationInserts = [
        {
          program_id: programId,
          location_id: locationIds[0],
        },
      ];

      await supabase.from("program_locations").insert(locationInserts);
    }

    // Regenerate lessons for group programs when schedule changes
    if (program.program_type === "group" && groupDetails) {
      // Delete existing lessons
      await supabase.from("lessons").delete().eq("program_id", programId);

      // Generate new lessons
      await generateLessonsForGroupProgram(
        supabase,
        programId,
        groupDetails,
        locationIds || [],
        program.title,
        teacherIds && teacherIds.length > 0 ? teacherIds[0] : null,
      );
    }

    // Update teacher assignments
    // Delete old assignments
    await supabase.from("teacher_programs").delete().eq(
      "program_id",
      programId,
    );

    // Insert new assignments
    if (teacherIds && teacherIds.length > 0) {
      const teacherInserts = teacherIds.map((teacherId: string) => ({
        teacher_id: teacherId,
        program_id: programId,
        studio_id: program.studio_id,
        assigned_by: userId,
      }));

      const { error: teacherError } = await supabase.from("teacher_programs")
        .insert(teacherInserts);
      if (teacherError) {
        console.error("Teacher assignments update error:", teacherError);
        // Don't fail the whole request, just log
      }
    }

    // Best-effort: notify enrolled users if schedule/location changed
    try {
      const prevLocIds = ((prevLocations as any[]) || []).map((r) => r?.location_id).filter(Boolean);
      const nextLocIds = (locationIds && locationIds.length > 0) ? [locationIds[0]] : [];
      const locationChanged = JSON.stringify(prevLocIds.sort()) !== JSON.stringify(nextLocIds.sort());

      let scheduleChanged = false;
      if (program.program_type === 'group' && groupDetails) {
        const a = prevGroup || prevProgram || {};
        const b = groupDetails || {};
        scheduleChanged =
          String((a as any)?.weekday ?? '') !== String((b as any)?.weekday ?? '') ||
          String((a as any)?.start_time ?? '') !== String((b as any)?.start_time ?? '') ||
          String((a as any)?.end_time ?? '') !== String((b as any)?.end_time ?? '') ||
          String((a as any)?.season_start ?? '') !== String((b as any)?.season_start ?? '') ||
          String((a as any)?.season_end ?? '') !== String((b as any)?.season_end ?? '')
      } else if (program.program_type === 'workshop' && workshopDetails) {
        const a = prevWorkshop || {};
        const b = workshopDetails || {};
        scheduleChanged =
          String((a as any)?.date ?? '') !== String((b as any)?.date ?? '') ||
          String((a as any)?.start_time ?? '') !== String((b as any)?.start_time ?? '') ||
          String((a as any)?.end_time ?? '') !== String((b as any)?.end_time ?? '')
      }

      if (scheduleChanged || locationChanged) {
        (async () => {
          const { data: enrollRows, error: enrollErr } = await supabase
            .from('inschrijvingen')
            .select('user_id')
            .eq('program_id', programId)
            .eq('status', 'actief');

          if (enrollErr) {
            console.warn('Failed to load enrolled users for program update notify', enrollErr);
            return;
          }

          const enrolledIds = Array.from(new Set((enrollRows || [])
            .map((r: any) => r?.user_id)
            .filter((id: any) => !!id && id !== userId)));

          if (enrolledIds.length === 0) return;

          const { data: prefsRows } = await supabase
            .from('user_notification_preferences')
            .select('user_id, disable_all, program_updates_channel')
            .in('user_id', enrolledIds);

          const prefByUser = new Map<string, any>();
          for (const row of (prefsRows || []) as any[]) {
            if (row?.user_id) prefByUser.set(row.user_id, row);
          }

          const inAppOnlyIds: string[] = [];
          const pushIds: string[] = [];

          for (const enrolledId of enrolledIds) {
            const pref = prefByUser.get(enrolledId) || {};
            if (pref?.disable_all) continue;
            const channel = String(pref?.program_updates_channel || 'push');
            if (channel === 'none') continue;
            if (channel === 'in_app') inAppOnlyIds.push(enrolledId);
            else pushIds.push(enrolledId);
          }

          const parts: string[] = [];
          if (scheduleChanged) parts.push('tijd/datum');
          if (locationChanged) parts.push('locatie');
          const changedText = parts.length > 0 ? parts.join(' en ') : 'details';

          const title = 'Programma gewijzigd';
          const message = `${program.title} werd aangepast (${changedText}).`;

          if (inAppOnlyIds.length > 0) {
            const result = await createNotificationsAndPush({
              userIds: inAppOnlyIds,
              type: 'info',
              title,
              message,
              action_type: 'view_program',
              action_data: { program_id: programId, studio_id: program.studio_id },
              url: `/program/${programId}`,
              channels: { inApp: true, push: false },
            });
            if (!result.ok) console.warn('Notify enrolled (in-app) failed', result);
          }

          if (pushIds.length > 0) {
            const result = await createNotificationsAndPush({
              userIds: pushIds,
              type: 'info',
              title,
              message,
              action_type: 'view_program',
              action_data: { program_id: programId, studio_id: program.studio_id },
              url: `/program/${programId}`,
              channels: { inApp: true, push: true },
            });
            if (!result.ok) console.warn('Notify enrolled (push) failed', result);
          }
        })().catch((e) => console.warn('Unexpected error notifying enrolled users', e));
      }
    } catch (e) {
      console.warn('Unexpected error preparing enrolled-user notifications', e);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Server program update error", err);
    return NextResponse.json(
      { error: "server_error", details: err?.message || String(err) },
      { status: 500 },
    );
  }
}

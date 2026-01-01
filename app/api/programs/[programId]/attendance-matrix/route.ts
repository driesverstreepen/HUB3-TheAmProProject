import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.warn("Missing Supabase env for attendance-matrix endpoint");
}

export async function GET(req: any, context: any) {
  // context.params can be an object or a Promise depending on Next internals
  const rawParams = context?.params;
  const resolvedParams = rawParams && typeof rawParams.then === "function"
    ? await rawParams
    : rawParams;
  const programId = resolvedParams?.programId;
  try {
    if (!programId) {
      return NextResponse.json({ error: "missing_program_id" }, {
        status: 400,
      });
    }

    // Expect a bearer token from the client to validate studio_admin rights
    const authHeader = (req.headers && typeof req.headers.get === "function")
      ? req.headers.get("authorization") || ""
      : (req.headers?.authorization || "");
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.replace("Bearer ", "")
      : null;

    if (!token) {
      return NextResponse.json({ error: "missing_access_token" }, {
        status: 401,
      });
    }

    const supabase = createClient(
      SUPABASE_URL || "",
      SUPABASE_SERVICE_ROLE || "",
    );

    // Validate token to get user id
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
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

    // Fetch program to get studio_id and title
    const { data: programRow, error: programError } = await supabase
      .from("programs")
      .select("id, studio_id, title")
      .eq("id", programId)
      .maybeSingle();

    if (programError) {
      console.error(
        "Error fetching program for attendance matrix",
        programError,
      );
      return NextResponse.json({ error: "program_fetch_failed" }, {
        status: 500,
      });
    }

    if (!programRow) {
      return NextResponse.json({ error: "program_not_found" }, { status: 404 });
    }

    // Check authorization: accept several role names used across the app
    // (some places use 'studio_admin', others 'admin' or 'owner')
    let isAuthorized = false;
    try {
      const { data: userRoles, error: urErr } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("studio_id", programRow.studio_id);

      if (!urErr && Array.isArray(userRoles) && userRoles.length > 0) {
        const allowed = new Set(["studio_admin", "admin", "owner"]);
        for (const r of userRoles) {
          if (r && allowed.has(String((r as any).role))) {
            isAuthorized = true;
            break;
          }
        }
      }
    } catch (e) {
      // ignore and fall back to owner check
    }

    const { data: studioOwner } = await supabase
      .from("studios")
      .select("eigenaar_id")
      .eq("id", programRow.studio_id)
      .maybeSingle();

    if (!isAuthorized && studioOwner && studioOwner.eigenaar_id === userId) {
      isAuthorized = true;
    }
    // If still not authorized, check `studio_members` table for admin role
    if (!isAuthorized) {
      try {
        const { data: memberRow, error: memberErr } = await supabase
          .from("studio_members")
          .select("role")
          .eq("user_id", userId)
          .eq("studio_id", programRow.studio_id)
          .maybeSingle();

        if (
          !memberErr && memberRow && typeof (memberRow as any).role === "string"
        ) {
          const mrole = String((memberRow as any).role);
          if (
            mrole === "admin" || mrole === "owner" || mrole === "studio_admin"
          ) {
            isAuthorized = true;
          }
        }
      } catch (e) {
        // ignore errors and keep not authorized
      }
    }
    if (!isAuthorized) {
      return NextResponse.json({ error: "unauthorized" }, { status: 403 });
    }

    // Fetch lessons for the program
    const { data: lessons = [], error: lessonsError } = await supabase
      .from("lessons")
      .select("id, date, time, title")
      .eq("program_id", programId)
      .order("date", { ascending: true });

    if (lessonsError) {
      console.error(
        "Error fetching lessons for attendance matrix",
        lessonsError,
      );
      return NextResponse.json({ error: "lessons_fetch_failed" }, {
        status: 500,
      });
    }

    // Fetch enrollments (inschrijvingen) for the program
    const { data: enrollments, error: enrollmentsError } = await supabase
      .from("inschrijvingen")
      .select("id, user_id, sub_profile_id, profile_snapshot")
      .eq("program_id", programId)
      .eq("status", "confirmed");

    if (enrollmentsError) {
      console.error(
        "Error fetching enrollments for attendance matrix",
        enrollmentsError,
      );
      return NextResponse.json({ error: "enrollments_fetch_failed" }, {
        status: 500,
      });
    }

    // If no enrollments with status 'confirmed' were found, try a fallback without status filter
    let effectiveEnrollments = enrollments || [];
    if ((effectiveEnrollments || []).length === 0) {
      try {
        const { data: anyEnrollments = [] } = await supabase
          .from("inschrijvingen")
          .select("id, user_id, sub_profile_id, profile_snapshot")
          .eq("program_id", programId);
        effectiveEnrollments = anyEnrollments || [];
        if ((effectiveEnrollments || []).length > 0) {
          console.warn(
            `Attendance matrix: no 'confirmed' enrollments found; falling back to ${effectiveEnrollments.length} enrollments without status filter`,
          );
        }
      } catch (e) {
        // ignore fallback error; we'll proceed with empty enrollments
      }
    }

    const lessonIds = (lessons || []).map((l: any) => l.id);

    // Fetch attendances and absences for these lessons
    let attendanceRows: any[] = [];
    let absenceRows: any[] = [];
    if (lessonIds.length > 0) {
      const { data: aRows = [], error: aErr } = await supabase
        .from("lesson_attendances")
        .select("id, lesson_id, enrollment_id, user_id, status")
        .in("lesson_id", lessonIds);

      if (aErr) {
        console.error("Error fetching lesson_attendances", aErr);
        // serialize supabase error safely
        let supaErr: any = null;
        try {
          supaErr = JSON.parse(JSON.stringify(aErr));
        } catch {
          supaErr = String(aErr);
        }
        return NextResponse.json({
          error: "attendance_fetch_failed",
          details: aErr?.message || String(aErr),
          supabase_error: supaErr,
          debug: {
            lessonCount: lessonIds.length,
            enrollmentCount: (enrollments || []).length,
          },
        }, { status: 500 });
      }
      attendanceRows = aRows || [];

      const { data: absRows = [], error: absErr } = await supabase
        .from("lesson_absences")
        .select("id, lesson_id, enrollment_id, user_id, reason, created_at")
        .in("lesson_id", lessonIds);

      if (absErr) {
        console.error("Error fetching lesson_absences", absErr);
        let supaErr: any = null;
        try {
          supaErr = JSON.parse(JSON.stringify(absErr));
        } catch {
          supaErr = String(absErr);
        }
        return NextResponse.json({
          error: "absences_fetch_failed",
          details: absErr?.message || String(absErr),
          supabase_error: supaErr,
          debug: {
            lessonCount: lessonIds.length,
            enrollmentCount: (enrollments || []).length,
          },
        }, { status: 500 });
      }
      absenceRows = absRows || [];
    }

    // Build student list and maps
    // Build students list using profile_snapshot from enrollments
    const students = (effectiveEnrollments || []).map((e: any) => {
      const snapshot = e.profile_snapshot || {};
      let name: string | null = null;

      // Extract name from profile_snapshot (can have various field names)
      const fn =
        (snapshot.first_name || snapshot.voornaam || snapshot.firstName || "")
          .toString().trim();
      const ln =
        (snapshot.last_name || snapshot.achternaam || snapshot.lastName || "")
          .toString().trim();
      if (fn || ln) name = `${fn} ${ln}`.trim();
      if (!name && snapshot.display_name) name = snapshot.display_name;
      if (!name && (snapshot.full_name || snapshot.name)) {
        name = (snapshot.full_name || snapshot.name).toString().trim();
      }
      if (!name && snapshot.email) name = snapshot.email;

      return {
        enrollment_id: e.id,
        user_id: e.user_id,
        name: name || e.user_id,
      };
    });

    // If profiles were empty or names still unresolved, try fetching from auth (service role)
    const unresolved = students.filter((s) => s.name === s.user_id);
    const fallbackUsers: any[] = [];
    if (unresolved.length > 0) {
      try {
        for (const s of unresolved) {
          try {
            // Use Supabase Admin API to fetch user metadata (requires service role key)
            // supabase.auth.admin.getUserById returns { data: { user }, error }
            // guard in case the client library doesn't expose admin API
            // @ts-ignore
            const adminGet = supabase?.auth?.admin?.getUserById;
            if (typeof adminGet === "function") {
              // @ts-ignore
              const { data: userData, error: userErr } = await supabase.auth
                .admin.getUserById(s.user_id);
              if (!userErr && userData && userData.user) {
                const u = userData.user;
                const meta = u.user_metadata || {};
                let fbName: string | null = null;
                const fn =
                  (meta.first_name || meta.voornaam || meta.firstName || "")
                    .toString().trim();
                const ln =
                  (meta.last_name || meta.achternaam || meta.lastName || "")
                    .toString().trim();
                if (fn || ln) fbName = `${fn} ${ln}`.trim();
                if (!fbName && (meta.full_name || meta.name)) {
                  fbName = meta.full_name || meta.name;
                }
                if (!fbName && u.email) fbName = u.email;
                if (fbName) {
                  // apply fallback
                  const found = students.find((x) => x.user_id === s.user_id);
                  if (found) found.name = fbName;
                }
                fallbackUsers.push({
                  id: u.id,
                  email: u.email,
                  user_metadata: meta,
                });
              }
            }
          } catch (e) {
            // ignore per-user errors
          }
        }
      } catch (e) {
        // ignore fallback errors
      }
    }

    // Build attendance matrix: lessonId -> enrollmentId -> { status, source, updated_at }
    const attendance: Record<string, Record<string, any>> = {};
    for (const lesson of (lessons || [])) {
      attendance[lesson.id] = {};
    }

    // Build map user_id -> enrollments
    const enrollmentsByUser: Record<string, any[]> = {};
    for (const e of (effectiveEnrollments || [])) {
      if (!e || !e.user_id) continue;
      enrollmentsByUser[String(e.user_id)] =
        enrollmentsByUser[String(e.user_id)] || [];
      enrollmentsByUser[String(e.user_id)].push(e);
    }

    function isMainEnrollment(enrollment: any) {
      // Prefer explicit column on enrollment if present
      if (enrollment && enrollment.sub_profile_id) return false;

      const snap = enrollment?.profile_snapshot || {};
      // heuristics: subaccounts often have sub_profile_id or indicate dependent flags
      const indicators = [
        "sub_profile_id",
        "sub_profile",
        "dependent",
        "is_dependent",
        "parent_profile_id",
      ];
      for (const k of indicators) {
        if (snap && Object.prototype.hasOwnProperty.call(snap, k)) return false;
      }
      return true;
    }

    // Apply absences first (mark as absent), then overwrite with attendances if present
    // Build a quick set of known enrollment ids for this program
    const knownEnrollmentIds = new Set(
      (effectiveEnrollments || []).map((e: any) => String(e.id)),
    );

    for (const abs of absenceRows) {
      if (!attendance[abs.lesson_id]) continue;
      const record = {
        status: "absent",
        source: "absence",
        reason: abs.reason || null,
        updated_at: abs.created_at || null,
      };

      // If the attendance references an enrollment that we know about, apply to that enrollment
      if (
        abs.enrollment_id && knownEnrollmentIds.has(String(abs.enrollment_id))
      ) {
        attendance[abs.lesson_id][String(abs.enrollment_id)] = record;
        continue;
      }

      // If attendance references a different enrollment_id (unknown), try mapping by user_id
      if (
        abs.enrollment_id &&
        !knownEnrollmentIds.has(String(abs.enrollment_id)) && abs.user_id
      ) {
        const userEnrolls = enrollmentsByUser[String(abs.user_id)] || [];
        if (userEnrolls.length === 1) {
          attendance[abs.lesson_id][String(userEnrolls[0].id)] = record;
          continue;
        } else if (userEnrolls.length > 1) {
          const main = userEnrolls.find(isMainEnrollment) || userEnrolls[0];
          attendance[abs.lesson_id][String(main.id)] = record;
          continue;
        }
      }

      if (abs.user_id) {
        const userEnrolls = enrollmentsByUser[String(abs.user_id)] || [];
        if (userEnrolls.length === 1) {
          attendance[abs.lesson_id][String(userEnrolls[0].id)] = record;
        } else if (userEnrolls.length > 1) {
          const main = userEnrolls.find(isMainEnrollment) || userEnrolls[0];
          attendance[abs.lesson_id][String(main.id)] = record;
        } else {
          // no matching enrollment, store under user key
          attendance[abs.lesson_id][String(abs.user_id)] = record;
        }
        continue;
      }

      attendance[abs.lesson_id]["unknown"] = record;
    }

    for (const att of attendanceRows) {
      if (!attendance[att.lesson_id]) continue;
      const record = {
        status: att.status || "present",
        source: "attendance",
        updated_at: att.updated_at || null,
      };

      // If the enrollment_id is known, apply to that enrollment only
      if (
        att.enrollment_id && knownEnrollmentIds.has(String(att.enrollment_id))
      ) {
        attendance[att.lesson_id][String(att.enrollment_id)] = record;
        continue;
      }

      // enrollment_id provided but unknown for this program: map using user_id if available
      if (
        att.enrollment_id &&
        !knownEnrollmentIds.has(String(att.enrollment_id)) && att.user_id
      ) {
        const userEnrolls = enrollmentsByUser[String(att.user_id)] || [];
        if (userEnrolls.length === 1) {
          attendance[att.lesson_id][String(userEnrolls[0].id)] = record;
          continue;
        } else if (userEnrolls.length > 1) {
          const main = userEnrolls.find(isMainEnrollment) || userEnrolls[0];
          attendance[att.lesson_id][String(main.id)] = record;
          continue;
        }
      }

      if (att.user_id) {
        const userEnrolls = enrollmentsByUser[String(att.user_id)] || [];
        if (userEnrolls.length === 1) {
          attendance[att.lesson_id][String(userEnrolls[0].id)] = record;
        } else if (userEnrolls.length > 1) {
          const main = userEnrolls.find(isMainEnrollment) || userEnrolls[0];
          attendance[att.lesson_id][String(main.id)] = record;
        } else {
          attendance[att.lesson_id][String(att.user_id)] = record;
        }
        continue;
      }

      attendance[att.lesson_id]["unknown"] = record;
    }

    const resp: any = {
      program: {
        id: programRow.id,
        title: programRow.title,
        studio_id: programRow.studio_id,
      },
      lessons,
      students,
      attendance,
      enrollments_count: (effectiveEnrollments || []).length,
    };

    // Include raw debug info only in development to avoid leaking data in production
    if (process.env.NODE_ENV === "development") {
      const studentEnrollmentIds = (students || []).map((s: any) =>
        s.enrollment_id
      );
      const studentUserIds = (students || []).map((s: any) => s.user_id);
      const attendanceKeys = new Set<string>();
      for (const a of (attendanceRows || [])) {
        if (a.enrollment_id) attendanceKeys.add(String(a.enrollment_id));
        if (a.user_id) attendanceKeys.add(String(a.user_id));
      }
      resp.debug = {
        enrollments: effectiveEnrollments || [],
        enrollments_with_snapshots: (effectiveEnrollments || []).map((
          e: any,
        ) => ({
          id: e.id,
          user_id: e.user_id,
          profile_snapshot: e.profile_snapshot,
        })),
        attendanceRows: attendanceRows || [],
        absenceRows: absenceRows || [],
        studentEnrollmentIds,
        studentUserIds,
        attendanceKeys: Array.from(attendanceKeys),
      };
    }

    return NextResponse.json(resp);
  } catch (err: any) {
    console.error("Attendance matrix route error:", err);
    console.error("Error stack:", err?.stack);
    console.error("Error details:", {
      message: err?.message,
      name: err?.name,
      programId: resolvedParams?.programId,
    });
    return NextResponse.json({
      error: "server_error",
      details: err?.message || String(err),
    }, { status: 500 });
  }
}

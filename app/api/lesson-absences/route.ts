import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * POST /api/lesson-absences
 * Body: { lesson_id: string, reason?: string }
 * Requires authentication; records an absence for the current user for the given lesson.
 *
 * DELETE /api/lesson-absences?lesson_id=...
 * Requires authentication; removes the absence record for the current user for the given lesson.
 *
 * GET /api/lesson-absences?user_id=...&lesson_ids=id1,id2
 * Returns the absences for the specified user/lessons.
 */
export async function POST(request: Request) {
  try {
    // Get the authorization token from the header
    const authHeader = request.headers.get("authorization") ||
      request.headers.get("Authorization");
    const token = authHeader?.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return NextResponse.json({ error: "Missing authentication token" }, {
        status: 401,
      });
    }

    // Create a Supabase client that includes the user's bearer token in requests
    // so RLS behaves as if the user is executing the queries.
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const body = await request.json();
    const { lesson_id, reason, enrollment_id } = body || {};

    if (!lesson_id) {
      return NextResponse.json({ error: "Missing lesson_id" }, { status: 400 });
    }

    // Get authenticated user
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return NextResponse.json({ error: "Invalid or expired token" }, {
        status: 401,
      });
    }
    const user = userData.user;

    const payload: any = {
      lesson_id,
      user_id: user.id,
      reason: reason || null,
    };

    // If an enrollment_id is provided, include it so absences are tracked per enrollment/sub-profile
    if (enrollment_id) payload.enrollment_id = enrollment_id;

    const { data, error } = await supabase
      .from("lesson_absences")
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ absence: data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || String(error) }, {
      status: 500,
    });
  }
}

export async function DELETE(request: Request) {
  try {
    // Get the authorization token from the header
    const authHeader = request.headers.get("authorization") ||
      request.headers.get("Authorization");
    const token = authHeader?.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return NextResponse.json({ error: "Missing authentication token" }, {
        status: 401,
      });
    }

    // Create a Supabase client that includes the user's bearer token in requests
    // so RLS behaves as if the user is executing the queries.
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const { searchParams } = new URL(request.url);
    const lessonId = searchParams.get("lesson_id");

    if (!lessonId) {
      return NextResponse.json({ error: "Missing lesson_id parameter" }, {
        status: 400,
      });
    }

    // Get authenticated user
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return NextResponse.json({ error: "Invalid or expired token" }, {
        status: 401,
      });
    }
    const user = userData.user;

    // Delete the absence record for this user and lesson
    // If an enrollment_id param is provided, delete by enrollment; otherwise delete by user_id
    const enrollmentIdParam = searchParams.get("enrollment_id");
    let delQuery = supabase.from("lesson_absences").delete()
      .eq("lesson_id", lessonId);

    if (enrollmentIdParam) {
      delQuery = delQuery.eq("enrollment_id", enrollmentIdParam);
    } else {
      delQuery = delQuery.eq("user_id", user.id);
    }

    const { error: delError } = await delQuery;
    if (delError) throw delError;

    return NextResponse.json({ message: "Absence removed successfully" }, {
      status: 200,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || String(error) }, {
      status: 500,
    });
  }
}

export async function GET(request: Request) {
  try {
    // Get the authorization token from the header
    const authHeader = request.headers.get("authorization") ||
      request.headers.get("Authorization");
    const token = authHeader?.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return NextResponse.json({ error: "Missing authentication token" }, {
        status: 401,
      });
    }

    // Default: user-context Supabase client (RLS enforced)
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    // Get authenticated user (in user-context)
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return NextResponse.json({ error: "Invalid or expired token" }, {
        status: 401,
      });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");
    const enrollmentId = searchParams.get("enrollment_id");
    const lessonIdsRaw = searchParams.get("lesson_ids");

    // Staff lookup: when the client asks only by lesson_ids (no user_id/enrollment_id),
    // teachers/studio admins should be able to fetch reported absences for their lessons.
    // RLS often prevents reading other users' absences, so we authorize explicitly here
    // and execute the read using the service role key.
    if (!userId && !enrollmentId && lessonIdsRaw) {
      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
        return NextResponse.json({
          error: "Server misconfigured (missing Supabase service role)",
        }, { status: 500 });
      }

      const ids = lessonIdsRaw.split(",").map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) {
        return NextResponse.json({ absences: [] });
      }

      // Validate token using Supabase Auth endpoint (service role)
      const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_SERVICE_ROLE,
        },
      });

      if (!userResp.ok) {
        return NextResponse.json({ error: "Invalid or expired token" }, {
          status: 401,
        });
      }

      const authUser = await userResp.json();
      const requesterId = authUser?.id;
      if (!requesterId) {
        return NextResponse.json({ error: "Invalid or expired token" }, {
          status: 401,
        });
      }

      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

      // Resolve lessons -> programs -> studios
      const { data: lessonRows, error: lessonErr } = await admin
        .from("lessons")
        .select("id, program_id")
        .in("id", ids);

      if (lessonErr) throw lessonErr;

      const programIds = Array.from(
        new Set(
          (lessonRows || []).map((r: any) => r?.program_id).filter(Boolean),
        ),
      );
      if (programIds.length === 0) {
        return NextResponse.json({ absences: [] });
      }

      const { data: programRows, error: programErr } = await admin
        .from("programs")
        .select("id, studio_id")
        .in("id", programIds);

      if (programErr) throw programErr;

      const studioIds = Array.from(
        new Set(
          (programRows || []).map((r: any) => r?.studio_id).filter(Boolean),
        ),
      );

      // Authorization: studio admin/member role OR assigned teacher for the program
      let allowedProgramIds = new Set<string>();

      // Program teachers
      const { data: tpRows, error: tpErr } = await admin
        .from("teacher_programs")
        .select("program_id")
        .eq("teacher_id", requesterId)
        .in("program_id", programIds);

      if (!tpErr) {
        (tpRows || []).forEach((r: any) => {
          if (r?.program_id) allowedProgramIds.add(String(r.program_id));
        });
      }

      // Studio members (admin roles)
      if (studioIds.length > 0) {
        const { data: smRows, error: smErr } = await admin
          .from("studio_members")
          .select("studio_id, role")
          .eq("user_id", requesterId)
          .in("studio_id", studioIds);

        if (!smErr && Array.isArray(smRows) && smRows.length > 0) {
          const allowedRoles = new Set(["owner", "admin", "studio_admin"]);
          const allowedStudios = new Set(
            smRows
              .filter((r: any) => r && allowedRoles.has(String(r.role)))
              .map((r: any) => String(r.studio_id)),
          );
          (programRows || []).forEach((p: any) => {
            if (
              p?.id && p?.studio_id && allowedStudios.has(String(p.studio_id))
            ) {
              allowedProgramIds.add(String(p.id));
            }
          });
        }
      }

      if (allowedProgramIds.size === 0) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }

      const allowedLessonIds = (lessonRows || [])
        .filter((l: any) =>
          l?.id && l?.program_id && allowedProgramIds.has(String(l.program_id))
        )
        .map((l: any) => String(l.id));

      if (allowedLessonIds.length === 0) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }

      const { data: absences, error: absErr } = await admin
        .from("lesson_absences")
        .select("*")
        .in("lesson_id", allowedLessonIds);

      if (absErr) throw absErr;

      return NextResponse.json({ absences: absences || [] });
    }

    // If an enrollment_id is provided, we prefer enrollment-specific rows.
    // However, existing (legacy) absence rows may have enrollment_id = NULL and only user_id filled.
    // To preserve UX for main-account enrollments created before the migration, if the requested
    // enrollment belongs to the main account (no sub_profile_id), include both:
    //  - rows where enrollment_id = provided id
    //  - rows where enrollment_id IS NULL AND user_id = auth.uid()
    // For sub-profile enrollments we only return rows matching enrollment_id to avoid leaking parent-only rows.
    let absencesData: any[] = [];

    if (enrollmentId) {
      // First, try to load the enrollment to check if it's a sub-profile enrollment
      const { data: enrollmentRow, error: enrollmentError } = await supabase
        .from("inschrijvingen")
        .select("id, user_id, sub_profile_id")
        .eq("id", enrollmentId)
        .maybeSingle();

      if (enrollmentError) {
        // If we can't read the enrollment (RLS or missing), fall back to only returning rows by enrollment_id
        const { data: onlyByEnrollment, error: onlyEnrollErr } = await supabase
          .from("lesson_absences")
          .select("*")
          .eq("enrollment_id", enrollmentId);

        if (onlyEnrollErr) throw onlyEnrollErr;
        absencesData = onlyByEnrollment || [];
      } else {
        const isSubProfileEnrollment =
          !!(enrollmentRow && enrollmentRow.sub_profile_id);
        if (isSubProfileEnrollment) {
          const { data: onlyByEnrollment, error: onlyEnrollErr } =
            await supabase
              .from("lesson_absences")
              .select("*")
              .eq("enrollment_id", enrollmentId);

          if (onlyEnrollErr) throw onlyEnrollErr;
          absencesData = onlyByEnrollment || [];
        } else {
          // main-account enrollment: include both enrollment-specific rows and legacy user-only rows
          const { data: byEnrollment, error: byEnrollErr } = await supabase
            .from("lesson_absences")
            .select("*")
            .eq("enrollment_id", enrollmentId);

          if (byEnrollErr) throw byEnrollErr;

          const { data: byUserLegacy, error: byUserErr } = await supabase
            .from("lesson_absences")
            .select("*")
            .is("enrollment_id", null)
            .eq("user_id", userData.user.id);

          if (byUserErr) throw byUserErr;

          // combine and dedupe by id
          const combined = [...(byEnrollment || []), ...(byUserLegacy || [])];
          const seen = new Set();
          absencesData = combined.filter((a: any) => {
            if (!a || !a.id) return false;
            if (seen.has(a.id)) return false;
            seen.add(a.id);
            return true;
          });
        }
      }
    } else if (userId) {
      const { data, error } = await supabase
        .from("lesson_absences")
        .select("*")
        .eq("user_id", userId);

      if (error) throw error;
      absencesData = data || [];
    } else {
      // No enrollment_id, user_id, or lesson_ids: return empty (avoid accidental broad reads).
      absencesData = [];
    }

    // If lesson_ids filter was provided, apply it client-side to the combined result
    if (lessonIdsRaw) {
      const ids = lessonIdsRaw.split(",").map((s) => s.trim()).filter(Boolean);
      if (ids.length > 0) {
        absencesData = absencesData.filter((a) =>
          ids.includes(String(a.lesson_id))
        );
      }
    }

    return NextResponse.json({ absences: absencesData });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || String(error) }, {
      status: 500,
    });
  }
}

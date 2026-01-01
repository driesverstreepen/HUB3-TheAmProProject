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

function isValidMonth(month: unknown) {
    return typeof month === "number" && Number.isInteger(month) && month >= 1 &&
        month <= 12;
}

function isValidYear(year: unknown) {
    return typeof year === "number" && Number.isInteger(year) && year >= 2000 &&
        year <= 2100;
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
            "studio.finance",
            { requireWrite: true },
        );
        if (!perm.allowed) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await request.json().catch(() => ({} as any));
        const teacherIdsRaw = (body as any)?.teacher_ids;
        const month = Number((body as any)?.month);
        const year = Number((body as any)?.year);
        const requestedSchoolYearId = (body as any)?.school_year_id
            ? String((body as any)?.school_year_id)
            : null;

        if (!Array.isArray(teacherIdsRaw) || teacherIdsRaw.length === 0) {
            return NextResponse.json({ error: "teacher_ids is required" }, {
                status: 400,
            });
        }

        if (!isValidMonth(month) || !isValidYear(year)) {
            return NextResponse.json({ error: "Invalid month/year" }, {
                status: 400,
            });
        }

        const teacherIds = teacherIdsRaw.map((t: any) => String(t)).filter(
            Boolean,
        );
        if (teacherIds.length === 0) {
            return NextResponse.json({ error: "teacher_ids is required" }, {
                status: 400,
            });
        }

        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);
        const startDateStr = startDate.toISOString().split("T")[0];
        const endDateStr = endDate.toISOString().split("T")[0];

        // Best-effort determine school_year_id (newer DBs require it on timesheets).
        let schoolYearId: string | null = null;
        try {
            if (requestedSchoolYearId) {
                const { data: y } = await supabaseAdmin
                    .from("studio_school_years")
                    .select("id")
                    .eq("studio_id", studioId)
                    .eq("id", requestedSchoolYearId)
                    .maybeSingle();
                if (y?.id) schoolYearId = String(y.id);
            }

            if (!schoolYearId) {
                const { data: active } = await supabaseAdmin
                    .from("studio_school_years")
                    .select("id")
                    .eq("studio_id", studioId)
                    .eq("is_active", true)
                    .maybeSingle();
                if (active?.id) schoolYearId = String(active.id);
            }
        } catch {
            // Table may not exist yet; fail open for older DBs.
            schoolYearId = null;
        }

        const created: any[] = [];
        const skipped: string[] = [];

        for (const teacherId of teacherIds) {
            // Skip if already exists
            const { data: existing, error: existingError } = await supabaseAdmin
                .from("timesheets")
                .select("id")
                .eq("studio_id", studioId)
                .eq("teacher_id", teacherId)
                .eq("month", month)
                .eq("year", year)
                .maybeSingle();

            if (existingError) {
                console.error(
                    "Error checking existing timesheet:",
                    existingError,
                );
                return NextResponse.json({
                    error: "Failed to check existing timesheet",
                }, { status: 500 });
            }

            if (existing?.id) {
                skipped.push(teacherId);
                continue;
            }

            const insertPayload: any = {
                studio_id: studioId,
                teacher_id: teacherId,
                month,
                year,
                status: "draft",
                created_by: user.id,
            };
            if (schoolYearId) insertPayload.school_year_id = schoolYearId;

            // Back-compat: if the DB doesn't have the column yet, retry without it.
            let timesheetRes = await supabaseAdmin
                .from("timesheets")
                .insert(insertPayload)
                .select("*")
                .single();

            if ((timesheetRes as any)?.error) {
                const msg = String((timesheetRes as any)?.error?.message || "");
                if (msg.toLowerCase().includes("school_year_id") && schoolYearId) {
                    const { school_year_id: _omit, ...retryPayload } = insertPayload;
                    timesheetRes = await supabaseAdmin
                        .from("timesheets")
                        .insert(retryPayload)
                        .select("*")
                        .single();
                }
            }

            const { data: timesheet, error: timesheetError } = timesheetRes as any;

            if (timesheetError || !timesheet) {
                console.error("Error creating timesheet:", timesheetError);
                return NextResponse.json({
                    error: "Failed to create timesheet",
                }, { status: 500 });
            }

            // Compensation (hourly + transport)
            const { data: compensation, error: compError } = await supabaseAdmin
                .from("teacher_compensation")
                .select("lesson_fee, transport_fee")
                .eq("studio_id", studioId)
                .eq("teacher_id", teacherId)
                .eq("active", true)
                .maybeSingle();

            if (compError) {
                console.error("Error loading teacher compensation:", compError);
            }

            const hourlyRate = Number((compensation as any)?.lesson_fee || 0);
            const transportFee = Number(
                (compensation as any)?.transport_fee || 0,
            );

            // Programs taught by teacher in this studio
            const { data: teacherPrograms, error: tpError } =
                await supabaseAdmin
                    .from("teacher_programs")
                    .select("program_id")
                    .eq("teacher_id", teacherId)
                    .eq("studio_id", studioId);

            if (tpError) {
                console.error("Error loading teacher programs:", tpError);
                // Still return the created timesheet, but without entries
                created.push(timesheet);
                continue;
            }

            const programIds = (teacherPrograms || []).map((row: any) =>
                row.program_id
            ).filter(Boolean);
            if (programIds.length === 0) {
                created.push(timesheet);
                continue;
            }

            // Lessons in month for those programs
            let lessonsQuery: any = supabaseAdmin
                .from("lessons")
                .select("id, program_id, date, duration_minutes")
                .in("program_id", programIds)
                .gte("date", startDateStr)
                .lte("date", endDateStr);

            if (schoolYearId) {
                lessonsQuery = lessonsQuery.eq("school_year_id", schoolYearId);
            }

            const { data: lessons, error: lessonsError } = await lessonsQuery;

            if (lessonsError) {
                console.error("Error loading lessons:", lessonsError);
                created.push(timesheet);
                continue;
            }

            const entries = (lessons || []).map((lesson: any) => {
                const durationMinutes = Number(lesson.duration_minutes || 60);
                return {
                    timesheet_id: timesheet.id,
                    lesson_id: lesson.id,
                    program_id: lesson.program_id,
                    date: lesson.date,
                    duration_minutes: durationMinutes,
                    // teacher_compensation.lesson_fee is an hourly rate; store per-lesson amount on entry
                    lesson_fee: hourlyRate * (durationMinutes / 60),
                    transport_fee: transportFee,
                    is_manual: false,
                };
            });

            if (entries.length > 0) {
                const { error: entriesError } = await supabaseAdmin
                    .from("timesheet_entries")
                    .insert(entries);

                if (entriesError) {
                    console.error(
                        "Error inserting timesheet entries:",
                        entriesError,
                    );
                    return NextResponse.json({
                        error: "Failed to create timesheet entries",
                    }, { status: 500 });
                }
            }

            created.push(timesheet);
        }

        return NextResponse.json({ created, skipped });
    } catch (err) {
        console.error("Error in timesheets POST:", err);
        return NextResponse.json({ error: "Internal server error" }, {
            status: 500,
        });
    }
}

export async function GET(
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
            "studio.finance",
        );
        if (!perm.allowed) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const url = new URL(request.url);
        const schoolYearId = url.searchParams.get("schoolYearId") || null;

        const fetchTimesheets = async (withSchoolYearFilter: boolean) => {
            let q: any = supabaseAdmin
                .from("timesheets")
                .select(
                    "id, studio_id, teacher_id, month, year, status, created_at, confirmed_at, notes",
                )
                .eq("studio_id", studioId)
                .order("year", { ascending: false })
                .order("month", { ascending: false });

            if (withSchoolYearFilter && schoolYearId) {
                q = q.eq("school_year_id", schoolYearId);
            }

            return await q;
        };

        let tsRes: any = await fetchTimesheets(true);
        if (tsRes?.error) {
            const msg = String(tsRes?.error?.message || "");
            if (msg.toLowerCase().includes("school_year_id") && schoolYearId) {
                tsRes = await fetchTimesheets(false);
            }
        }

        const { data: timesheets, error: tsError } = tsRes as any;

        if (tsError) {
            console.error("Error loading timesheets (admin):", tsError);
            return NextResponse.json({ error: "Failed to load timesheets" }, {
                status: 500,
            });
        }

        const timesheetList: any[] = timesheets || [];
        const teacherIds = Array.from(
            new Set(timesheetList.map((t) => t.teacher_id).filter(Boolean)),
        );

        // Fetch teachers (guard empty IN lists)
        let teacherMap: Record<string, any> = {};
        if (teacherIds.length > 0) {
            const { data: teachers, error: teachersError } = await supabaseAdmin
                .from("user_profiles")
                .select("user_id, first_name, last_name, email")
                .in("user_id", teacherIds);

            if (teachersError) {
                console.error("Error loading teachers (admin):", teachersError);
            }

            teacherMap = (teachers || []).reduce(
                (acc: any, t: any) => ({ ...acc, [t.user_id]: t }),
                {},
            );
        }

        // Entry counts: Supabase JS doesn't support `.group()`; fetch relevant entry rows and count client-side.
        const countsMap: Record<string, number> = {};
        const timesheetIds = timesheetList.map((t) => t.id).filter(Boolean);
        if (timesheetIds.length > 0) {
            const { data: entryRows, error: entriesError } = await supabaseAdmin
                .from("timesheet_entries")
                .select("timesheet_id")
                .in("timesheet_id", timesheetIds);

            if (entriesError) {
                console.error(
                    "Error loading timesheet entry ids (admin):",
                    entriesError,
                );
            } else {
                (entryRows || []).forEach((row: any) => {
                    const tsId = row?.timesheet_id;
                    if (!tsId) return;
                    countsMap[tsId] = (countsMap[tsId] || 0) + 1;
                });
            }
        }

        const result = timesheetList.map((t) => ({
            ...t,
            teacher: teacherMap[t.teacher_id] || {
                first_name: null,
                last_name: null,
                email: "",
            },
            _count: { entries: countsMap[t.id] || 0 },
        }));

        return NextResponse.json({ timesheets: result });
    } catch (err) {
        console.error("Error in timesheets GET:", err);
        return NextResponse.json({ error: "Internal server error" }, {
            status: 500,
        });
    }
}

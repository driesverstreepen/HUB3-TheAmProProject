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

    const { data: { user }, error } = await supabaseUser.auth.getUser();
    if (error || !user) return { user: null as any, error: "Unauthorized" };
    return { user, error: null };
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

        const runQuery = async (withYear: boolean) => {
            let q: any = supabaseAdmin
                .from("payrolls")
                .select(
                    "id, teacher_id, month, year, total_lessons, total_hours, total_amount, payment_method, payment_status, paid_at, created_at",
                )
                .eq("studio_id", studioId)
                .order("year", { ascending: false })
                .order("month", { ascending: false })
                .order("created_at", { ascending: false });

            if (withYear && schoolYearId) {
                q = q.eq("school_year_id", schoolYearId);
            }
            return await q;
        };

        let prRes: any = await runQuery(true);
        if (prRes?.error) {
            const msg = String(prRes?.error?.message || "");
            if (msg.toLowerCase().includes("school_year_id") && schoolYearId) {
                prRes = await runQuery(false);
            }
        }

        const { data: payrollRows, error: payrollsError } = prRes as any;

        if (payrollsError) {
            console.error("Error loading payrolls (admin):", payrollsError);
            return NextResponse.json({ error: "Failed to load payrolls" }, {
                status: 500,
            });
        }

        const payrolls = payrollRows || [];
        if (payrolls.length === 0) {
            return NextResponse.json({ payrolls: [] });
        }

        const teacherIds = Array.from(
            new Set(payrolls.map((p: any) => String(p.teacher_id))),
        );

        const { data: teachers, error: teachersError } = await supabaseAdmin
            .from("user_profiles")
            .select("user_id, first_name, last_name, email")
            .in("user_id", teacherIds);

        if (teachersError) {
            console.error(
                "Error loading teacher profiles for payrolls (admin):",
                teachersError,
            );
        }

        const teacherMap = (teachers || []).reduce((acc: any, t: any) => {
            acc[String(t.user_id)] = t;
            return acc;
        }, {} as Record<string, any>);

        const payrollsWithTeachers = payrolls.map((p: any) => ({
            ...p,
            teacher: teacherMap[String(p.teacher_id)] || {
                first_name: null,
                last_name: null,
                email: "",
            },
        }));

        return NextResponse.json({ payrolls: payrollsWithTeachers });
    } catch (err) {
        console.error("Error in payrolls GET:", err);
        return NextResponse.json({ error: "Internal server error" }, {
            status: 500,
        });
    }
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
        const timesheetId = String((body as any)?.timesheet_id || "");
        if (!timesheetId) {
            return NextResponse.json({ error: "timesheet_id is required" }, {
                status: 400,
            });
        }

        // Ensure timesheet exists and belongs to this studio
        const { data: timesheet, error: tsError } = await supabaseAdmin
            .from("timesheets")
            .select("id, studio_id, teacher_id, month, year, status, school_year_id")
            .eq("id", timesheetId)
            .eq("studio_id", studioId)
            .maybeSingle();

        if (tsError) {
            console.error("Error loading timesheet for payroll:", tsError);
            return NextResponse.json({ error: "Failed to load timesheet" }, {
                status: 500,
            });
        }

        if (!timesheet) {
            return NextResponse.json({ error: "Timesheet not found" }, {
                status: 404,
            });
        }

        if (timesheet.status !== "confirmed") {
            return NextResponse.json({ error: "Timesheet must be confirmed" }, {
                status: 409,
            });
        }

        // If payroll exists, return it
        const { data: existingPayroll, error: existingError } =
            await supabaseAdmin
                .from("payrolls")
                .select("id")
                .eq("timesheet_id", timesheetId)
                .maybeSingle();

        if (existingError) {
            console.error("Error checking existing payroll:", existingError);
            return NextResponse.json({
                error: "Failed to check existing payroll",
            }, { status: 500 });
        }

        if (existingPayroll?.id) {
            return NextResponse.json({
                payroll: existingPayroll,
                existed: true,
            });
        }

        // Calculate totals from DB entries (avoid client tampering)
        const { data: entryRows, error: entriesError } = await supabaseAdmin
            .from("timesheet_entries")
            .select("duration_minutes, lesson_fee, transport_fee")
            .eq("timesheet_id", timesheetId);

        if (entriesError) {
            console.error(
                "Error loading timesheet entries for payroll:",
                entriesError,
            );
            return NextResponse.json({
                error: "Failed to load timesheet entries",
            }, { status: 500 });
        }

        const entries = entryRows || [];
        const totalLessons = entries.length;
        const totalHours = entries.reduce((sum: number, e: any) =>
            sum + Number(e.duration_minutes || 0), 0) / 60;
        const totalLessonFees = entries.reduce((sum: number, e: any) =>
            sum + Number(e.lesson_fee || 0), 0);
        const totalTransportFees = entries.reduce((sum: number, e: any) =>
            sum + Number(e.transport_fee || 0), 0);
        const totalAmount = totalLessonFees + totalTransportFees;

        const { data: compensation, error: compError } = await supabaseAdmin
            .from("teacher_compensation")
            .select("payment_method")
            .eq("studio_id", studioId)
            .eq("teacher_id", timesheet.teacher_id)
            .eq("active", true)
            .maybeSingle();

        if (compError) {
            console.error(
                "Error loading teacher compensation payment_method:",
                compError,
            );
        }

        const paymentMethod = (compensation as any)?.payment_method ||
            "factuur";

        const insertPayload: any = {
            timesheet_id: timesheetId,
            studio_id: studioId,
            teacher_id: timesheet.teacher_id,
            month: timesheet.month,
            year: timesheet.year,
            total_lessons: totalLessons,
            total_hours: totalHours,
            total_lesson_fees: totalLessonFees,
            total_transport_fees: totalTransportFees,
            total_amount: totalAmount,
            payment_method: paymentMethod,
            payment_status: "pending",
            created_by: user.id,
        };
        if ((timesheet as any)?.school_year_id) {
            insertPayload.school_year_id = (timesheet as any).school_year_id;
        }

        // Back-compat if payrolls.school_year_id isn't deployed yet.
        let insRes: any = await supabaseAdmin
            .from("payrolls")
            .insert(insertPayload)
            .select("id")
            .single();

        if (insRes?.error) {
            const msg = String(insRes?.error?.message || "");
            if (msg.toLowerCase().includes("school_year_id") && insertPayload.school_year_id) {
                const { school_year_id: _omit, ...retryPayload } = insertPayload;
                insRes = await supabaseAdmin
                    .from("payrolls")
                    .insert(retryPayload)
                    .select("id")
                    .single();
            }
        }

        const { data: payroll, error: payrollError } = insRes as any;

        if (payrollError || !payroll) {
            console.error("Error creating payroll (admin):", payrollError);
            return NextResponse.json({ error: "Failed to create payroll" }, {
                status: 500,
            });
        }

        return NextResponse.json({ payroll, existed: false });
    } catch (err) {
        console.error("Error in payrolls POST:", err);
        return NextResponse.json({ error: "Internal server error" }, {
            status: 500,
        });
    }
}

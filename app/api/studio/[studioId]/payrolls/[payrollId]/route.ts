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
    { params }: { params: Promise<{ studioId: string; payrollId: string }> },
) {
    try {
        const { studioId, payrollId } = await params;

        const { user, error } = await getUserFromBearer(request);
        if (error) return NextResponse.json({ error }, { status: 401 });

        const access = await checkStudioAccess(supabaseAdmin, studioId, user.id);
        if (!access.hasAccess) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const perm = await checkStudioPermission(supabaseAdmin, studioId, user.id, "studio.finance");
        if (!perm.allowed) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { data: payroll, error: payrollError } = await supabaseAdmin
            .from("payrolls")
            .select("*")
            .eq("id", payrollId)
            .eq("studio_id", studioId)
            .maybeSingle();

        if (payrollError) {
            console.error("Error loading payroll (admin):", payrollError);
            return NextResponse.json({ error: "Failed to load payroll" }, {
                status: 500,
            });
        }

        if (!payroll) {
            return NextResponse.json({ error: "Payroll not found" }, {
                status: 404,
            });
        }

        const { data: teacher, error: teacherError } = await supabaseAdmin
            .from("user_profiles")
            .select("first_name, last_name, email")
            .eq("user_id", payroll.teacher_id)
            .maybeSingle();

        if (teacherError) {
            console.error(
                "Error loading payroll teacher profile (admin):",
                teacherError,
            );
        }

        // Load active compensation details for display (hourly + transport + IBAN)
        const { data: comp, error: compError } = await supabaseAdmin
            .from("teacher_compensation")
            .select("lesson_fee, transport_fee, iban")
            .eq("studio_id", studioId)
            .eq("teacher_id", payroll.teacher_id)
            .eq("active", true)
            .maybeSingle();

        if (compError) {
            console.error(
                "Error loading teacher compensation for payroll (admin):",
                compError,
            );
        }

        // Load timesheet entries for formula breakdown (if payroll is linked to a timesheet)
        let entries: any[] = [];
        const timesheetId = (payroll as any)?.timesheet_id;
        if (timesheetId) {
            const { data: entryRows, error: entriesError } = await supabaseAdmin
                .from("timesheet_entries")
                .select(
                    "id, date, duration_minutes, lesson_fee, transport_fee, notes, is_manual",
                )
                .eq("timesheet_id", timesheetId)
                .order("date", { ascending: true });

            if (entriesError) {
                console.error(
                    "Error loading payroll timesheet entries (admin):",
                    entriesError,
                );
            } else {
                entries = entryRows || [];
            }
        }

        return NextResponse.json({
            payroll: {
                ...payroll,
                teacher: teacher ||
                    { first_name: null, last_name: null, email: "" },
                compensation: comp || null,
                entries,
            },
        });
    } catch (err) {
        console.error("Error in payroll GET:", err);
        return NextResponse.json({ error: "Internal server error" }, {
            status: 500,
        });
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ studioId: string; payrollId: string }> },
) {
    try {
        const { studioId, payrollId } = await params;

        const { user, error } = await getUserFromBearer(request);
        if (error) return NextResponse.json({ error }, { status: 401 });

        const access = await checkStudioAccess(supabaseAdmin, studioId, user.id);
        if (!access.hasAccess) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const perm = await checkStudioPermission(supabaseAdmin, studioId, user.id, "studio.finance", { requireWrite: true });
        if (!perm.allowed) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await request.json().catch(() => ({} as any));
        const paymentStatus = String((body as any)?.payment_status || "");
        if (!["pending", "paid"].includes(paymentStatus)) {
            return NextResponse.json({ error: "Invalid payment_status" }, {
                status: 400,
            });
        }

        // Ensure payroll exists in this studio
        const { data: existing, error: existingError } = await supabaseAdmin
            .from("payrolls")
            .select("id")
            .eq("id", payrollId)
            .eq("studio_id", studioId)
            .maybeSingle();

        if (existingError) {
            console.error("Error checking payroll (admin):", existingError);
            return NextResponse.json({ error: "Failed to update payroll" }, {
                status: 500,
            });
        }

        if (!existing) {
            return NextResponse.json({ error: "Payroll not found" }, {
                status: 404,
            });
        }

        const patch: any = { payment_status: paymentStatus };
        if (paymentStatus === "paid") {
            patch.paid_at = new Date().toISOString();
            patch.paid_by = user.id;
        } else {
            patch.paid_at = null;
            patch.paid_by = null;
        }

        const { error: updateError } = await supabaseAdmin
            .from("payrolls")
            .update(patch)
            .eq("id", payrollId)
            .eq("studio_id", studioId);

        if (updateError) {
            console.error("Error updating payroll (admin):", updateError);
            return NextResponse.json({ error: "Failed to update payroll" }, {
                status: 500,
            });
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("Error in payroll PATCH:", err);
        return NextResponse.json({ error: "Internal server error" }, {
            status: 500,
        });
    }
}

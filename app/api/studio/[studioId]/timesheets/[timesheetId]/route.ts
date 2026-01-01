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

function isValidStatus(value: unknown): value is "draft" | "confirmed" {
    return value === "draft" || value === "confirmed";
}

export async function GET(
    request: NextRequest,
    {
        params,
    }: {
        params: Promise<{ studioId: string; timesheetId: string }>;
    },
) {
    try {
        const { studioId, timesheetId } = await params;

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

        const { data: timesheet, error: tsError } = await supabaseAdmin
            .from("timesheets")
            .select(
                "id, studio_id, teacher_id, month, year, status, notes, created_at, confirmed_at",
            )
            .eq("id", timesheetId)
            .eq("studio_id", studioId)
            .maybeSingle();

        if (tsError) {
            console.error("Error loading timesheet (admin):", tsError);
            return NextResponse.json(
                { error: "Failed to load timesheet" },
                { status: 500 },
            );
        }

        if (!timesheet) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const { data: teacher, error: teacherError } = await supabaseAdmin
            .from("user_profiles")
            .select("first_name, last_name, email")
            .eq("user_id", timesheet.teacher_id)
            .maybeSingle();

        if (teacherError) {
            console.error(
                "Error loading teacher profile (admin):",
                teacherError,
            );
        }

        const { data: entries, error: entriesError } = await supabaseAdmin
            .from("timesheet_entries")
            .select(
                "id, lesson_id, program_id, date, duration_minutes, lesson_fee, transport_fee, is_manual, notes, program:program_id(title)",
            )
            .eq("timesheet_id", timesheetId)
            .order("date", { ascending: true });

        if (entriesError) {
            console.error(
                "Error loading timesheet entries (admin):",
                entriesError,
            );
            return NextResponse.json(
                { error: "Failed to load timesheet entries" },
                { status: 500 },
            );
        }

        const { data: comments, error: commentsError } = await supabaseAdmin
            .from("timesheet_comments")
            .select("id, user_id, comment, created_at")
            .eq("timesheet_id", timesheetId)
            .order("created_at", { ascending: false });

        if (commentsError) {
            // comments are optional; don't fail the whole page
            console.error(
                "Error loading timesheet comments (admin):",
                commentsError,
            );
        }

        const commentList: any[] = comments || [];
        const commentUserIds = Array.from(
            new Set(commentList.map((c) => c.user_id).filter(Boolean)),
        );

        let userMap: Record<string, any> = {};
        if (commentUserIds.length > 0) {
            const { data: users, error: usersError } = await supabaseAdmin
                .from("user_profiles")
                .select("user_id, first_name, last_name, email")
                .in("user_id", commentUserIds);

            if (usersError) {
                console.error(
                    "Error loading comment users (admin):",
                    usersError,
                );
            }

            userMap = (users || []).reduce(
                (acc: any, u: any) => ({ ...acc, [u.user_id]: u }),
                {},
            );
        }

        const commentsWithUsers = commentList.map((c) => ({
            ...c,
            user: userMap[c.user_id] ||
                { first_name: null, last_name: null, email: "" },
        }));

        return NextResponse.json({
            timesheet: {
                ...timesheet,
                teacher: teacher ||
                    { first_name: null, last_name: null, email: "" },
            },
            entries: entries || [],
            comments: commentsWithUsers,
        });
    } catch (err) {
        console.error("Error in timesheet detail GET:", err);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}

export async function PATCH(
    request: NextRequest,
    {
        params,
    }: {
        params: Promise<{ studioId: string; timesheetId: string }>;
    },
) {
    try {
        const { studioId, timesheetId } = await params;

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
        const status = (body as any)?.status;
        if (!isValidStatus(status)) {
            return NextResponse.json(
                { error: "Invalid status" },
                { status: 400 },
            );
        }

        const updatePayload: any = { status };
        if (status === "confirmed") {
            updatePayload.confirmed_at = new Date().toISOString();
            updatePayload.confirmed_by = user.id;
        } else {
            updatePayload.confirmed_at = null;
            updatePayload.confirmed_by = null;
        }

        const { data: updated, error: updError } = await supabaseAdmin
            .from("timesheets")
            .update(updatePayload)
            .eq("id", timesheetId)
            .eq("studio_id", studioId)
            .select(
                "id, studio_id, teacher_id, month, year, status, notes, created_at, confirmed_at",
            )
            .maybeSingle();

        if (updError) {
            console.error("Error updating timesheet status (admin):", updError);
            return NextResponse.json(
                { error: "Failed to update timesheet" },
                { status: 500 },
            );
        }

        if (!updated) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        return NextResponse.json({ timesheet: updated });
    } catch (err) {
        console.error("Error in timesheet PATCH:", err);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}

export async function DELETE(
    request: NextRequest,
    {
        params,
    }: {
        params: Promise<{ studioId: string; timesheetId: string }>;
    },
) {
    try {
        const { studioId, timesheetId } = await params;

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

        // Do not allow delete if a payroll exists for this timesheet
        const { data: payroll, error: payrollError } = await supabaseAdmin
            .from("payrolls")
            .select("id")
            .eq("timesheet_id", timesheetId)
            .maybeSingle();

        if (payrollError) {
            console.error(
                "Error checking payroll for timesheet delete (admin):",
                payrollError,
            );
            return NextResponse.json(
                { error: "Failed to check payroll" },
                { status: 500 },
            );
        }

        if (payroll?.id) {
            return NextResponse.json(
                {
                    error:
                        "Kan timesheet niet verwijderen: er bestaat al een payroll voor deze timesheet.",
                },
                { status: 409 },
            );
        }

        // Ensure timesheet belongs to this studio
        const { data: existing, error: existingError } = await supabaseAdmin
            .from("timesheets")
            .select("id")
            .eq("id", timesheetId)
            .eq("studio_id", studioId)
            .maybeSingle();

        if (existingError) {
            console.error(
                "Error checking timesheet existence (admin):",
                existingError,
            );
            return NextResponse.json(
                { error: "Failed to load timesheet" },
                { status: 500 },
            );
        }

        if (!existing) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        // Cleanup child rows first (in case FK isn't ON DELETE CASCADE)
        const { error: entriesError } = await supabaseAdmin
            .from("timesheet_entries")
            .delete()
            .eq("timesheet_id", timesheetId);

        if (entriesError) {
            console.error(
                "Error deleting timesheet entries (admin):",
                entriesError,
            );
            return NextResponse.json(
                { error: "Failed to delete timesheet entries" },
                { status: 500 },
            );
        }

        const { error: commentsError } = await supabaseAdmin
            .from("timesheet_comments")
            .delete()
            .eq("timesheet_id", timesheetId);

        if (commentsError) {
            console.error(
                "Error deleting timesheet comments (admin):",
                commentsError,
            );
            return NextResponse.json(
                { error: "Failed to delete timesheet comments" },
                { status: 500 },
            );
        }

        const { error: tsDeleteError } = await supabaseAdmin
            .from("timesheets")
            .delete()
            .eq("id", timesheetId)
            .eq("studio_id", studioId);

        if (tsDeleteError) {
            console.error("Error deleting timesheet (admin):", tsDeleteError);
            return NextResponse.json(
                { error: "Failed to delete timesheet" },
                { status: 500 },
            );
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("Error in timesheet DELETE:", err);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}

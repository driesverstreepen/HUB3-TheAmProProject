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

function isValidISODate(value: unknown) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function ensureDraftTimesheet(
    studioId: string,
    timesheetId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
    const { data: timesheet, error } = await supabaseAdmin
        .from("timesheets")
        .select("id, status")
        .eq("id", timesheetId)
        .eq("studio_id", studioId)
        .maybeSingle();

    if (error) {
        console.error(
            "Error loading timesheet for entry mutate (admin):",
            error,
        );
        return { ok: false, status: 500, error: "Failed to load timesheet" };
    }
    if (!timesheet) return { ok: false, status: 404, error: "Not found" };
    if (timesheet.status !== "draft") {
        return { ok: false, status: 409, error: "Timesheet is bevestigd" };
    }
    return { ok: true };
}

export async function PATCH(
    request: NextRequest,
    {
        params,
    }: {
        params: Promise<
            { studioId: string; timesheetId: string; entryId: string }
        >;
    },
) {
    try {
        const { studioId, timesheetId, entryId } = await params;

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

        const draft = await ensureDraftTimesheet(studioId, timesheetId);
        if (!draft.ok) {
            return NextResponse.json(
                { error: draft.error },
                { status: draft.status },
            );
        }

        const body = await request.json().catch(() => ({} as any));

        const payload: any = {};
        if (isValidISODate((body as any)?.date)) {
            payload.date = (body as any).date;
        }
        if (typeof (body as any)?.duration_minutes !== "undefined") {
            const dm = Number((body as any).duration_minutes);
            if (!Number.isFinite(dm) || dm <= 0) {
                return NextResponse.json(
                    { error: "Invalid duration_minutes" },
                    { status: 400 },
                );
            }
            payload.duration_minutes = Math.round(dm);
        }
        if (typeof (body as any)?.lesson_fee !== "undefined") {
            const lf = Number((body as any).lesson_fee);
            if (!Number.isFinite(lf) || lf < 0) {
                return NextResponse.json({ error: "Invalid lesson_fee" }, {
                    status: 400,
                });
            }
            payload.lesson_fee = lf;
        }
        if (typeof (body as any)?.transport_fee !== "undefined") {
            const tf = Number((body as any).transport_fee);
            if (!Number.isFinite(tf) || tf < 0) {
                return NextResponse.json(
                    { error: "Invalid transport_fee" },
                    { status: 400 },
                );
            }
            payload.transport_fee = tf;
        }
        if (typeof (body as any)?.notes !== "undefined") {
            payload.notes = typeof (body as any).notes === "string"
                ? (body as any).notes
                : null;
        }

        const { data: entry, error: updateError } = await supabaseAdmin
            .from("timesheet_entries")
            .update(payload)
            .eq("id", entryId)
            .eq("timesheet_id", timesheetId)
            .select(
                "id, lesson_id, program_id, date, duration_minutes, lesson_fee, transport_fee, is_manual, notes, program:program_id(title)",
            )
            .maybeSingle();

        if (updateError) {
            console.error(
                "Error updating timesheet entry (admin):",
                updateError,
            );
            return NextResponse.json({ error: "Failed to update entry" }, {
                status: 500,
            });
        }

        if (!entry) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        return NextResponse.json({ entry });
    } catch (err) {
        console.error("Error in timesheet entries PATCH:", err);
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
        params: Promise<
            { studioId: string; timesheetId: string; entryId: string }
        >;
    },
) {
    try {
        const { studioId, timesheetId, entryId } = await params;

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

        const draft = await ensureDraftTimesheet(studioId, timesheetId);
        if (!draft.ok) {
            return NextResponse.json(
                { error: draft.error },
                { status: draft.status },
            );
        }

        const { error: delError } = await supabaseAdmin
            .from("timesheet_entries")
            .delete()
            .eq("id", entryId)
            .eq("timesheet_id", timesheetId);

        if (delError) {
            console.error("Error deleting timesheet entry (admin):", delError);
            return NextResponse.json({ error: "Failed to delete entry" }, {
                status: 500,
            });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("Error in timesheet entries DELETE:", err);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}

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

export async function POST(
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
            .select("id, status")
            .eq("id", timesheetId)
            .eq("studio_id", studioId)
            .maybeSingle();

        if (tsError) {
            console.error(
                "Error loading timesheet for entry create (admin):",
                tsError,
            );
            return NextResponse.json(
                { error: "Failed to load timesheet" },
                { status: 500 },
            );
        }

        if (!timesheet) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        if (timesheet.status !== "draft") {
            return NextResponse.json(
                { error: "Timesheet is bevestigd" },
                { status: 409 },
            );
        }

        const body = await request.json().catch(() => ({} as any));
        const date = (body as any)?.date;
        const durationMinutes = Number((body as any)?.duration_minutes);
        const lessonFee = Number((body as any)?.lesson_fee);
        const transportFee = Number((body as any)?.transport_fee);
        const notes = (body as any)?.notes;

        if (!isValidISODate(date)) {
            return NextResponse.json({ error: "Invalid date" }, {
                status: 400,
            });
        }
        if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
            return NextResponse.json(
                { error: "Invalid duration_minutes" },
                { status: 400 },
            );
        }

        const entryPayload = {
            timesheet_id: timesheetId,
            date,
            duration_minutes: Math.round(durationMinutes),
            lesson_fee: Number.isFinite(lessonFee) ? lessonFee : 0,
            transport_fee: Number.isFinite(transportFee) ? transportFee : 0,
            notes: typeof notes === "string" ? notes : null,
            is_manual: true,
            lesson_id: null,
            program_id: null,
        };

        const { data: entry, error: insertError } = await supabaseAdmin
            .from("timesheet_entries")
            .insert(entryPayload)
            .select(
                "id, lesson_id, program_id, date, duration_minutes, lesson_fee, transport_fee, is_manual, notes, program:program_id(title)",
            )
            .single();

        if (insertError || !entry) {
            console.error(
                "Error inserting timesheet entry (admin):",
                insertError,
            );
            return NextResponse.json(
                { error: "Failed to create entry" },
                { status: 500 },
            );
        }

        return NextResponse.json({ entry });
    } catch (err) {
        console.error("Error in timesheet entries POST:", err);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}

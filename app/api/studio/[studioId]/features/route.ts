import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkStudioAccess } from "@/lib/supabaseHelpers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
);

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

        const access = await checkStudioAccess(
            supabaseAdmin,
            studioId,
            user.id,
        );
        if (!access.hasAccess) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { data, error: studioError } = await supabaseAdmin
            .from("studios")
            .select("features, attendance_enabled")
            .eq("id", studioId)
            .maybeSingle();

        if (studioError) {
            console.error("Error fetching studio features:", studioError);
            return NextResponse.json({ error: "Failed to load features" }, {
                status: 500,
            });
        }

        return NextResponse.json({
            features: (data as any)?.features || {},
            attendance_enabled: !!(data as any)?.attendance_enabled,
        });
    } catch (err) {
        console.error("Error in studio features GET:", err);
        return NextResponse.json({ error: "Internal server error" }, {
            status: 500,
        });
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ studioId: string }> },
) {
    try {
        const { studioId } = await params;

        const { user, error } = await getUserFromBearer(request);
        if (error) return NextResponse.json({ error }, { status: 401 });

        const access = await checkStudioAccess(
            supabaseAdmin,
            studioId,
            user.id,
        );
        if (
            !access.hasAccess || !["owner", "admin"].includes(access.role || "")
        ) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await request.json();
        const features = (body as any)?.features;
        const attendance_enabled = (body as any)?.attendance_enabled;

        if (
            features !== undefined &&
            (typeof features !== "object" || Array.isArray(features))
        ) {
            return NextResponse.json({ error: "Invalid features payload" }, {
                status: 400,
            });
        }

        const payload: any = {
            updated_at: new Date().toISOString(),
        };
        if (features !== undefined) payload.features = features || {};
        if (attendance_enabled !== undefined) {
            payload.attendance_enabled = !!attendance_enabled;
        }

        const { data, error: updateError } = await supabaseAdmin
            .from("studios")
            .update(payload)
            .eq("id", studioId)
            .select("features, attendance_enabled")
            .maybeSingle();

        if (updateError) {
            console.error("Error updating studio features:", updateError);
            return NextResponse.json({ error: "Failed to save features" }, {
                status: 500,
            });
        }

        if (!data) {
            return NextResponse.json({ error: "Update blocked" }, {
                status: 403,
            });
        }

        return NextResponse.json({
            features: (data as any)?.features || {},
            attendance_enabled: !!(data as any)?.attendance_enabled,
        });
    } catch (err: any) {
        console.error("Error in studio features PUT:", err);
        return NextResponse.json({ error: "Internal server error" }, {
            status: 500,
        });
    }
}

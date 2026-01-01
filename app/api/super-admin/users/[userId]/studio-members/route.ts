import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
    createSupabaseServiceClient,
    supabaseAnonKey,
    supabaseUrl,
} from "@/lib/supabase";

function getUserClient(request: NextRequest) {
    const cookie = request.headers.get("cookie") || "";
    const authorization = request.headers.get("authorization") || "";

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("Supabase not configured");
    }

    const headers: Record<string, string> = {};
    if (cookie) headers.cookie = cookie;
    if (authorization) headers.Authorization = authorization;

    return createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers },
    });
}

async function requireSuperAdmin(request: NextRequest) {
    const userClient = getUserClient(request);
    const { data: { user } } = await userClient.auth.getUser();

    if (!user) {
        return {
            ok: false as const,
            response: NextResponse.json({ error: "Unauthorized" }, {
                status: 401,
            }),
        };
    }

    const { data: roleRow } = await userClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "super_admin")
        .maybeSingle();

    if (!roleRow) {
        return {
            ok: false as const,
            response: NextResponse.json({ error: "Forbidden" }, {
                status: 403,
            }),
        };
    }

    return { ok: true as const, actorUserId: user.id };
}

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ userId: string }> },
) {
    try {
        const auth = await requireSuperAdmin(request);
        if (!auth.ok) return auth.response;

        const { userId } = await context.params;
        const targetUserId = String(userId || "").trim();

        const body = await request.json().catch(() => ({} as any));
        const studioId = String(body?.studio_id || "").trim();

        if (!targetUserId) {
            return NextResponse.json({ error: "Missing userId" }, {
                status: 400,
            });
        }
        if (!studioId) {
            return NextResponse.json({ error: "Missing studio_id" }, {
                status: 400,
            });
        }

        const admin = createSupabaseServiceClient();

        const { data: existing } = await admin
            .from("studio_members")
            .select("role")
            .eq("studio_id", studioId)
            .eq("user_id", targetUserId)
            .maybeSingle();

        if (existing?.role === "owner") {
            return NextResponse.json({
                error: "Deze gebruiker is owner en kan niet aangepast worden.",
            }, { status: 400 });
        }

        const now = new Date().toISOString();

        const { error } = await admin
            .from("studio_members")
            .upsert(
                {
                    studio_id: studioId,
                    user_id: targetUserId,
                    role: "admin",
                    invited_by: auth.actorUserId,
                    joined_at: now,
                    updated_at: now,
                },
                { onConflict: "studio_id,user_id" },
            );

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || "Server error" }, {
            status: 500,
        });
    }
}

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ userId: string }> },
) {
    try {
        const auth = await requireSuperAdmin(request);
        if (!auth.ok) return auth.response;

        const { userId } = await context.params;
        const targetUserId = String(userId || "").trim();

        const body = await request.json().catch(() => ({} as any));
        const studioId = String(body?.studio_id || "").trim();

        if (!targetUserId) {
            return NextResponse.json({ error: "Missing userId" }, {
                status: 400,
            });
        }
        if (!studioId) {
            return NextResponse.json({ error: "Missing studio_id" }, {
                status: 400,
            });
        }

        const admin = createSupabaseServiceClient();

        const { data: existing } = await admin
            .from("studio_members")
            .select("role")
            .eq("studio_id", studioId)
            .eq("user_id", targetUserId)
            .maybeSingle();

        if (existing?.role === "owner") {
            return NextResponse.json({
                error: "Owners kunnen niet verwijderd worden.",
            }, { status: 400 });
        }

        const { error } = await admin
            .from("studio_members")
            .delete()
            .eq("studio_id", studioId)
            .eq("user_id", targetUserId);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || "Server error" }, {
            status: 500,
        });
    }
}

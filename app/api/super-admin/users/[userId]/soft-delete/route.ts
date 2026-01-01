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

        if (!targetUserId) {
            return NextResponse.json({ error: "Missing userId" }, {
                status: 400,
            });
        }

        if (targetUserId === auth.actorUserId) {
            return NextResponse.json({
                error: "Je kan jezelf niet soft-deleten.",
            }, { status: 400 });
        }

        const body = await request.json().catch(() => ({} as any));
        const reason = String(body?.reason || "").trim() || null;

        const admin = createSupabaseServiceClient();

        const { data: ownerRows, error: ownerErr } = await admin
            .from("studio_members")
            .select("studio_id")
            .eq("user_id", targetUserId)
            .eq("role", "owner");

        if (ownerErr && (ownerErr as any)?.code !== "PGRST205") {
            return NextResponse.json({ error: ownerErr.message }, {
                status: 500,
            });
        }

        const ownerStudioIds = (ownerRows || []).map((r: any) => r.studio_id)
            .filter(Boolean);
        if (ownerStudioIds.length > 0) {
            return NextResponse.json(
                {
                    error:
                        "Deze gebruiker is owner van een studio en kan niet verwijderd worden (eerst ownership transfer).",
                    owner_studio_ids: ownerStudioIds,
                },
                { status: 400 },
            );
        }

        // Remove studio access (non-owner only, but we already blocked owners above)
        await admin.from("studio_members").delete().eq("user_id", targetUserId);

        // Revoke all roles
        await admin.from("user_roles").delete().eq("user_id", targetUserId);

        const now = new Date().toISOString();

        // Anonymize profile (best-effort: keep it to common columns)
        const { error: profileErr } = await admin
            .from("user_profiles")
            .upsert(
                {
                    user_id: targetUserId,
                    first_name: null,
                    last_name: null,
                    email: null,
                    phone_number: null,
                    deleted_at: now,
                    deleted_by: auth.actorUserId,
                    deleted_reason: reason,
                    updated_at: now,
                },
                { onConflict: "user_id" },
            );

        if (profileErr) {
            return NextResponse.json({ error: profileErr.message }, {
                status: 500,
            });
        }

        // Audit log (best-effort)
        await admin.from("super_admin_audit_log").insert({
            actor_user_id: auth.actorUserId,
            target_user_id: targetUserId,
            action: "user.soft_delete",
            metadata: reason ? { reason } : null,
        });

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || "Server error" }, {
            status: 500,
        });
    }
}

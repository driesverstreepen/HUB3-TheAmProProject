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

export async function GET(
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

        const admin = createSupabaseServiceClient();

        const { data: profile, error: profileErr } = await admin
            .from("user_profiles")
            .select(
                "user_id, first_name, last_name, email, phone_number, updated_at, deleted_at, deleted_by, deleted_reason",
            )
            .eq("user_id", targetUserId)
            .maybeSingle();

        if (profileErr) {
            if ((profileErr as any)?.code === "PGRST205") {
                return NextResponse.json({ error: "user_profiles missing" }, {
                    status: 500,
                });
            }
            return NextResponse.json({ error: profileErr.message }, {
                status: 500,
            });
        }

        const { data: roles } = await admin
            .from("user_roles")
            .select("role, studio_id")
            .eq("user_id", targetUserId);

        const globalRoles = (roles || [])
            .filter((r: any) => r?.studio_id == null)
            .map((r: any) => String(r.role));

        const { data: memberships, error: memErr } = await admin
            .from("studio_members")
            .select("studio_id, role, joined_at")
            .eq("user_id", targetUserId);

        if (memErr) {
            if ((memErr as any)?.code === "PGRST205") {
                return NextResponse.json({
                    profile: profile || null,
                    roles: globalRoles,
                    studios: [],
                });
            }
            return NextResponse.json({ error: memErr.message }, {
                status: 500,
            });
        }

        const studioIds = Array.from(
            new Set(
                (memberships || []).map((m: any) => m.studio_id).filter(
                    Boolean,
                ),
            ),
        );

        let studiosById: Record<string, any> = {};
        if (studioIds.length > 0) {
            const { data: studios } = await admin
                .from("studios")
                .select("id, naam, slug")
                .in("id", studioIds);

            for (const s of studios || []) {
                studiosById[String((s as any).id)] = s;
            }
        }

        let subsByStudioId: Record<string, any> = {};
        if (studioIds.length > 0) {
            const { data: subs } = await admin
                .from("studio_subscription_info")
                .select(
                    "id, subscription_tier, subscription_status, subscription_period, subscription_start_date, subscription_end_date, trial_end_date, is_trial_active, trial_days_remaining",
                )
                .in("id", studioIds);

            for (const row of subs || []) {
                subsByStudioId[String((row as any).id)] = row;
            }
        }

        const studioSummaries: any[] = [];

        for (const m of memberships || []) {
            const studioId = String((m as any).studio_id);

            const { count: programCount } = await admin
                .from("programs")
                .select("id", { count: "exact", head: true })
                .eq("studio_id", studioId);

            const { data: programIds } = await admin
                .from("programs")
                .select("id")
                .eq("studio_id", studioId);

            const ids = (programIds || []).map((p: any) => p.id);

            let enrollmentCount = 0;
            if (ids.length > 0) {
                const { count } = await admin
                    .from("inschrijvingen")
                    .select("id", { count: "exact", head: true })
                    .in("program_id", ids);

                enrollmentCount = count || 0;
            }

            const studioRow = studiosById[studioId] || null;
            const sub = subsByStudioId[studioId] || null;

            studioSummaries.push({
                studio_id: studioId,
                studio_name: studioRow?.naam ?? null,
                studio_slug: studioRow?.slug ?? null,
                member_role: (m as any).role,
                joined_at: (m as any).joined_at,
                program_count: programCount || 0,
                enrollment_count: enrollmentCount,
                subscription: sub,
            });
        }

        return NextResponse.json({
            profile: profile || null,
            roles: globalRoles,
            studios: studioSummaries,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || "Server error" }, {
            status: 500,
        });
    }
}

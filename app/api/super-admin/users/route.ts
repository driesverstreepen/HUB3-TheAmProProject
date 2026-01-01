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

    return { ok: true as const, userId: user.id };
}

function clampInt(
    value: string | null,
    fallback: number,
    min: number,
    max: number,
) {
    const n = value == null ? NaN : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.trunc(n)));
}

export async function GET(request: NextRequest) {
    try {
        const auth = await requireSuperAdmin(request);
        if (!auth.ok) return auth.response;

        const { searchParams } = new URL(request.url);
        const q = (searchParams.get("q") || "").trim();
        const limit = clampInt(searchParams.get("limit"), 50, 1, 200);
        const offset = clampInt(searchParams.get("offset"), 0, 0, 10_000);

        const admin = createSupabaseServiceClient();

        let query = admin
            .from("user_profiles")
            .select(
                "user_id, first_name, last_name, email, phone_number, updated_at",
            )
            .order("updated_at", { ascending: false })
            .range(offset, offset + limit - 1);

        if (q.length > 0) {
            const like = `%${q}%`;
            query = query.or(
                [
                    `email.ilike.${like}`,
                    `first_name.ilike.${like}`,
                    `last_name.ilike.${like}`,
                    `phone_number.ilike.${like}`,
                ].join(","),
            );
        }

        const { data: profiles, error } = await query;

        if (error) {
            if ((error as any)?.code === "PGRST205") {
                return NextResponse.json({ users: [] });
            }
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const userIds = (profiles || []).map((p) => p.user_id).filter(Boolean);

        const rolesByUserId: Record<string, string[]> = {};
        if (userIds.length > 0) {
            const { data: roles, error: rolesErr } = await admin
                .from("user_roles")
                .select("user_id, role, studio_id")
                .in("user_id", userIds);

            if (!rolesErr && Array.isArray(roles)) {
                for (const row of roles as any[]) {
                    const id = row.user_id as string;
                    if (!rolesByUserId[id]) rolesByUserId[id] = [];
                    // Only expose global roles here; studio roles are handled elsewhere.
                    if (row.role) rolesByUserId[id].push(String(row.role));
                }
            }
        }

        const users = (profiles || []).map((p: any) => ({
            user_id: p.user_id,
            email: p.email || null,
            first_name: p.first_name ?? null,
            last_name: p.last_name ?? null,
            phone_number: p.phone_number ?? null,
            updated_at: p.updated_at ?? null,
            roles: rolesByUserId[p.user_id] || [],
            is_super_admin: (rolesByUserId[p.user_id] || []).includes(
                "super_admin",
            ),
        }));

        return NextResponse.json({ users });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || "Server error" }, {
            status: 500,
        });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const auth = await requireSuperAdmin(request);
        if (!auth.ok) return auth.response;

        const body = await request.json().catch(() => ({} as any));
        const userId = String(body?.user_id || "").trim();
        const makeSuperAdmin = Boolean(body?.make_super_admin);

        if (!userId) {
            return NextResponse.json({ error: "Missing user_id" }, {
                status: 400,
            });
        }

        if (!makeSuperAdmin && userId === auth.userId) {
            return NextResponse.json({
                error: "Je kan je eigen super admin rechten niet verwijderen.",
            }, { status: 400 });
        }

        const admin = createSupabaseServiceClient();

        if (makeSuperAdmin) {
            const { error } = await admin
                .from("user_roles")
                .upsert(
                    {
                        user_id: userId,
                        role: "super_admin",
                        studio_id: null,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "user_id,role,studio_id" },
                );

            if (error) {
                return NextResponse.json({ error: error.message }, {
                    status: 500,
                });
            }
            return NextResponse.json({ ok: true });
        }

        const { error } = await admin
            .from("user_roles")
            .delete()
            .eq("user_id", userId)
            .eq("role", "super_admin")
            .is("studio_id", null);

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

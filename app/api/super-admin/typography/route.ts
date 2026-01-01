import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
    createSupabaseServiceClient,
    supabaseAnonKey,
    supabaseUrl,
} from "@/lib/supabase";
import {
    defaultTypographyConfig,
    normalizeTypographyConfig,
} from "@/lib/typography";

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

const TABLE = "global_typography";
const KEY = "default";

export async function GET(request: NextRequest) {
    try {
        const auth = await requireSuperAdmin(request);
        if (!auth.ok) return auth.response;

        const admin = createSupabaseServiceClient();

        const { data, error } = await admin
            .from(TABLE)
            .select("key, config, updated_at, updated_by")
            .eq("key", KEY)
            .maybeSingle();

        if (error) {
            if ((error as any)?.code === "PGRST205") {
                return NextResponse.json({
                    config: defaultTypographyConfig,
                    stored: false,
                });
            }
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const config = data?.config
            ? normalizeTypographyConfig(data.config)
            : defaultTypographyConfig;
        return NextResponse.json({
            config,
            stored: !!data,
            updated_at: data?.updated_at ?? null,
            updated_by: data?.updated_by ?? null,
        });
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

        const body = await request.json().catch(() => ({}));
        const config = normalizeTypographyConfig(body?.config);

        const admin = createSupabaseServiceClient();

        const { data, error } = await admin
            .from(TABLE)
            .upsert(
                {
                    key: KEY,
                    config,
                    updated_at: new Date().toISOString(),
                    updated_by: auth.userId,
                },
                { onConflict: "key" },
            )
            .select("key, config, updated_at, updated_by")
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            config: normalizeTypographyConfig(data?.config),
            updated_at: data?.updated_at ?? null,
            updated_by: data?.updated_by ?? null,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || "Server error" }, {
            status: 500,
        });
    }
}

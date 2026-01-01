import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
    createSupabaseServiceClient,
    supabaseAnonKey,
    supabaseUrl,
} from "@/lib/supabase";

async function requireSuperAdmin(request: NextRequest) {
    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("Supabase not configured");
    }

    const authorization = request.headers.get("authorization") || "";

    // 1) Resolve the user (Authorization header OR cookie-based session)
    let userId: string | null = null;

    if (authorization) {
        const userClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authorization } },
        });
        const { data: { user } } = await userClient.auth.getUser();
        userId = user?.id ?? null;
    } else {
        const cookieStore = await cookies();
        const serverClient = createServerClient(supabaseUrl, supabaseAnonKey, {
            cookies: {
                get(name: string) {
                    return cookieStore.get(name)?.value;
                },
                set(name: string, value: string, options: any) {
                    cookieStore.set({ name, value, ...options });
                },
                remove(name: string, options: any) {
                    cookieStore.set({ name, value: "", ...options });
                },
            },
        });
        const { data: { session } } = await serverClient.auth.getSession();
        userId = session?.user?.id ?? null;
    }

    if (!userId) {
        return {
            ok: false as const,
            response: NextResponse.json({ error: "Unauthorized" }, {
                status: 401,
            }),
        };
    }

    // 2) Verify role using the same auth context
    let roleRow: any = null;

    if (authorization) {
        const roleClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authorization } },
        });
        const { data } = await roleClient
            .from("user_roles")
            .select("role")
            .eq("user_id", userId)
            .eq("role", "super_admin")
            .maybeSingle();
        roleRow = data;
    } else {
        const cookieStore = await cookies();
        const serverClient = createServerClient(supabaseUrl, supabaseAnonKey, {
            cookies: {
                get(name: string) {
                    return cookieStore.get(name)?.value;
                },
                set(name: string, value: string, options: any) {
                    cookieStore.set({ name, value, ...options });
                },
                remove(name: string, options: any) {
                    cookieStore.set({ name, value: "", ...options });
                },
            },
        });
        const { data } = await serverClient
            .from("user_roles")
            .select("role")
            .eq("user_id", userId)
            .eq("role", "super_admin")
            .maybeSingle();
        roleRow = data;
    }

    if (!roleRow) {
        return {
            ok: false as const,
            response: NextResponse.json({ error: "Forbidden" }, {
                status: 403,
            }),
        };
    }

    return { ok: true as const, userId };
}

export async function GET(request: NextRequest) {
    try {
        const auth = await requireSuperAdmin(request);
        if (!auth.ok) return auth.response;

        const admin = createSupabaseServiceClient();
        const { data, error } = await admin
            .from("global_feature_flags")
            .select(
                "key, enabled, hidden, coming_soon_label, updated_at, updated_by",
            )
            .order("key", { ascending: true });

        if (error) {
            if ((error as any)?.code === "PGRST205") {
                return NextResponse.json({ flags: [] });
            }
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ flags: data || [] });
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

        const body = await request.json();
        const key = String(body?.key || "").trim();
        const enabled = Boolean(body?.enabled);
        const hidden = Boolean(body?.hidden);
        const comingSoonLabelRaw = body?.coming_soon_label;
        const coming_soon_label = typeof comingSoonLabelRaw === "string" &&
                comingSoonLabelRaw.trim().length > 0
            ? comingSoonLabelRaw.trim()
            : null;

        if (!key) {
            return NextResponse.json({ error: "Missing key" }, { status: 400 });
        }

        const admin = createSupabaseServiceClient();
        const { data, error } = await admin
            .from("global_feature_flags")
            .upsert(
                {
                    key,
                    enabled,
                    hidden,
                    coming_soon_label,
                    updated_at: new Date().toISOString(),
                    updated_by: auth.userId,
                },
                { onConflict: "key" },
            )
            .select(
                "key, enabled, hidden, coming_soon_label, updated_at, updated_by",
            )
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ flag: data });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || "Server error" }, {
            status: 500,
        });
    }
}

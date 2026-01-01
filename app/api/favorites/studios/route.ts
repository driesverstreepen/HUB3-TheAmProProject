import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

function createAuthClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    return cookieStore.get(name)?.value;
                },
            },
        },
    );
}

function createServiceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } },
    );
}

export async function GET() {
    try {
        const cookieStore = await cookies();
        const authClient = createAuthClient(cookieStore);
        const { data: auth, error: authError } = await authClient.auth
            .getUser();

        if (authError || !auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, {
                status: 401,
            });
        }

        const supabase = createServiceClient();

        const { data, error } = await supabase
            .from("user_favorite_studios")
            .select(
                "created_at, studio:studios(id, naam, stad, location, beschrijving, logo_url)",
            )
            .eq("user_id", auth.user.id)
            .order("created_at", { ascending: false });

        if (error) throw error;

        const studios = (data || [])
            .map((row: any) => row?.studio)
            .filter(Boolean);

        return NextResponse.json({ studios });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "Server error" }, {
            status: 500,
        });
    }
}

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const authClient = createAuthClient(cookieStore);
        const { data: auth, error: authError } = await authClient.auth
            .getUser();

        if (authError || !auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, {
                status: 401,
            });
        }

        const body = await request.json().catch(() => ({} as any));
        const studioId = String(body?.studio_id || body?.studioId || "");

        if (!studioId) {
            return NextResponse.json({ error: "Missing studio_id" }, {
                status: 400,
            });
        }

        const supabase = createServiceClient();

        const { error } = await supabase
            .from("user_favorite_studios")
            .upsert(
                { user_id: auth.user.id, studio_id: studioId },
                { onConflict: "user_id,studio_id", ignoreDuplicates: true },
            );

        if (error) throw error;

        return NextResponse.json({ ok: true });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "Server error" }, {
            status: 500,
        });
    }
}

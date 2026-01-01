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

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ studioId: string }> },
) {
    try {
        const { studioId } = await params;

        const cookieStore = await cookies();
        const authClient = createAuthClient(cookieStore);
        const { data: auth, error: authError } = await authClient.auth
            .getUser();

        if (authError || !auth?.user) {
            return NextResponse.json({ favorited: false }, { status: 200 });
        }

        const supabase = createServiceClient();

        const { data, error } = await supabase
            .from("user_favorite_studios")
            .select("id")
            .eq("user_id", auth.user.id)
            .eq("studio_id", studioId)
            .maybeSingle();

        if (error) throw error;

        return NextResponse.json({ favorited: !!data });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "Server error" }, {
            status: 500,
        });
    }
}

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ studioId: string }> },
) {
    try {
        const { studioId } = await params;

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

        const { error } = await supabase
            .from("user_favorite_studios")
            .delete()
            .eq("user_id", auth.user.id)
            .eq("studio_id", studioId);

        if (error) throw error;

        return NextResponse.json({ ok: true });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "Server error" }, {
            status: 500,
        });
    }
}

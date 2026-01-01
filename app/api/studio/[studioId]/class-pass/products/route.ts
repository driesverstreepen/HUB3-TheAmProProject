import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { checkStudioAccess } from "@/lib/supabaseHelpers";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ studioId: string }> },
) {
    try {
        const { studioId } = await params;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { searchParams } = new URL(request.url);
        const includeInactive = searchParams.get("includeInactive") === "true";

        let q = supabase
            .from("class_pass_products")
            .select("*")
            .eq("studio_id", studioId);

        if (!includeInactive) {
            q = q.eq("active", true);
        }

        const { data, error } = await q.order("created_at", {
            ascending: false,
        });
        if (error) throw error;
        return NextResponse.json({ items: data || [] });
    } catch (err: any) {
        console.error("[class-pass/products][GET]", err);
        return NextResponse.json({ error: "Failed to load products" }, {
            status: 500,
        });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ studioId: string }> },
) {
    try {
        const { studioId } = await params;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        // Use Supabase SSR client with awaited cookies for Next.js 15/16
        const cookieStore = await cookies();
        const supabase = createServerClient(supabaseUrl, supabaseKey, {
            cookies: {
                get(name: string) {
                    return cookieStore.get(name)?.value;
                },
                set() {
                    // no-op in route handler
                },
                remove() {
                    // no-op in route handler
                },
            },
        });
        const admin = serviceRoleKey
            ? createClient(supabaseUrl, serviceRoleKey)
            : null;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: "Not authenticated" }, {
                status: 401,
            });
        }

        // Verify access using service role when possible to avoid RLS recursion
        let hasAccess = false;
        if (admin) {
            const { data: member } = await admin
                .from("studio_members")
                .select("role")
                .eq("studio_id", studioId)
                .eq("user_id", user.id)
                .maybeSingle();
            if (
                member && (member as any).role &&
                ["owner", "admin"].includes((member as any).role)
            ) {
                hasAccess = true;
            } else {
                // Fallback: Allow studio owners (legacy) based on studios.eigenaar_id
                const { data: studioOwner } = await admin
                    .from("studios")
                    .select("id, eigenaar_id")
                    .eq("id", studioId)
                    .maybeSingle();
                if (
                    studioOwner && (studioOwner as any).eigenaar_id === user.id
                ) hasAccess = true;
            }
        } else {
            const access = await checkStudioAccess(supabase, studioId, user.id);
            hasAccess = access.hasAccess;
        }
        if (!hasAccess) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await request.json();
        const {
            name,
            description,
            credit_count,
            price_cents,
            currency = "eur",
            expiration_months,
        } = body || {};

        if (!name || !credit_count || typeof price_cents !== "number") {
            return NextResponse.json({ error: "Missing required fields" }, {
                status: 400,
            });
        }

        const insertPayload: any = {
            studio_id: studioId,
            name,
            description: description || null,
            credit_count: Number(credit_count),
            price_cents: Number(price_cents),
            currency,
            expiration_months: expiration_months
                ? Number(expiration_months)
                : null,
            active: true,
        };

        const clientForWrite = admin || supabase;
        const { data: product, error } = await clientForWrite
            .from("class_pass_products")
            .insert(insertPayload)
            .select("*")
            .maybeSingle();

        if (error) throw error;

        return NextResponse.json({ item: product });
    } catch (err: any) {
        console.error("[class-pass/products][POST]", err);
        return NextResponse.json({ error: "Failed to create product" }, {
            status: 500,
        });
    }
}

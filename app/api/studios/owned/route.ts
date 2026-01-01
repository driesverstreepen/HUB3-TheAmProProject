import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    console.warn("Missing Supabase env for server-side endpoint");
}

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({} as any));
        const access_token = body?.access_token as string | undefined;

        if (!access_token) {
            return NextResponse.json(
                { error: "missing_auth", details: "Provide access_token" },
                { status: 400 },
            );
        }

        const supabase = createClient(
            SUPABASE_URL || "",
            SUPABASE_SERVICE_ROLE || "",
        );

        // Validate token and resolve user id using Auth REST endpoint
        const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: {
                Authorization: `Bearer ${access_token}`,
                apikey: SUPABASE_SERVICE_ROLE || "",
            },
        });

        if (!userResp.ok) {
            const text = await userResp.text().catch(() => "");
            return NextResponse.json(
                {
                    error: "invalid_token",
                    details: text || "failed to validate token",
                },
                { status: 401 },
            );
        }

        const userData = await userResp.json().catch(() => ({} as any));
        const userId = userData?.id as string | undefined;
        if (!userId) {
            return NextResponse.json(
                { error: "invalid_token", details: "no user id" },
                { status: 401 },
            );
        }

        const studioResp = await supabase
            .from("studios")
            .select(
                "id, naam, location, contact_email, phone_number, eigenaar_id",
            )
            .eq("eigenaar_id", userId)
            .maybeSingle();

        if (studioResp.error) {
            return NextResponse.json(
                { error: "db_error", details: studioResp.error.message },
                { status: 500 },
            );
        }

        if (!studioResp.data?.id) {
            return NextResponse.json({ studio: null }, { status: 200 });
        }

        return NextResponse.json({ studio: studioResp.data }, { status: 200 });
    } catch (e: any) {
        console.error("[/api/studios/owned] failed:", e);
        return NextResponse.json(
            { error: "unexpected", details: e?.message || String(e) },
            { status: 500 },
        );
    }
}

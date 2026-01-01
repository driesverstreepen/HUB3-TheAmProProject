import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase";

export const revalidate = 3600;

export async function GET() {
    try {
        const supabase = createSupabaseServiceClient();

        const { data, error } = await supabase
            .from("studios")
            .select(
                "id, naam, beschrijving, adres, stad, postcode, website, phone_number, contact_email, is_public, logo_url",
            )
            .eq("is_public", true)
            .order("naam", { ascending: true });

        if (error) {
            return NextResponse.json(
                { error: error.message || "Failed to load public studios" },
                { status: 500 },
            );
        }

        return NextResponse.json({ studios: data || [] });
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Unexpected error" },
            { status: 500 },
        );
    }
}

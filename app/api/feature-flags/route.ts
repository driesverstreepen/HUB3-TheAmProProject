import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase";

export async function GET() {
    try {
        const admin = createSupabaseServiceClient();

        const { data, error } = await admin
            .from("global_feature_flags")
            .select("key, enabled, hidden, coming_soon_label, updated_at")
            .order("key", { ascending: true });

        if (error) {
            // If the table isn't deployed yet, treat as no flags.
            if ((error as any)?.code === "PGRST205") {
                return NextResponse.json({ flags: [] });
            }
            return NextResponse.json(
                { error: error.message || "Failed to load feature flags" },
                { status: 500 },
            );
        }

        return NextResponse.json({ flags: data || [] });
    } catch (err: any) {
        return NextResponse.json(
            { error: err?.message || "Server error" },
            { status: 500 },
        );
    }
}

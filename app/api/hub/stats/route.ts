import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase";

export const revalidate = 3600;

export async function GET() {
    try {
        const supabase = createSupabaseServiceClient();

        // Count public studios
        const { count: studiosCount, error: studiosError } = await supabase
            .from("studios")
            .select("*", { count: "exact", head: true })
            .eq("is_public", true);

        if (studiosError) {
            return NextResponse.json({
                error: studiosError.message || "Failed to count studios",
            }, { status: 500 });
        }

        // Count public teachers (public profiles)
        const { count: teachersCount, error: teachersError } = await supabase
            .from("public_teacher_profiles")
            .select("*", { count: "exact", head: true })
            .neq("is_public", false);

        if (teachersError) {
            return NextResponse.json({
                error: teachersError.message || "Failed to count teachers",
            }, { status: 500 });
        }

        // For workshops, count public programs of type 'workshop' that belong to public studios
        const { data: publicStudios } = await supabase.from("studios").select(
            "id",
        ).eq("is_public", true);
        const studioIds = (publicStudios || []).map((s: any) => s.id).filter(
            Boolean,
        );

        let workshopsCount = 0;
        if (studioIds.length > 0) {
            const { count: wCount, error: wError } = await supabase
                .from("programs")
                .select("*", { count: "exact", head: true })
                .eq("is_public", true)
                .eq("program_type", "workshop")
                .in("studio_id", studioIds);

            if (wError) {
                return NextResponse.json({
                    error: wError.message || "Failed to count workshops",
                }, { status: 500 });
            }
            workshopsCount = wCount || 0;
        }

        return NextResponse.json({
            totalWorkshops: workshopsCount || 0,
            totalTeachers: teachersCount || 0,
            totalStudios: studiosCount || 0,
        });
    } catch (error: any) {
        return NextResponse.json({
            error: error?.message || "Unexpected error",
        }, { status: 500 });
    }
}

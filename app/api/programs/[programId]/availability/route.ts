import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ programId: string }> },
) {
    try {
        const { programId } = await params;

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { data: program, error: programErr } = await supabase
            .from("programs")
            .select(
                "id, studio_id, capacity, waitlist_enabled, manual_full_override, is_public",
            )
            .eq("id", programId)
            .maybeSingle();

        if (programErr) throw programErr;
        if (!program) {
            return NextResponse.json({ error: "Program not found" }, {
                status: 404,
            });
        }

        const capacity = typeof program.capacity === "number"
            ? program.capacity
            : null;

        // Count active enrollments only
        const { count: activeCount, error: countErr } = await supabase
            .from("inschrijvingen")
            .select("id", { count: "exact", head: true })
            .eq("program_id", programId)
            .eq("status", "actief");

        if (countErr) throw countErr;

        const enrolledCount = activeCount || 0;
        const isFullByCapacity = !!capacity && capacity > 0 &&
            enrolledCount >= capacity;
        const isFull = !!(program as any).manual_full_override ||
            isFullByCapacity;

        const waitlistEnabled = !!(program as any).waitlist_enabled &&
            !!capacity && capacity > 0;

        // Optional: resolve user waitlist status if Authorization is present
        let userWaitlistStatus: "none" | "waitlisted" | "accepted" = "none";
        const authHeader = req.headers.get("authorization") || "";
        const token = authHeader.startsWith("Bearer ")
            ? authHeader.slice("Bearer ".length)
            : null;

        if (token) {
            const { data: userRes } = await supabase.auth.getUser(token);
            const user = userRes?.user;
            if (user?.id) {
                const { data: row } = await supabase
                    .from("inschrijvingen")
                    .select("status")
                    .eq("user_id", user.id)
                    .eq("program_id", programId)
                    .in("status", ["waitlisted", "waitlist_accepted"])
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (row?.status === "waitlisted") {
                    userWaitlistStatus = "waitlisted";
                }
                if (row?.status === "waitlist_accepted") {
                    userWaitlistStatus = "accepted";
                }
            }
        }

        return NextResponse.json({
            program_id: programId,
            capacity,
            enrolledCount,
            isFull,
            waitlistEnabled,
            userWaitlistStatus,
        });
    } catch (error: any) {
        console.error("[availability] error", error);
        return NextResponse.json({ error: error?.message || "Server error" }, {
            status: 500,
        });
    }
}

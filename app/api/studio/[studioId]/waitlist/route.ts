import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPushToUserIds } from "@/lib/pushDispatch";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ studioId: string }> },
) {
    try {
        const authHeader = req.headers.get("authorization") || "";
        const token = authHeader.startsWith("Bearer ")
            ? authHeader.slice("Bearer ".length)
            : null;
        if (!token) {
            return NextResponse.json({ error: "Unauthorized" }, {
                status: 401,
            });
        }

        const body = await req.json();
        const { studioId } = await params;

        const programId = String(body?.program_id || "").trim();
        const userId = String(body?.user_id || "").trim();
        const action = String(body?.action || "accept").trim();

        if (!programId || !userId) {
            return NextResponse.json({
                error: "program_id and user_id are required",
            }, { status: 400 });
        }
        if (action !== "accept") {
            return NextResponse.json({ error: "Unsupported action" }, {
                status: 400,
            });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Verify requester
        const { data: userRes } = await supabase.auth.getUser(token);
        const requester = userRes?.user;
        if (!requester) {
            return NextResponse.json({ error: "Unauthorized" }, {
                status: 401,
            });
        }

        const { data: roleData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", requester.id)
            .eq("studio_id", studioId)
            .maybeSingle();

        if (!roleData || !["studio_admin", "admin"].includes(roleData.role)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Verify program belongs to studio and waitlist enabled
        const { data: program, error: programErr } = await supabase
            .from("programs")
            .select(
                "id, title, capacity, waitlist_enabled, manual_full_override",
            )
            .eq("id", programId)
            .eq("studio_id", studioId)
            .maybeSingle();

        if (programErr) throw programErr;
        if (!program) {
            return NextResponse.json({ error: "Program not found" }, {
                status: 404,
            });
        }

        const capacity = typeof (program as any).capacity === "number"
            ? (program as any).capacity
            : null;
        if (!((program as any).waitlist_enabled && capacity && capacity > 0)) {
            return NextResponse.json({ error: "Waitlist is not enabled" }, {
                status: 400,
            });
        }

        // Check capacity (active enrollments only)
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

        if (!isFull) {
            // If not full, no need for waitlist; allow admin to just ask them to enroll normally.
            return NextResponse.json({ error: "Program is not full" }, {
                status: 409,
            });
        }

        const { data: updated, error: updErr } = await supabase
            .from("inschrijvingen")
            .update({
                status: "waitlist_accepted",
                updated_at: new Date().toISOString(),
            })
            .eq("program_id", programId)
            .eq("user_id", userId)
            .eq("status", "waitlisted")
            .select("id")
            .maybeSingle();

        if (updErr) throw updErr;
        if (!updated?.id) {
            return NextResponse.json({ error: "Waitlist entry not found" }, {
                status: 404,
            });
        }

        // Notify user
        const title = "Plaats vrijgekomen";
        const message =
            `Je bent toegelaten tot ${program.title}. Je kan nu inschrijven en betalen.`;

        const { error: notifErr } = await supabase
            .from("notifications")
            .insert({
                user_id: userId,
                type: "info",
                title,
                message,
                action_type: "waitlist_enrollment",
                action_data: { program_id: programId },
                read: false,
            });

        if (notifErr) throw notifErr;

        // Push mirrors in-app notification (best-effort)
        try {
            await sendPushToUserIds([userId], {
                title,
                body: message,
                url: `/program/${programId}`,
            });
        } catch {
            // ignore
        }

        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error("[studio/waitlist] error", error);
        return NextResponse.json({ error: error?.message || "Server error" }, {
            status: 500,
        });
    }
}

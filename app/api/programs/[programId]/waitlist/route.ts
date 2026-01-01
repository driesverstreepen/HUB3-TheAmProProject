import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const buildSnapshotFromProfile = (p: any) => ({
    first_name: p?.first_name || p?.voornaam || null,
    last_name: p?.last_name || p?.achternaam || null,
    street: p?.street || p?.adres || null,
    house_number: p?.house_number || p?.huisnummer || null,
    house_number_addition: p?.house_number_addition ||
        p?.huisnummer_toevoeging || null,
    postal_code: p?.postal_code || p?.postcode || null,
    city: p?.city || p?.stad || null,
    phone_number: p?.phone_number || p?.telefoon || null,
    email: p?.email || null,
    date_of_birth: p?.date_of_birth || p?.geboortedatum || null,
});

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ programId: string }> },
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

        const { programId } = await params;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { data: userRes } = await supabase.auth.getUser(token);
        const user = userRes?.user;
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, {
                status: 401,
            });
        }

        const { data: program, error: programErr } = await supabase
            .from("programs")
            .select(
                "id, studio_id, capacity, waitlist_enabled, manual_full_override",
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
        const waitlistEnabled = !!(program as any).waitlist_enabled &&
            !!capacity && capacity > 0;

        if (!waitlistEnabled) {
            return NextResponse.json({ error: "Waitlist is not enabled" }, {
                status: 400,
            });
        }

        // Count active enrollments
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
            return NextResponse.json({ error: "Program is not full" }, {
                status: 409,
            });
        }

        // Block if already actively enrolled
        const { data: existingActive } = await supabase
            .from("inschrijvingen")
            .select("id")
            .eq("user_id", user.id)
            .eq("program_id", programId)
            .eq("status", "actief")
            .maybeSingle();

        if (existingActive?.id) {
            return NextResponse.json({ error: "Already enrolled" }, {
                status: 409,
            });
        }

        // Idempotent join: if already waitlisted/accepted, return current status
        const { data: existingWait } = await supabase
            .from("inschrijvingen")
            .select("id, status")
            .eq("user_id", user.id)
            .eq("program_id", programId)
            .in("status", ["waitlisted", "waitlist_accepted"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (existingWait?.id) {
            return NextResponse.json({ ok: true, status: existingWait.status });
        }

        // Load user profile snapshot (best-effort)
        let snapshot: any = {};
        try {
            const { data: up } = await supabase
                .from("user_profiles")
                .select("*")
                .eq("user_id", user.id)
                .maybeSingle();
            snapshot = buildSnapshotFromProfile(up);
        } catch {
            snapshot = { email: user.email || null };
        }

        const { data: ins, error: insErr } = await supabase
            .from("inschrijvingen")
            .insert({
                user_id: user.id,
                program_id: programId,
                status: "waitlisted",
                form_data: {},
                profile_snapshot: snapshot || {},
            })
            .select("id, status")
            .single();

        if (insErr) throw insErr;

        return NextResponse.json({
            ok: true,
            status: ins?.status || "waitlisted",
        }, { status: 201 });
    } catch (error: any) {
        console.error("[waitlist/join] error", error);
        return NextResponse.json({ error: error?.message || "Server error" }, {
            status: 500,
        });
    }
}

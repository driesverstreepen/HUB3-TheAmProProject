import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
    try {
        // 1) Resolve clients
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

        // Read user session via cookies
        const cookieHeader = request.headers.get("cookie");
        const userClient = createClient(supabaseUrl, supabaseAnon, {
            global: { headers: cookieHeader ? { cookie: cookieHeader } : {} },
        });

        const { data: { user } } = await userClient.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: "Not authenticated" }, {
                status: 401,
            });
        }

        if (!serviceRole) {
            return NextResponse.json({ error: "Server misconfiguration" }, {
                status: 500,
            });
        }
        const admin = createClient(supabaseUrl, serviceRole);

        // 2) Validate input
        const body = await request.json();
        const {
            studio_id,
            program_id,
            lesson_id,
            profile_snapshot,
            sub_profile_id,
        } = body ||
            {};
        if (!studio_id || !program_id || !lesson_id) {
            return NextResponse.json({
                error: "Missing studio_id, program_id or lesson_id",
            }, { status: 400 });
        }

        // 3) Validate program eligibility and ownership
        const { data: program, error: progErr } = await admin
            .from("programs")
            .select(
                "id, studio_id, accepts_class_passes, class_pass_product_id",
            )
            .eq("id", program_id)
            .maybeSingle();
        if (progErr) throw progErr;
        if (!program) {
            return NextResponse.json({ error: "Program not found" }, {
                status: 404,
            });
        }
        if (String(program.studio_id) !== String(studio_id)) {
            return NextResponse.json({
                error: "Program does not belong to studio",
            }, { status: 400 });
        }
        if (!program.accepts_class_passes) {
            return NextResponse.json({
                error: "Program does not accept class passes",
            }, { status: 422 });
        }

        // 4) Load candidate purchases (paid, not expired, has remaining credits)
        // If program is scoped to a specific product, restrict to that product_id.
        const baseFilters = admin
            .from("class_pass_purchases")
            .select("id, credits_total, credits_used, expires_at, product_id")
            .eq("user_id", user.id)
            .eq("studio_id", studio_id)
            .eq("status", "paid")
            .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
            .order("expires_at", { ascending: true, nullsFirst: false });

        const { data: purchases, error: pErr } = program.class_pass_product_id
            ? await baseFilters.eq("product_id", program.class_pass_product_id)
            : await baseFilters;
        if (pErr) throw pErr;

        // 5) Choose the first eligible purchase with remaining credits
        const firstEligible = (purchases || []).find((p: any) => {
            return (p.credits_used || 0) < (p.credits_total || 0);
        });

        if (!firstEligible) {
            return NextResponse.json({
                error: "Geen geldige beurtenkaart voor dit programma",
            }, { status: 402 });
        }

        // 6) Duplicate enrollment guard (user/sub_profile + lesson)
        let dupQuery = admin
            .from("inschrijvingen")
            .select("id, form_data")
            .eq("user_id", user.id)
            .eq("program_id", program_id)
            .contains("form_data", { lesson_id })
            .limit(1);
        if (sub_profile_id) {
            dupQuery = dupQuery.eq("sub_profile_id", sub_profile_id);
        } else {
            dupQuery = dupQuery.is("sub_profile_id", null);
        }
        const { data: existingEnrollment, error: dupErr } = await dupQuery;
        if (dupErr) throw dupErr;
        if ((existingEnrollment || []).length > 0) {
            return NextResponse.json(
                { error: "Al ingeschreven voor deze les" },
                { status: 409 },
            );
        }

        // 7) Reserve 1 credit (optimistic; guard against overuse)
        const { error: updErr } = await admin
            .from("class_pass_purchases")
            .update({ credits_used: (firstEligible.credits_used || 0) + 1 })
            .eq("id", firstEligible.id)
            .lte("credits_used", (firstEligible.credits_total || 0) - 1);

        if (updErr) {
            return NextResponse.json({ error: "Kon credits niet reserveren" }, {
                status: 409,
            });
        }

        // 8) Create enrollment
        const snapshot = profile_snapshot || {};
        const { data: insData, error: insErr } = await admin
            .from("inschrijvingen")
            .insert({
                user_id: user.id,
                program_id,
                status: "actief",
                form_data: { lesson_id },
                profile_snapshot: snapshot,
                sub_profile_id: sub_profile_id || null,
            })
            .select("id")
            .maybeSingle();

        if (insErr) {
            // Roll back credit reservation (best effort)
            await admin
                .from("class_pass_purchases")
                .update({ credits_used: firstEligible.credits_used })
                .eq("id", firstEligible.id);
            return NextResponse.json({
                error: "Kon inschrijving niet aanmaken",
            }, { status: 500 });
        }

        // 9) Ledger entry for consumption (best effort)
        const enrollmentId = (insData as any)?.id;
        const { error: ledErr } = await admin
            .from("class_pass_ledger")
            .insert({
                user_id: user.id,
                studio_id,
                purchase_id: firstEligible.id,
                delta: -1,
                reason: "enrollment",
                program_id,
                lesson_id,
                enrollment_id: enrollmentId || null,
            });
        if (ledErr) {
            console.warn(
                "Inserted enrollment but failed to write ledger entry:",
                ledErr,
            );
        }

        return NextResponse.json({
            success: true,
            enrollment_id: enrollmentId,
        });
    } catch (err: any) {
        console.error("[class-pass/enroll] error:", err);
        return NextResponse.json({
            error: err.message || "Failed to enroll with class pass",
        }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// GET /api/class-pass/status?studio_id=...&program_id=...&lesson_id=...&sub_profile_id=...
// Returns remaining credits (scoped if program has specific product), eligibility, duplicate enrollment info, purchases list and expiry warnings.
export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const { searchParams } = new URL(request.url);
    const studio_id = searchParams.get("studio_id");
    const program_id = searchParams.get("program_id");
    const lesson_id = searchParams.get("lesson_id");
    const sub_profile_id = searchParams.get("sub_profile_id");

    if (!studio_id || !program_id || !lesson_id) {
      return NextResponse.json({
        error: "Missing studio_id, program_id or lesson_id",
      }, { status: 400 });
    }

    // Auth via request cookies
    const cookieHeader = request.headers.get("cookie");
    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: cookieHeader ? { cookie: cookieHeader } : {} },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!serviceRole) {
      return NextResponse.json({ error: "Server misconfiguration" }, {
        status: 500,
      });
    }
    const admin = createClient(supabaseUrl, serviceRole);

    // Load program (need product scoping)
    const { data: program, error: progErr } = await admin
      .from("programs")
      .select("id, studio_id, accepts_class_passes, class_pass_product_id")
      .eq("id", program_id)
      .maybeSingle();
    if (progErr) throw progErr;
    if (!program) {
      return NextResponse.json({ error: "Program not found" }, { status: 404 });
    }
    if (String(program.studio_id) !== String(studio_id)) {
      return NextResponse.json({ error: "Program/studio mismatch" }, {
        status: 400,
      });
    }

    // Duplicate enrollment check (user/sub_profile + lesson)
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
    const already_enrolled = (existingEnrollment || []).length > 0;

    // If program does not accept class passes, return early
    if (!program.accepts_class_passes) {
      return NextResponse.json({
        accepts_class_passes: false,
        remaining_credits: 0,
        eligible: false,
        already_enrolled,
        reason: "Programma accepteert geen class pass inschrijvingen",
      });
    }

    // Fetch purchases (paid + not expired). Product scoping if set.
    const baseQuery = admin
      .from("class_pass_purchases")
      .select(
        "id, credits_total, credits_used, expires_at, product_id, product:class_pass_products(id, name)",
      )
      .eq("user_id", user.id)
      .eq("studio_id", studio_id)
      .eq("status", "paid")
      .or("expires_at.is.null,expires_at.gt." + new Date().toISOString());

    const { data: purchases, error: pErr } = program.class_pass_product_id
      ? await baseQuery.eq("product_id", program.class_pass_product_id)
      : await baseQuery;
    if (pErr) throw pErr;

    let remaining_credits = 0;
    const detailedPurchases = (purchases || []).map((p: any) => {
      const remaining = Math.max(
        0,
        (p.credits_total || 0) - (p.credits_used || 0),
      );
      remaining_credits += remaining;
      const expires_at = p.expires_at ? new Date(p.expires_at) : null;
      const days_to_expiry = expires_at
        ? Math.ceil((expires_at.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;
      return {
        id: p.id,
        product_id: p.product_id,
        product_name: p.product?.name || null,
        credits_total: p.credits_total,
        credits_used: p.credits_used,
        remaining,
        expires_at: p.expires_at,
        days_to_expiry,
      };
    });

    const upcomingExpiry = detailedPurchases
      .filter((p) => p.expires_at && p.remaining > 0)
      .sort((a, b) =>
        new Date(a.expires_at!).getTime() - new Date(b.expires_at!).getTime()
      )[0] || null;

    const eligible = remaining_credits > 0 && !already_enrolled;

    return NextResponse.json({
      accepts_class_passes: true,
      remaining_credits,
      eligible,
      already_enrolled,
      reason: eligible
        ? null
        : already_enrolled
        ? "Reeds ingeschreven voor deze les"
        : remaining_credits === 0
        ? "Geen resterende credits"
        : null,
      purchases: detailedPurchases,
      upcoming_expiry: upcomingExpiry
        ? {
          purchase_id: upcomingExpiry.id,
          days_to_expiry: upcomingExpiry.days_to_expiry,
          expires_at: upcomingExpiry.expires_at,
          product_name: upcomingExpiry.product_name,
        }
        : null,
    });
  } catch (err: any) {
    console.error("[class-pass/status][GET]", err);
    return NextResponse.json({
      error: err.message || "Failed to load class pass status",
    }, { status: 500 });
  }
}

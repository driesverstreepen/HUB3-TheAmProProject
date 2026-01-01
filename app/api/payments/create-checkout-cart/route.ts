import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function POST(request: Request) {
  try {
    const authHeader = (request as any).headers?.get("cookie") || "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: authHeader ? { cookie: authHeader } : {} },
    });

    const body = await request.json();
    const { cart_id, user_profile_id } = body;

    if (!cart_id) {
      return NextResponse.json({ error: "Missing cart_id" }, { status: 400 });
    }

    // Resolve cart & items
    const { data: cart, error: cartErr } = await supabase
      .from("carts")
      .select("id, user_id, studio_id")
      .eq("id", cart_id)
      .maybeSingle();

    if (cartErr || !cart) {
      return NextResponse.json({ error: "Cart not found" }, { status: 404 });
    }

    const { data: items, error: itemsErr } = await supabase
      .from("cart_items")
      .select("program_id, price_snapshot")
      .eq("cart_id", cart_id);

    if (itemsErr || !items || items.length === 0) {
      return NextResponse.json({ error: "Cart empty or items not found" }, {
        status: 400,
      });
    }

    // For simplicity we assume cart is single-studio (carts.studio_id)
    const studioId = cart.studio_id;

    if (!serviceRoleKey) {
      return NextResponse.json({ error: "Server misconfigured" }, {
        status: 500,
      });
    }
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // Capacity/waitlist enforcement: prevent bypassing waitlist via checkout
    if (!cart.user_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const programIds = items.map((i: any) => i.program_id);
    const { data: capPrograms, error: capErr } = await serviceClient
      .from("programs")
      .select("id, capacity, waitlist_enabled, manual_full_override")
      .in("id", programIds);

    if (capErr) {
      return NextResponse.json({
        error: capErr.message || "Failed to validate capacity",
      }, { status: 500 });
    }

    const { data: activeEnrollments, error: activeErr } = await serviceClient
      .from("inschrijvingen")
      .select("program_id")
      .in("program_id", programIds)
      .eq("status", "actief");

    if (activeErr) {
      return NextResponse.json({
        error: activeErr.message || "Failed to validate capacity",
      }, { status: 500 });
    }

    const enrolledCounts: Record<string, number> = {};
    for (const row of (activeEnrollments || []) as any[]) {
      const pid = String(row.program_id);
      enrolledCounts[pid] = (enrolledCounts[pid] || 0) + 1;
    }

    const { data: acceptedRows, error: acceptedErr } = await serviceClient
      .from("inschrijvingen")
      .select("program_id")
      .eq("user_id", cart.user_id)
      .in("program_id", programIds)
      .eq("status", "waitlist_accepted");

    if (acceptedErr) {
      return NextResponse.json({
        error: acceptedErr.message || "Failed to validate waitlist",
      }, { status: 500 });
    }
    const acceptedSet = new Set(
      (acceptedRows || []).map((r: any) => String(r.program_id)),
    );

    for (const p of (capPrograms || []) as any[]) {
      const cap = typeof p.capacity === "number" ? p.capacity : null;
      const count = enrolledCounts[String(p.id)] || 0;
      const isFull = !!p.manual_full_override ||
        (!!cap && cap > 0 && count >= cap);
      if (!isFull) continue;

      const waitlistEnabled = !!p.waitlist_enabled && !!cap && cap > 0;
      if (!waitlistEnabled) {
        return NextResponse.json(
          { error: "Program is full", program_id: p.id },
          { status: 409 },
        );
      }
      if (!acceptedSet.has(String(p.id))) {
        return NextResponse.json({
          error: "Waitlist required",
          program_id: p.id,
        }, { status: 409 });
      }
    }

    // Fetch programs with stripe product/price mapping
    const { data: programs } = await supabase
      .from("programs")
      .select("id, titel, stripe_products(*, stripe_prices(*))")
      .in("id", programIds);

    // Build line_items by finding active stripe_price for each program
    const line_items: any[] = [];
    for (const item of items) {
      const program = (programs || []).find((p: any) =>
        p.id === item.program_id
      );
      const stripeProduct = program?.stripe_products?.[0];
      if (!stripeProduct) {
        return NextResponse.json({
          error: `Program ${program?.id} not configured for payments`,
        }, { status: 400 });
      }
      const stripePrice = stripeProduct.stripe_prices?.find((p: any) =>
        p.active
      );
      if (!stripePrice) {
        return NextResponse.json({
          error: `No active price for program ${program?.id}`,
        }, { status: 400 });
      }

      line_items.push({
        price: stripePrice.stripe_price_id,
        quantity: 1,
      });
    }

    // Get studio stripe account from studios table
    const { data: studio } = await supabase
      .from("studios")
      .select(
        "id, stripe_account_id, stripe_account_data, stripe_payouts_enabled",
      )
      .eq("id", studioId)
      .maybeSingle();

    const studioStripeAccount = studio?.stripe_account_id
      ? {
        stripe_account_id: studio.stripe_account_id,
        ...(studio.stripe_account_data || {}),
      }
      : null;

    if (!studioStripeAccount || !studioStripeAccount.charges_enabled) {
      return NextResponse.json({ error: "Studio payments not configured" }, {
        status: 400,
      });
    }

    // Platform fee config (use service client)
    const { data: platformConfig } = await serviceClient
      .from("platform_stripe_config")
      .select("platform_fee_percent")
      .maybeSingle();

    const platformFeePercent = platformConfig?.platform_fee_percent || 10;

    // Calculate total amount (sum of price_snapshots) in cents
    const totalAmount = items.reduce(
      (s: number, it: any) => s + (it.price_snapshot || 0),
      0,
    );
    const platformFeeAmount = Math.round(
      (totalAmount * platformFeePercent) / 100,
    );

    // Success/cancel URLs
    const origin = (request as any).headers?.get("origin") ||
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const successUrl =
      `${origin}/checkout/${cart_id}/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/cart`;

    // Create session
    const sessionData: any = {
      mode: "payment",
      line_items,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        cart_id,
        user_profile_id: user_profile_id || "",
        studio_id: studioId,
      },
      payment_intent_data: {
        application_fee_amount: platformFeeAmount,
        transfer_data: {
          destination: studioStripeAccount.stripe_account_id,
        },
      },
    };

    // If user email known via profile, use customer_email on session
    if (user_profile_id) {
      const { data: profile } = await supabase.from("user_profiles").select(
        "email",
      ).eq("id", user_profile_id).maybeSingle();
      if (profile?.email) sessionData.customer_email = profile.email;
    }

    // Create the session on the platform so the platform can collect the
    // application fee and transfer the remainder to the connected account.
    const session = await stripe.checkout.sessions.create(sessionData);

    // Record transaction
    await serviceClient.from("stripe_transactions").insert({
      user_id: cart.user_id || null,
      studio_id: studioId,
      program_id: null,
      stripe_checkout_session_id: session.id,
      stripe_account_id: studioStripeAccount.stripe_account_id,
      amount: totalAmount,
      platform_fee: platformFeeAmount,
      net_amount: totalAmount - platformFeeAmount,
      currency: "eur",
      status: "pending",
      description: `Cart payment ${cart_id}`,
      metadata: { cart_id },
    });

    return NextResponse.json({
      success: true,
      session_id: session.id,
      url: session.url,
    });
  } catch (err: any) {
    console.error("Error creating cart checkout session:", err);
    return NextResponse.json({
      error: err.message || "Failed to create checkout session",
    }, { status: 500 });
  }
}

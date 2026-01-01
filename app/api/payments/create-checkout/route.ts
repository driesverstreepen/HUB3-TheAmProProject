import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("cookie");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: authHeader ? { cookie: authHeader } : {} },
    });

    // Get user (can be guest or authenticated)
    const { data: { user } } = await supabase.auth.getUser();

    const body = await request.json();
    const { program_id, user_profile_id, cart_id } = body;

    // Get program details
    const { data: program, error: programError } = await supabase
      .from("programs")
      .select("*, stripe_products(*, stripe_prices(*))")
      .eq("id", program_id)
      .single();

    if (programError || !program) {
      return NextResponse.json({ error: "Program not found" }, { status: 404 });
    }

    // Capacity/waitlist enforcement: prevent bypassing waitlist via checkout
    if (serviceRoleKey) {
      const serviceClient = createClient(supabaseUrl, serviceRoleKey);

      const { data: capProgram, error: capErr } = await serviceClient
        .from("programs")
        .select("id, capacity, waitlist_enabled, manual_full_override")
        .eq("id", program_id)
        .maybeSingle();

      if (capErr) {
        return NextResponse.json({
          error: capErr.message || "Failed to validate capacity",
        }, { status: 500 });
      }

      if (capProgram) {
        const cap = typeof (capProgram as any).capacity === "number"
          ? (capProgram as any).capacity
          : null;
        const waitlistEnabled = !!(capProgram as any).waitlist_enabled &&
          !!cap && cap > 0;

        if (cap && cap > 0) {
          const { count: activeCount, error: countErr } = await serviceClient
            .from("inschrijvingen")
            .select("id", { count: "exact", head: true })
            .eq("program_id", program_id)
            .eq("status", "actief");

          if (countErr) {
            return NextResponse.json({
              error: countErr.message || "Failed to validate capacity",
            }, { status: 500 });
          }

          const enrolled = activeCount || 0;
          const isFull = !!(capProgram as any).manual_full_override ||
            enrolled >= cap;
          if (isFull) {
            if (!waitlistEnabled) {
              return NextResponse.json({ error: "Program is full" }, {
                status: 409,
              });
            }

            const uid = user?.id;
            if (!uid) {
              return NextResponse.json({ error: "Waitlist required" }, {
                status: 409,
              });
            }

            const { data: accepted } = await serviceClient
              .from("inschrijvingen")
              .select("id")
              .eq("program_id", program_id)
              .eq("user_id", uid)
              .eq("status", "waitlist_accepted")
              .maybeSingle();

            if (!accepted?.id) {
              return NextResponse.json({ error: "Waitlist required" }, {
                status: 409,
              });
            }
          }
        }
      }
    }

    // Check if program has Stripe product
    const stripeProduct = program.stripe_products?.[0];
    if (!stripeProduct) {
      return NextResponse.json({
        error: "Program not configured for online payments",
      }, { status: 400 });
    }

    // Get first active price
    const stripePrice = stripeProduct.stripe_prices?.find((p: any) => p.active);
    if (!stripePrice) {
      return NextResponse.json({
        error: "No price configured for this program",
      }, { status: 400 });
    }

    // Get studio's Stripe account info from studios
    const { data: studio } = await supabase
      .from("studios")
      .select(
        "id, stripe_account_id, stripe_account_data, stripe_payouts_enabled",
      )
      .eq("id", program.studio_id)
      .single();

    const studioStripeAccount = studio?.stripe_account_id
      ? {
        stripe_account_id: studio.stripe_account_id,
        ...(studio.stripe_account_data || {}),
      }
      : null;

    if (!studioStripeAccount || !studioStripeAccount.charges_enabled) {
      return NextResponse.json({
        error: "Stripe account not configured or not enabled for charges",
      }, { status: 400 });
    }

    // Get platform fee
    const { data: platformConfig } = await supabase
      .from("platform_stripe_config")
      .select("platform_fee_percent")
      .single();

    const platformFeePercent = platformConfig?.platform_fee_percent || 10;

    // Calculate platform fee amount
    const totalAmount = stripePrice.amount;
    const platformFeeAmount = Math.round(
      (totalAmount * platformFeePercent) / 100,
    );

    // Prepare success and cancel URLs
    const origin = request.headers.get("origin") ||
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const successUrl = cart_id
      ? `${origin}/checkout/${cart_id}/success?session_id={CHECKOUT_SESSION_ID}`
      : `${origin}/program/${program_id}/enrollment-success?session_id={CHECKOUT_SESSION_ID}`;

    const cancelUrl = cart_id
      ? `${origin}/cart`
      : `${origin}/program/${program_id}`;

    // Create checkout session with platform fee
    const sessionData: any = {
      mode: stripePrice.interval ? "subscription" : "payment",
      line_items: [
        {
          price: stripePrice.stripe_price_id,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        program_id,
        user_profile_id: user_profile_id || "",
        cart_id: cart_id || "",
        studio_id: program.studio_id,
      },
      payment_intent_data: {
        application_fee_amount: platformFeeAmount,
        metadata: {
          program_id,
          studio_id: program.studio_id,
          platform_fee: platformFeePercent.toString(),
        },
      },
    };

    // If user is logged in, use their email
    if (user?.email) {
      sessionData.customer_email = user.email;
    }

    // Create the session on the platform so we can collect an application fee
    // and transfer the remainder to the connected account via transfer_data.
    // Do NOT pass the `stripeAccount` option here when using application fees.
    const session = await stripe.checkout.sessions.create(sessionData);

    // Create transaction record
    await supabase
      .from("stripe_transactions")
      .insert({
        user_id: user?.id || null,
        studio_id: program.studio_id,
        program_id: program.id,
        stripe_checkout_session_id: session.id,
        stripe_account_id: studioStripeAccount.stripe_account_id,
        amount: totalAmount,
        platform_fee: platformFeeAmount,
        net_amount: totalAmount - platformFeeAmount,
        currency: stripePrice.currency,
        status: "pending",
        description: `Payment for ${program.titel}`,
        metadata: {
          cart_id,
          user_profile_id,
        },
      });

    return NextResponse.json({
      success: true,
      session_id: session.id,
      url: session.url,
    });
  } catch (error: any) {
    console.error("Error creating checkout session:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create checkout session" },
      { status: 500 },
    );
  }
}

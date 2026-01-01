import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ studioId: string }> },
) {
    try {
        const { studioId } = await params;
        const authHeader = request.headers.get("cookie");
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey, {
            global: { headers: authHeader ? { cookie: authHeader } : {} },
        });

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: "Not authenticated" }, {
                status: 401,
            });
        }

        const body = await request.json();
        const { product_id } = body || {};
        if (!product_id) {
            return NextResponse.json({ error: "Missing product_id" }, {
                status: 400,
            });
        }

        // Fetch product and studio info
        const { data: product, error: prodErr } = await supabase
            .from("class_pass_products")
            .select(
                "id, studio_id, name, description, credit_count, price_cents, currency, active, expiration_months",
            )
            .eq("id", product_id)
            .eq("studio_id", studioId)
            .maybeSingle();

        if (prodErr || !product) {
            return NextResponse.json({ error: "Product not found" }, {
                status: 404,
            });
        }
        if (product.active !== true) {
            return NextResponse.json({ error: "Product is inactive" }, {
                status: 400,
            });
        }

        // Get studio's Stripe account
        const { data: studio } = await supabase
            .from("studios")
            .select(
                "id, naam, stripe_account_id, stripe_account_data, stripe_payouts_enabled",
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
            return NextResponse.json({
                error: "Stripe not configured for studio",
            }, { status: 400 });
        }

        // Platform fee percent (if configured)
        const { data: platformConfig } = await supabase
            .from("platform_stripe_config")
            .select("platform_fee_percent")
            .maybeSingle();

        const platformFeePercent = platformConfig?.platform_fee_percent || 10;
        const totalAmount = product.price_cents;
        const platformFeeAmount = Math.round(
            (totalAmount * platformFeePercent) / 100,
        );

        // Build Checkout Session
        const origin = request.headers.get("origin") ||
            process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const successUrl =
            `${origin}/dashboard?session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${origin}/studio/public/${studioId}`;

        const sessionData: any = {
            mode: "payment",
            line_items: [
                {
                    price_data: {
                        currency: product.currency || "eur",
                        product_data: {
                            name:
                                `${product.name} · ${product.credit_count} credits`,
                            description: product.description || undefined,
                        },
                        unit_amount: product.price_cents,
                    },
                    quantity: 1,
                },
            ],
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: {
                class_pass_product_id: product.id,
                studio_id: studioId,
                credit_count: String(product.credit_count),
                expiration_months: product.expiration_months
                    ? String(product.expiration_months)
                    : "",
            },
            payment_intent_data: {
                application_fee_amount: platformFeeAmount,
                metadata: {
                    class_pass_product_id: product.id,
                    studio_id: studioId,
                    platform_fee: String(platformFeePercent),
                },
                transfer_data: {
                    destination: studioStripeAccount.stripe_account_id,
                },
            },
        };

        if (user.email) sessionData.customer_email = user.email;

        // Create session on platform (application_fee requires platform)
        const session = await stripe.checkout.sessions.create(sessionData);

        // Record transaction (for parity with program payments)
        await supabase
            .from("stripe_transactions")
            .insert({
                user_id: user.id,
                studio_id: studioId,
                program_id: null,
                stripe_checkout_session_id: session.id,
                stripe_account_id: studioStripeAccount.stripe_account_id,
                amount: totalAmount,
                platform_fee: platformFeeAmount,
                net_amount: totalAmount - platformFeeAmount,
                currency: product.currency || "eur",
                status: "pending",
                description: `Class Pass: ${product.name}`,
                metadata: {
                    class_pass_product_id: product.id,
                    credit_count: product.credit_count,
                },
            });

        return NextResponse.json({
            success: true,
            session_id: session.id,
            url: session.url,
        });
    } catch (err: any) {
        console.error("[class-pass/create-checkout] error:", err);
        return NextResponse.json({
            error: err.message || "Failed to create checkout",
        }, { status: 500 });
    }
}

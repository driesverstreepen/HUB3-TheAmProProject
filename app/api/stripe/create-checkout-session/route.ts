import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-10-29.clover",
});

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const PRICE_IDS: Record<string, Record<string, string>> = {
    basic: {
        monthly: process.env.STRIPE_PRICE_BASIC_MONTHLY!,
        yearly: process.env.STRIPE_PRICE_BASIC_YEARLY!,
    },
    plus: {
        monthly: process.env.STRIPE_PRICE_PLUS_MONTHLY!,
        yearly: process.env.STRIPE_PRICE_PLUS_YEARLY!,
    },
    pro: {
        monthly: process.env.STRIPE_PRICE_PRO_MONTHLY!,
        yearly: process.env.STRIPE_PRICE_PRO_YEARLY!,
    },
};

export async function POST(req: Request) {
    try {
        const { tier, period, studioId, userId } = await req.json();

        if (!tier || !period || !studioId || !userId) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 },
            );
        }

        // Get price ID
        const priceId = PRICE_IDS[tier]?.[period];
        if (!priceId) {
            return NextResponse.json(
                { error: "Invalid tier or period" },
                { status: 400 },
            );
        }

        // Check if priceId is a placeholder
        if (priceId.startsWith("price_xxx")) {
            return NextResponse.json(
                {
                    error:
                        "Stripe Price IDs not configured. Please add real Price IDs to .env file",
                },
                { status: 500 },
            );
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

        // Get studio and user details
        const { data: studio } = await supabase
            .from("studios")
            .select("naam, contact_email")
            .eq("id", studioId)
            .single();

        const { data: user } = await supabase
            .from("user_profiles")
            .select("email, first_name, last_name")
            .eq("user_id", userId)
            .single();

        const customerEmail = studio?.contact_email || user?.email;

        // Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card", "ideal"],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: "subscription",
            success_url:
                `${process.env.NEXT_PUBLIC_APP_URL}/studio/${studioId}?payment=success`,
            cancel_url:
                `${process.env.NEXT_PUBLIC_APP_URL}/studio/${studioId}?payment=cancelled`,
            customer_email: customerEmail,
            metadata: {
                studioId,
                userId,
                tier,
                period,
            },
            subscription_data: {
                metadata: {
                    studioId,
                    userId,
                    tier,
                    period,
                },
            },
        });

        return NextResponse.json({ sessionId: session.id, url: session.url });
    } catch (error: any) {
        console.error("Error creating checkout session:", error);
        return NextResponse.json(
            { error: error.message || "Failed to create checkout session" },
            { status: 500 },
        );
    }
}

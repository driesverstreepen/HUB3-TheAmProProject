import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkStudioAccess } from "@/lib/supabaseHelpers";

// Generate a simple UUID for state
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const cookieHeader = request.headers.get("cookie");
    const authBearer = request.headers.get("authorization");
    if (!cookieHeader && !authBearer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const supabaseUser = createClient(
      supabaseUrl,
      supabaseKey,
      cookieHeader
        ? {
          global: { headers: { cookie: cookieHeader } },
        }
        : undefined,
    );

    const supabaseAdmin = createClient(supabaseUrl, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authBearer ? authBearer.split(" ")[1] : undefined;
    const { data: { user } } = await supabaseUser.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { studio_id } = body;
    if (!studio_id) {
      return NextResponse.json({ error: "Missing studio_id" }, { status: 400 });
    }

    // Verify user is studio admin (owner/admin) using server-side (service role) lookup
    const access = await checkStudioAccess(
      supabaseAdmin as any,
      studio_id,
      user.id,
    );
    if (!access.hasAccess || !["owner", "admin"].includes(access.role || "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Generate state
    const state = (crypto as any).randomUUID
      ? (crypto as any).randomUUID()
      : crypto.randomBytes(16).toString("hex");

    // Save state to studio metadata (expires in 10 minutes)
    const { data: studioRow, error: fetchErr } = await supabaseAdmin
      .from("studios")
      .select("id, stripe_account_data")
      .eq("id", studio_id)
      .maybeSingle();

    if (fetchErr) {
      console.error("Failed fetching studio for oauth start:", fetchErr);
      return NextResponse.json({ error: "Failed to fetch studio" }, {
        status: 500,
      });
    }

    const updatedMeta = {
      ...(studioRow?.stripe_account_data || {}),
      oauth_state: state,
      oauth_state_expires_at: new Date(Date.now() + 10 * 60 * 1000)
        .toISOString(),
    };

    const { error: updateErr } = await supabaseAdmin
      .from("studios")
      .update({ stripe_account_data: updatedMeta })
      .eq("id", studio_id);

    if (updateErr) {
      console.error("Failed saving oauth state on studio:", updateErr);
      return NextResponse.json({ error: "Failed to save state" }, {
        status: 500,
      });
    }

    // Use a dedicated base URL for Stripe OAuth redirect URIs.
    // Stripe may require HTTPS, while local dev often runs on http://localhost.
    // Example: STRIPE_CONNECT_REDIRECT_BASE_URL=https://abcd1234.ngrok-free.app
    const baseUrlRaw = process.env.STRIPE_CONNECT_REDIRECT_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      request.headers.get("origin") ||
      "http://localhost:3000";
    const baseUrl = baseUrlRaw.replace(/\/$/, "");

    // Stripe Connect OAuth client_id (starts with "ca_")
    // Support a few common env var names to avoid deployment/config drift.
    const clientId = process.env.STRIPE_CONNECT_CLIENT_ID ||
      process.env.NEXT_PUBLIC_STRIPE_CONNECT_CLIENT_ID ||
      process.env.STRIPE_CLIENT_ID ||
      process.env.NEXT_PUBLIC_STRIPE_CLIENT_ID;

    if (!clientId) {
      console.error("Missing Stripe Connect client id. Configure one of:", {
        STRIPE_CONNECT_CLIENT_ID: !!process.env.STRIPE_CONNECT_CLIENT_ID,
        NEXT_PUBLIC_STRIPE_CONNECT_CLIENT_ID: !!process.env
          .NEXT_PUBLIC_STRIPE_CONNECT_CLIENT_ID,
        STRIPE_CLIENT_ID: !!process.env.STRIPE_CLIENT_ID,
        NEXT_PUBLIC_STRIPE_CLIENT_ID: !!process.env
          .NEXT_PUBLIC_STRIPE_CLIENT_ID,
      });
      return NextResponse.json(
        {
          error:
            "Stripe client id not configured. Set STRIPE_CONNECT_CLIENT_ID (recommended) or NEXT_PUBLIC_STRIPE_CLIENT_ID.",
        },
        { status: 500 },
      );
    }

    const redirectUri = `${baseUrl}/api/studio/stripe/oauth/callback`;
    const authorizeUrl =
      `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${
        encodeURIComponent(clientId)
      }&scope=read_write&redirect_uri=${
        encodeURIComponent(redirectUri)
      }&state=${encodeURIComponent(state)}`;

    return NextResponse.json({ success: true, url: authorizeUrl, state });
  } catch (error: any) {
    console.error("Error starting oauth:", error);
    return NextResponse.json({
      error: error.message || "Failed to start oauth",
    }, { status: 500 });
  }
}

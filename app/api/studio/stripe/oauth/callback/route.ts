import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code || !state) {
      return NextResponse.json({ error: "Missing code or state" }, {
        status: 400,
      });
    }

    // Find studio by stored oauth_state (use service role)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL || "";
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

    if (!supabaseUrl || !serviceRole) {
      console.error("OAuth callback misconfigured: missing Supabase env vars", {
        hasUrl: !!supabaseUrl,
        hasServiceRole: !!serviceRole,
      });
      return NextResponse.json(
        {
          error:
            "Server not configured for OAuth callback. Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE URL).",
        },
        { status: 500 },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Query studio where stripe_account_data.oauth_state == state
    // Use PostgREST filter on JSON field
    const { data: studiosFound, error: studioErr } = await supabase
      .from("studios")
      .select("id, stripe_account_data")
      .filter("stripe_account_data->>oauth_state", "eq", state)
      .maybeSingle();

    if (studioErr || !studiosFound) {
      console.error("OAuth callback: state not found or DB error", {
        studioErr,
      });
      return NextResponse.json(
        {
          error:
            "Invalid or expired state. If you clicked the connect button multiple times, use the latest attempt and try again.",
        },
        { status: 400 },
      );
    }

    const expiresAt = (studiosFound as any)?.stripe_account_data
      ?.oauth_state_expires_at;
    if (expiresAt) {
      const expiresAtMs = Date.parse(String(expiresAt));
      if (Number.isFinite(expiresAtMs) && expiresAtMs < Date.now()) {
        return NextResponse.json({ error: "Invalid or expired state" }, {
          status: 400,
        });
      }
    }

    const studioId = studiosFound.id;

    // Exchange code for token with Stripe
    const tokenResp = await fetch("https://connect.stripe.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_secret: process.env.STRIPE_SECRET_KEY || "",
        code,
        grant_type: "authorization_code",
      }),
    });

    const tokenBody = await tokenResp.json();
    if (tokenBody.error) {
      console.error("Stripe oauth token error:", tokenBody);
      return NextResponse.json({
        error: tokenBody.error_description || tokenBody.error,
      }, { status: 400 });
    }

    // Save stripe_user_id and response into studios using service role
    const updatedMeta: any = {
      ...((studiosFound as any).stripe_account_data || {}),
      oauth_connected_at: new Date().toISOString(),
      oauth_info: tokenBody,
    };

    // Clear one-time state to prevent reuse
    delete updatedMeta.oauth_state;
    delete updatedMeta.oauth_state_expires_at;

    const { error: updateErr } = await supabase
      .from("studios")
      .update({
        stripe_account_id: tokenBody.stripe_user_id,
        stripe_account_data: updatedMeta,
        stripe_onboarded_at: new Date().toISOString(),
      })
      .eq("id", studioId);

    if (updateErr) {
      console.error("Failed updating studio with oauth result:", updateErr);
      return NextResponse.json({ error: "Failed to save connected account" }, {
        status: 500,
      });
    }

    // Redirect to studio settings page
    const appUrlRaw = process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";
    const appUrl = appUrlRaw.replace(/\/$/, "");
    const redirectTo = `${appUrl}/studio/${studioId}/settings`;
    return NextResponse.redirect(redirectTo);
  } catch (error: any) {
    console.error("Error in oauth callback:", error);
    return NextResponse.json({
      error: error.message || "OAuth callback failed",
    }, { status: 500 });
  }
}

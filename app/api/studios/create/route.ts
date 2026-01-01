import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.warn("Missing Supabase env for server-side endpoint");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { access_token, user_id, studio, firstName, lastName, subscription } =
      body;

    if (!studio || !studio.name) {
      return NextResponse.json({ error: "missing_studio" }, { status: 400 });
    }

    const supabase = createClient(
      SUPABASE_URL || "",
      SUPABASE_SERVICE_ROLE || "",
    );

    let userId: string | undefined;

    // Support two flows:
    // 1. access_token provided (immediate session after signup)
    // 2. user_id provided directly (pendingStudio flow after login)
    if (access_token) {
      // Validate token by calling the Auth REST endpoint
      console.log("[/api/studios/create] Validating token...");
      console.log(
        "[/api/studios/create] Token prefix:",
        access_token.substring(0, 20),
      );
      console.log("[/api/studios/create] SUPABASE_URL:", SUPABASE_URL);
      console.log(
        "[/api/studios/create] Service role key present:",
        !!SUPABASE_SERVICE_ROLE,
      );

      const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${access_token}`,
          apikey: SUPABASE_SERVICE_ROLE || "",
        },
      });

      console.log(
        "[/api/studios/create] Auth response status:",
        userResp.status,
      );

      if (!userResp.ok) {
        const text = await userResp.text().catch(() => "");
        console.error("[/api/studios/create] Auth validation failed:", text);
        return NextResponse.json({
          error: "invalid_token",
          details: text || "failed to validate token",
          status: userResp.status,
        }, { status: 401 });
      }

      const userData = await userResp.json();
      userId = userData?.id;
      if (!userId) {
        return NextResponse.json({
          error: "invalid_token",
          details: "no user id",
        }, { status: 401 });
      }
    } else if (user_id) {
      // Direct user_id provided (pendingStudio flow)
      userId = user_id;
      console.log("[/api/studios/create] Using provided user_id:", userId);
    } else {
      return NextResponse.json({
        error: "missing_auth",
        details: "Provide either access_token or user_id",
      }, { status: 400 });
    }

    console.log("[/api/studios/create] Inserting studio for user:", userId);

    // Prepare studio data with subscription info
    const studioInsertData: any = {
      naam: studio.name,
      location: studio.location,
      contact_email: studio.email,
      phone_number: studio.phoneNumber,
      eigenaar_id: userId,
    };

    const getDefaultStudioFeaturesForTier = (tier: string) => {
      // Features stored in `studios.features` are optional modules; defaults should match the chosen plan.
      // Basic: minimal
      // Plus: forms + finance
      // Pro (and trial): everything on
      const normalized = String(tier || "basic");
      if (normalized === "pro") {
        return {
          features: {
            forms: true,
            notes: true,
            emails: true,
            finances: true,
            evaluations: true,
          },
          attendance_enabled: true,
        };
      }
      if (normalized === "plus") {
        return {
          features: {
            forms: true,
            notes: false,
            emails: false,
            finances: true,
            evaluations: false,
          },
          attendance_enabled: false,
        };
      }
      return {
        features: {
          forms: false,
          notes: false,
          emails: false,
          finances: false,
          evaluations: false,
        },
        attendance_enabled: false,
      };
    };

    // Handle subscription data
    if (subscription) {
      if (subscription.startTrial) {
        // Start with 14-day Pro trial
        studioInsertData.subscription_tier = "pro";
        studioInsertData.subscription_status = "trial";
        studioInsertData.trial_end_date = new Date(
          Date.now() + 14 * 24 * 60 * 60 * 1000,
        ).toISOString();
        console.log("[/api/studios/create] Starting 14-day Pro trial");
      } else if (subscription.tier) {
        // Set selected tier immediately (would typically happen after payment)
        studioInsertData.subscription_tier = subscription.tier;
        studioInsertData.subscription_status = "active";
        studioInsertData.subscription_period = subscription.period || "monthly";
        studioInsertData.subscription_start_date = new Date().toISOString();
        console.log(
          "[/api/studios/create] Setting tier:",
          subscription.tier,
          subscription.period,
        );
      }
    } else {
      // Default: 14-day Pro trial if no subscription specified
      studioInsertData.subscription_tier = "pro";
      studioInsertData.subscription_status = "trial";
      studioInsertData.trial_end_date = new Date(
        Date.now() + 14 * 24 * 60 * 60 * 1000,
      ).toISOString();
      console.log(
        "[/api/studios/create] No subscription specified, defaulting to 14-day Pro trial",
      );
    }

    // Default module toggles to match the effective tier
    const effectiveTier = String(studioInsertData.subscription_tier || "basic");
    const defaults = getDefaultStudioFeaturesForTier(effectiveTier);
    studioInsertData.features = defaults.features;
    studioInsertData.attendance_enabled = defaults.attendance_enabled;

    console.log(
      "[/api/studios/create] Studio data:",
      JSON.stringify(studioInsertData),
    );

    // Insert studio with service role client
    const { data: studioData, error: studioError } = await supabase
      .from("studios")
      .insert(studioInsertData)
      .select()
      .single();

    if (studioError) {
      console.error(
        "[/api/studios/create] Studio insert error FULL:",
        JSON.stringify(studioError, null, 2),
      );
      console.error("[/api/studios/create] Error code:", studioError.code);
      console.error(
        "[/api/studios/create] Error message:",
        studioError.message,
      );
      console.error(
        "[/api/studios/create] Error details:",
        studioError.details,
      );
      console.error("[/api/studios/create] Error hint:", studioError.hint);
      return NextResponse.json(
        {
          error: "studio_insert_failed",
          message: studioError.message,
          code: studioError.code,
          details: studioError.details,
          hint: studioError.hint,
        },
        { status: 500 },
      );
    }

    console.log("[/api/studios/create] Studio created:", studioData.id);

    // Upsert user_roles entry with studio_admin role
    const { error: roleErr } = await supabase.from("user_roles").upsert({
      user_id: userId,
      role: "studio_admin",
      studio_id: studioData.id,
    });

    if (roleErr) {
      console.error("[/api/studios/create] Role upsert error:", roleErr);
      return NextResponse.json({
        error: "role_upsert_failed",
        details: roleErr.message,
      }, { status: 500 });
    }

    // Add studio owner to studio_members table
    const { error: memberErr } = await supabase.from("studio_members").insert({
      studio_id: studioData.id,
      user_id: userId,
      role: "owner",
    });

    if (memberErr) {
      console.error(
        "[/api/studios/create] studio_members insert error:",
        memberErr,
      );
      // Don't fail the whole request, but log the error
      console.warn(
        "[/api/studios/create] Warning: failed to create studio_members entry",
      );
    }

    // Create studio_admin_profiles entry with ONLY studio-specific data
    // Personal data (first_name, last_name) lives in user_profiles, not here
    const { error: profileErr } = await supabase.from("studio_admin_profiles")
      .upsert({
        user_id: userId,
        studio_id: studioData.id,
        organization_name: studio.name || null,
      });

    if (profileErr) {
      console.error(
        "[/api/studios/create] studio_admin_profiles upsert error:",
        profileErr,
      );
      // Don't fail the whole request, but log warning
      console.warn(
        "[/api/studios/create] Warning: failed to create studio_admin_profiles entry",
      );
    }

    // Ensure user_profiles entry exists with personal data
    // (WelcomePage should have already created this, but double-check)
    const { error: userProfileErr } = await supabase.from("user_profiles")
      .upsert({
        user_id: userId,
        first_name: firstName || null,
        last_name: lastName || null,
        email: studio.email || null,
        phone: studio.phoneNumber || null,
        profile_completed: true,
      }, { onConflict: "user_id" });

    if (userProfileErr) {
      console.warn(
        "[/api/studios/create] Warning: failed to ensure user_profiles entry:",
        userProfileErr,
      );
    }

    console.log("[/api/studios/create] Success!");
    return NextResponse.json({ studio: studioData });
  } catch (err: any) {
    console.error("Server studio create error", err);
    return NextResponse.json({
      error: "server_error",
      details: err?.message || String(err),
    }, { status: 500 });
  }
}

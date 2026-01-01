import { NextResponse } from "next/server";
import {
  createSupabaseClient,
  supabaseAnonKey,
  supabaseUrl,
} from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import { isProfileComplete, missingProfileFields } from "@/lib/profileHelpers";
import { notifyStudioAdminsOnEnrollment } from "@/lib/studioEnrollmentNotifications";

export async function POST(request: Request) {
  try {
    // Expect the client to forward the user's access token in Authorization: Bearer <token>
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized: missing access token" },
        { status: 401 },
      );
    }

    // Create a Supabase client that includes the user's bearer token in requests
    // so RLS behaves as if the user is executing the queries.
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const body = await request.json();
    const { program_id, form_data } = body;

    if (!program_id) {
      return NextResponse.json({ error: "program_id is required" }, {
        status: 400,
      });
    }

    // Get authenticated user
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Unable to get authenticated user" }, {
        status: 401,
      });
    }
    const user = userData.user;

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const serviceClient = serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey)
      : null;

    // Optionally: check program and linked form, but for now just store provided form_data

    // Insert inschrijving with snapshot and form_data. RLS requires auth.uid() = user_id for INSERT,
    // which is satisfied because we set the auth token above.
    // Load user's profile from users table to snapshot into the inschrijving
    const { data: profile, error: profileErr } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileErr) {
      console.error("Error loading profile for snapshot:", profileErr);
    }

    // Build a privacy-focused snapshot with only the fields we need
    const snapshot = {
      first_name: profile?.user_metadata?.first_name ||
        profile?.user_metadata?.voornaam || profile?.first_name ||
        profile?.naam || null,
      last_name: profile?.user_metadata?.last_name ||
        profile?.user_metadata?.achternaam || profile?.last_name || null,
      street: profile?.user_metadata?.street || profile?.user_metadata?.adres ||
        profile?.street || profile?.adres || null,
      house_number: profile?.user_metadata?.house_number ||
        profile?.user_metadata?.huisnummer || null,
      house_number_addition: profile?.user_metadata?.house_number_addition ||
        profile?.user_metadata?.huisnummer_toevoeging || null,
      postal_code: profile?.user_metadata?.postal_code ||
        profile?.user_metadata?.postcode || null,
      city: profile?.user_metadata?.city || profile?.user_metadata?.stad ||
        profile?.city || null,
      phone_number: profile?.user_metadata?.phone_number ||
        profile?.user_metadata?.telefoon || profile?.phone_number || null,
      email: profile?.email || profile?.user_metadata?.email || null,
      date_of_birth: profile?.user_metadata?.date_of_birth ||
        profile?.user_metadata?.geboortedatum || null,
    };

    // Enforce profile completeness server-side: if required fields missing, reject
    const missing = missingProfileFields(snapshot);
    if (missing.length > 0) {
      return NextResponse.json({ error: "Profile incomplete", missing }, {
        status: 400,
      });
    }

    // Capacity/waitlist enforcement
    if (serviceClient) {
      const { data: program, error: programErr } = await serviceClient
        .from("programs")
        .select("id, studio_id, title, capacity, waitlist_enabled, manual_full_override")
        .eq("id", program_id)
        .maybeSingle();

      if (programErr) {
        return NextResponse.json({
          error: programErr.message || "Failed to validate capacity",
        }, { status: 500 });
      }

      if (program) {
        const cap = typeof (program as any).capacity === "number"
          ? (program as any).capacity
          : null;
        const waitlistEnabled = !!(program as any).waitlist_enabled && !!cap &&
          cap > 0;

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
          const isFull = !!(program as any).manual_full_override ||
            enrolled >= cap;

          if (isFull) {
            if (!waitlistEnabled) {
              return NextResponse.json({ error: "Program is full" }, {
                status: 409,
              });
            }

            // Allow enrollment only if user was accepted from waitlist; upgrade status to actief
            const { data: existingAccepted } = await serviceClient
              .from("inschrijvingen")
              .select("id")
              .eq("program_id", program_id)
              .eq("user_id", user.id)
              .eq("status", "waitlist_accepted")
              .maybeSingle();

            if (!existingAccepted?.id) {
              return NextResponse.json({ error: "Waitlist required" }, {
                status: 409,
              });
            }

            const { data: upgraded, error: upgradeErr } = await supabase
              .from("inschrijvingen")
              .update({
                status: "actief",
                form_data: form_data || {},
                profile_snapshot: snapshot,
                updated_at: new Date().toISOString(),
              })
              .eq("program_id", program_id)
              .eq("user_id", user.id)
              .eq("status", "waitlist_accepted")
              .select()
              .single();

            if (upgradeErr) {
              console.error("Error upgrading waitlist enrollment:", upgradeErr);
              return NextResponse.json({ error: upgradeErr.message }, {
                status: 500,
              });
            }

            // Best-effort notify studio admins/owner
            try {
              const studioId = (program as any)?.studio_id ? String((program as any).studio_id) : "";
              if (studioId) {
                await notifyStudioAdminsOnEnrollment({
                  studioId,
                  programId: String(program_id),
                  enrollmentId: upgraded?.id,
                  enrolledUserId: String(user.id),
                  profileSnapshot: upgraded?.profile_snapshot ?? snapshot,
                  programTitle: (program as any)?.title ?? null,
                });
              }
            } catch {
              // ignore
            }

            return NextResponse.json({ inschrijving: upgraded }, {
              status: 201,
            });
          }

          // Not full: if user already has waitlist_accepted, upgrade it instead of inserting
          const { data: existingAccepted } = await serviceClient
            .from("inschrijvingen")
            .select("id")
            .eq("program_id", program_id)
            .eq("user_id", user.id)
            .eq("status", "waitlist_accepted")
            .maybeSingle();

          if (existingAccepted?.id) {
            const { data: upgraded, error: upgradeErr } = await supabase
              .from("inschrijvingen")
              .update({
                status: "actief",
                form_data: form_data || {},
                profile_snapshot: snapshot,
                updated_at: new Date().toISOString(),
              })
              .eq("program_id", program_id)
              .eq("user_id", user.id)
              .eq("status", "waitlist_accepted")
              .select()
              .single();

            if (upgradeErr) {
              console.error("Error upgrading waitlist enrollment:", upgradeErr);
              return NextResponse.json({ error: upgradeErr.message }, {
                status: 500,
              });
            }

            // Best-effort notify studio admins/owner
            try {
              const studioId = (program as any)?.studio_id ? String((program as any).studio_id) : "";
              if (studioId) {
                await notifyStudioAdminsOnEnrollment({
                  studioId,
                  programId: String(program_id),
                  enrollmentId: upgraded?.id,
                  enrolledUserId: String(user.id),
                  profileSnapshot: upgraded?.profile_snapshot ?? snapshot,
                  programTitle: (program as any)?.title ?? null,
                });
              }
            } catch {
              // ignore
            }

            return NextResponse.json({ inschrijving: upgraded }, {
              status: 201,
            });
          }
        }
      }
    }

    const payload: any = {
      user_id: user.id,
      program_id,
      status: "actief",
      form_data: form_data || {},
      profile_snapshot: snapshot,
    };

    const { data, error } = await supabase.from("inschrijvingen").insert(
      payload,
    ).select().single();

    if (error) {
      // Unique constraint on (user_id, program_id) might cause conflict
      console.error("Error creating inschrijving:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Best-effort notify studio admins/owner
    try {
      if (serviceClient) {
        const { data: program } = await serviceClient
          .from("programs")
          .select("id, studio_id, title")
          .eq("id", program_id)
          .maybeSingle();

        const studioId = (program as any)?.studio_id ? String((program as any).studio_id) : "";
        if (studioId) {
          await notifyStudioAdminsOnEnrollment({
            studioId,
            programId: String(program_id),
            enrollmentId: data?.id,
            enrolledUserId: String(user.id),
            profileSnapshot: data?.profile_snapshot ?? snapshot,
            programTitle: (program as any)?.title ?? null,
          });
        }
      }
    } catch {
      // ignore
    }

    return NextResponse.json({ inschrijving: data }, { status: 201 });
  } catch (err: any) {
    console.error("Enroll route error:", err);
    return NextResponse.json({ error: err.message || "Server error" }, {
      status: 500,
    });
  }
}

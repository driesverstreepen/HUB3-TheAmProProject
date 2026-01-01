import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase";
import { missingProfileFields } from "@/lib/profileHelpers";

// Server-side endpoint that performs an atomic checkout operation using a
// Postgres function. This endpoint validates the user via an access token.

export async function POST(req: Request) {
  try {
    // 1. Parse request body and Authorization header
    const body = await req.json();
    const { cartId } = body || {};

    const authHeader = req.headers.get("authorization");
    const token = authHeader?.split(" ")[1];

    if (!token) {
      return NextResponse.json({ error: "Missing authentication token" }, {
        status: 401,
      });
    }
    if (!cartId) {
      return NextResponse.json({ error: "Missing cartId" }, { status: 400 });
    }

    // 2. Validate token and get user
    // We create a temporary client here to validate the user token.
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      token,
    );

    if (userError || !user) {
      return NextResponse.json({ error: "Invalid or expired token" }, {
        status: 401,
      });
    }
    const userId = user.id;

    // 3. Use Service Role Client for elevated privileges
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return NextResponse.json({ error: "Server misconfiguration" }, {
        status: 500,
      });
    }
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // 4. Verify cart ownership and status
    const { data: cartData, error: cartErr } = await serviceClient
      .from("carts")
      .select("id, user_id, status")
      .eq("id", cartId)
      .maybeSingle();

    if (cartErr || !cartData) {
      return NextResponse.json({ error: "Cart not found" }, { status: 404 });
    }
    if (cartData.user_id !== userId) {
      return NextResponse.json({
        error: "Forbidden: Cart does not belong to user",
      }, { status: 403 });
    }
    if (cartData.status !== "active") {
      return NextResponse.json({ error: "Cart is not active" }, {
        status: 400,
      });
    }

    // 5. Fetch cart items to build the enrollments payload
    const itemsRes = await serviceClient
      .from("cart_items")
      .select(
        "program_id, price_snapshot, lesson_detail_type, lesson_detail_id, lesson_metadata, sub_profile_id",
      )
      .eq("cart_id", cartId);

    const cartItems: any[] = (itemsRes as any).data || [];
    // itemsToProcess holds the subset of cart items we will actually insert as
    // enrollments (used if some programs are already enrolled). We avoid
    // reassigning the original `cartItems` variable to prevent const-reassignment
    // errors during build.
    let itemsToProcess: any[] = cartItems;
    const itemsError = (itemsRes as any).error;

    if (itemsError) {
      return NextResponse.json({ error: "Failed to fetch cart items" }, {
        status: 500,
      });
    }

    console.info("Cart items:", cartItems);

    // Validate cart items
    if (!cartItems || cartItems.length === 0) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }

    for (const item of cartItems) {
      if (!item.program_id) {
        return NextResponse.json({
          error: "Invalid cart item: missing program_id",
        }, { status: 400 });
      }
      // Validate UUID format
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(item.program_id)) {
        return NextResponse.json({
          error: `Invalid program_id format: ${item.program_id}`,
        }, { status: 400 });
      }
    }

    // Verify programs exist
    const programIds: string[] = cartItems.map((item: any) => item.program_id);
    const { data: programs, error: programsError } = await serviceClient
      .from("programs")
      .select("id, title")
      .in("id", programIds);

    if (programsError) {
      console.error("Error fetching programs:", programsError);
      return NextResponse.json({ error: "Failed to verify programs" }, {
        status: 500,
      });
    }

    if (!programs || programs.length !== cartItems.length) {
      return NextResponse.json(
        { error: "Some programs in cart do not exist" },
        { status: 400 },
      );
    }

    console.info("Programs found:", programs);

    // Check for existing enrollments per (program_id, sub_profile_id) pair.
    // Multiple people (main account + each sub-profile) can enroll in the same program,
    // but each specific profile can only enroll once per program.
    // Fetch all existing enrollments for this user and the relevant programs.
    const { data: existingEnrollments, error: enrollmentsError } =
      await serviceClient
        .from("inschrijvingen")
        .select("program_id, sub_profile_id")
        .eq("user_id", userId)
        .eq("status", "actief")
        .in("program_id", programIds);

    if (enrollmentsError) {
      console.error("Error checking existing enrollments:", enrollmentsError);
      return NextResponse.json({
        error: "Failed to check existing enrollments",
      }, { status: 500 });
    }

    // Build a set of "program_id:sub_profile_id" keys for existing enrollments
    // (null sub_profile_id represents main account enrollment)
    const existingKeys = new Set(
      (existingEnrollments || []).map((e: any) =>
        `${e.program_id}:${e.sub_profile_id || "main"}`
      ),
    );

    console.info("Existing enrollment keys:", Array.from(existingKeys));
    console.info(
      "Cart items to check:",
      cartItems.map((it: any) => ({
        program_id: it.program_id,
        sub_profile_id: it.sub_profile_id || "main",
      })),
    );

    // Filter out cart items that already have an enrollment for that exact (program, profile) pair
    const skippedItems: any[] = [];
    itemsToProcess = cartItems.filter((item: any) => {
      const key = `${item.program_id}:${item.sub_profile_id || "main"}`;
      const isDuplicate = existingKeys.has(key);
      console.info(
        `Checking cart item: program=${item.program_id}, sub_profile=${
          item.sub_profile_id || "main"
        }, key=${key}, isDuplicate=${isDuplicate}`,
      );
      if (isDuplicate) {
        skippedItems.push(item);
        return false;
      }
      return true;
    });

    if (skippedItems.length > 0) {
      console.info(
        `Skipping ${skippedItems.length} already-enrolled cart items (per profile):`,
        skippedItems.map((it: any) => ({
          program_id: it.program_id,
          sub_profile_id: it.sub_profile_id || "main",
        })),
      );
    }

    if (itemsToProcess.length === 0) {
      // All items were already enrolled
      const skippedProgramIds = Array.from(
        new Set(skippedItems.map((it: any) => it.program_id)),
      );
      return NextResponse.json({
        error: `Already enrolled in program(s): ${
          skippedProgramIds.join(", ")
        }`,
      }, { status: 400 });
    }

    // Resolve privacy-focused snapshot once for this user (default when no sub_profile_id)
    let snapshot: any = {};
    try {
      const { data: up } = await serviceClient
        .from("user_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (up) {
        snapshot = {
          first_name: up.first_name || up.voornaam || null,
          last_name: up.last_name || up.achternaam || null,
          street: up.street || up.adres || null,
          house_number: up.house_number || up.huisnummer || null,
          house_number_addition: up.house_number_addition ||
            up.huisnummer_toevoeging || null,
          postal_code: up.postal_code || up.postcode || null,
          city: up.city || up.stad || null,
          phone_number: up.phone_number || up.telefoon || null,
          email: up.email || null,
          date_of_birth: up.date_of_birth || up.geboortedatum || null,
        };
      } else {
        const { data: usr } = await serviceClient
          .from("users")
          .select("*")
          .eq("id", userId)
          .maybeSingle();

        snapshot = {
          first_name: usr?.user_metadata?.first_name ||
            usr?.user_metadata?.voornaam || usr?.first_name || usr?.naam ||
            null,
          last_name: usr?.user_metadata?.last_name ||
            usr?.user_metadata?.achternaam || usr?.last_name || null,
          street: usr?.user_metadata?.street || usr?.user_metadata?.adres ||
            usr?.street || usr?.adres || null,
          house_number: usr?.user_metadata?.house_number ||
            usr?.user_metadata?.huisnummer || null,
          house_number_addition: usr?.user_metadata?.house_number_addition ||
            usr?.user_metadata?.huisnummer_toevoeging || null,
          postal_code: usr?.user_metadata?.postal_code ||
            usr?.user_metadata?.postcode || null,
          city: usr?.user_metadata?.city || usr?.user_metadata?.stad ||
            usr?.city || null,
          phone_number: usr?.user_metadata?.phone_number ||
            usr?.user_metadata?.telefoon || usr?.phone_number || null,
          email: usr?.email || usr?.user_metadata?.email || null,
          date_of_birth: usr?.user_metadata?.date_of_birth ||
            usr?.user_metadata?.geboortedatum || null,
        };
      }
    } catch (err) {
      console.warn("Failed to resolve profile snapshot during checkout:", err);
    }

    // Block checkout if profile is incomplete
    const missing = missingProfileFields(snapshot);
    if (missing.length > 0) {
      return NextResponse.json({
        error:
          "Profile incomplete. Please complete your profile before checking out.",
        missing,
      }, { status: 400 });
    }

    // 6. Resolve any referenced sub_profiles (if present) and then insert enrollments directly
    // include lesson detail metadata if present. For items that reference a sub_profile_id
    // we build the profile_snapshot from the sub_profile row server-side to ensure immutability.
    const referencedSubProfileIds = Array.from(
      new Set(
        itemsToProcess.map((it: any) => it.sub_profile_id).filter(Boolean),
      ),
    );
    let subProfilesMap: Record<string, any> = {};
    if (referencedSubProfileIds.length > 0) {
      const { data: subProfilesData, error: subProfilesError } =
        await serviceClient
          .from("sub_profiles")
          .select("*")
          .in("id", referencedSubProfileIds as any[]);

      if (subProfilesError) {
        console.error(
          "Failed to fetch referenced sub_profiles:",
          subProfilesError,
        );
        return NextResponse.json({
          error: "Failed to resolve sub-profiles during checkout",
        }, { status: 500 });
      }

      // Map by id
      (subProfilesData || []).forEach((sp: any) => {
        subProfilesMap[sp.id] = sp;
      });

      // Validate ownership: every referenced sub_profile must belong to the current user
      for (const spId of referencedSubProfileIds) {
        const sp = subProfilesMap[spId];
        if (!sp) {
          return NextResponse.json({
            error: `Referenced sub_profile not found: ${spId}`,
          }, { status: 400 });
        }
        if (sp.parent_user_id !== userId) {
          return NextResponse.json({
            error: "Forbidden: sub_profile does not belong to user",
          }, { status: 403 });
        }
      }
    }

    // Capacity/waitlist enforcement
    const uniqueProgramIds = Array.from(
      new Set(
        itemsToProcess.map((it: any) => String(it.program_id)).filter(Boolean),
      ),
    );
    const { data: capPrograms, error: capErr } = await serviceClient
      .from("programs")
      .select("id, capacity, waitlist_enabled, manual_full_override")
      .in("id", uniqueProgramIds);

    if (capErr) {
      return NextResponse.json({ error: "Failed to validate capacity" }, {
        status: 500,
      });
    }

    const programById = new Map(
      (capPrograms || []).map((p: any) => [String(p.id), p]),
    );

    const { data: activeRows, error: activeErr } = await serviceClient
      .from("inschrijvingen")
      .select("program_id")
      .in("program_id", uniqueProgramIds)
      .eq("status", "actief");

    if (activeErr) {
      return NextResponse.json({ error: "Failed to validate capacity" }, {
        status: 500,
      });
    }

    const enrolledCounts: Record<string, number> = {};
    for (const row of (activeRows || []) as any[]) {
      const pid = String(row.program_id);
      enrolledCounts[pid] = (enrolledCounts[pid] || 0) + 1;
    }

    const { data: acceptedRows, error: acceptedErr } = await serviceClient
      .from("inschrijvingen")
      .select("program_id")
      .eq("user_id", userId)
      .in("program_id", uniqueProgramIds)
      .eq("status", "waitlist_accepted");

    if (acceptedErr) {
      return NextResponse.json({ error: "Failed to validate waitlist" }, {
        status: 500,
      });
    }

    const acceptedSet = new Set(
      (acceptedRows || []).map((r: any) => String(r.program_id)),
    );

    for (const pid of uniqueProgramIds) {
      const program = programById.get(pid);
      const cap = typeof (program as any)?.capacity === "number"
        ? (program as any).capacity
        : null;
      const isFull = !!(program as any)?.manual_full_override ||
        (!!cap && cap > 0 && (enrolledCounts[pid] || 0) >= cap);
      if (!isFull) continue;

      const waitlistEnabled = !!(program as any)?.waitlist_enabled && !!cap &&
        cap > 0;
      if (!waitlistEnabled) {
        return NextResponse.json(
          { error: "Program is full", program_id: pid },
          { status: 409 },
        );
      }
      if (!acceptedSet.has(pid)) {
        return NextResponse.json({
          error: "Waitlist required",
          program_id: pid,
        }, { status: 409 });
      }
    }

    // Upgrade waitlist_accepted rows for main account enrollments (avoid unique conflicts)
    let upgradedEnrollments: any[] = [];
    const remainingItems: any[] = [];
    for (const item of itemsToProcess) {
      const pid = String(item.program_id);
      const isMain = !item.sub_profile_id;
      if (isMain && acceptedSet.has(pid)) {
        const { data: upgraded, error: upErr } = await serviceClient
          .from("inschrijvingen")
          .update({
            status: "actief",
            form_data: {
              lesson_detail_type: item.lesson_detail_type || null,
              lesson_detail_id: item.lesson_detail_id || null,
              lesson_metadata: item.lesson_metadata || null,
              price_snapshot: item.price_snapshot || null,
            },
            profile_snapshot: snapshot || {},
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId)
          .eq("program_id", item.program_id)
          .eq("status", "waitlist_accepted")
          .select()
          .maybeSingle();

        if (!upErr && upgraded) {
          upgradedEnrollments.push(upgraded);
          continue;
        }
      }
      remainingItems.push(item);
    }

    // 6. Insert remaining enrollments directly (include lesson detail metadata if present)
    console.info("Inserting enrollments directly...");
    const { data: insertedEnrollments, error: insertError } =
      await serviceClient
        .from("inschrijvingen")
        .insert(
          remainingItems.map((item: any) => {
            // If item references a sub_profile_id, build snapshot from that sub_profile
            const sp = item.sub_profile_id
              ? subProfilesMap[item.sub_profile_id]
              : null;
            const itemSnapshot = sp
              ? {
                first_name: sp.first_name || null,
                last_name: sp.last_name || null,
                street: sp.street || null,
                house_number: sp.house_number || null,
                house_number_addition: sp.house_number_addition || null,
                postal_code: sp.postal_code || null,
                city: sp.city || null,
                phone_number: sp.phone_number || null,
                email: sp.email || null,
                date_of_birth: sp.date_of_birth || null,
              }
              : (snapshot || {});

            return {
              user_id: userId,
              // If the cart item referenced a sub_profile, also store the
              // sub_profile_id on the enrollment (if the DB has that column).
              sub_profile_id: item.sub_profile_id || null,
              program_id: item.program_id,
              status: "actief",
              form_data: {
                lesson_detail_type: item.lesson_detail_type || null,
                lesson_detail_id: item.lesson_detail_id || null,
                lesson_metadata: item.lesson_metadata || null,
                price_snapshot: item.price_snapshot || null,
              },
              profile_snapshot: itemSnapshot,
            };
          }),
        )
        .select();

    if (insertError) {
      console.error("Insert error:", insertError);
      return NextResponse.json({
        error: `Failed to insert enrollments: ${
          insertError.message || JSON.stringify(insertError)
        }`,
      }, { status: 500 });
    }

    console.info("Inserted enrollments:", insertedEnrollments);

    // 7. Update cart status
    const { error: updateError } = await serviceClient
      .from("carts")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", cartId);

    if (updateError) {
      console.error("Update cart error:", updateError);
      // Don't fail the request if cart update fails, but log it
    }

    // 8. Clear cart items so the user's cart appears empty after checkout
    try {
      const { error: deleteError } = await serviceClient
        .from("cart_items")
        .delete()
        .eq("cart_id", cartId);

      if (deleteError) {
        console.error(
          "Failed to delete cart items after checkout:",
          deleteError,
        );
        // Don't fail the request for this cleanup step
      }
    } catch (err) {
      console.warn("Unexpected error when clearing cart items:", err);
    }

    return NextResponse.json({
      message: "Checkout successful",
      inserted: [
        ...(upgradedEnrollments || []),
        ...(insertedEnrollments || []),
      ],
    });
  } catch (e) {
    console.error("Unexpected checkout error:", e);
    return NextResponse.json({ error: "An unexpected error occurred." }, {
      status: 500,
    });
  }
}

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { constructWebhookEvent, stripe } from "@/lib/stripe";
import { missingProfileFields } from "@/lib/profileHelpers";
import { notifyStudioAdminsOnEnrollment } from "@/lib/studioEnrollmentNotifications";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function POST(request: Request) {
  try {
    const signature = request.headers.get("stripe-signature") || "";
    const payload = await request.text();

    if (!signature) {
      console.warn("Missing Stripe signature header");
      return NextResponse.json({ received: true });
    }

    let event;
    try {
      event = constructWebhookEvent(payload, signature);
    } catch (err: any) {
      console.error(
        "Webhook signature verification failed:",
        err.message || err,
      );
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // Handle product and price lifecycle events: upsert into stripe_products / stripe_prices
    if (event.type && (event.type.startsWith('product.') || event.type.startsWith('price.'))) {
      try {
        const obj: any = event.data?.object;

        // product.* events
        if (event.type.startsWith('product.')) {
          const stripeProductId = obj?.id;
          const name = obj?.name || null;
          const description = obj?.description || null;
          const active = typeof obj?.active === 'boolean' ? obj.active : true;

          // Try to resolve studio via connected account id (event.account)
          const stripeAccountId = (event as any).account || obj?.livemode === false ? undefined : (event as any).account;
          let studioId: string | null = null;

          if (stripeAccountId) {
            const { data: sa } = await serviceClient
              .from('studio_stripe_accounts')
              .select('studio_id')
              .eq('stripe_account_id', stripeAccountId)
              .maybeSingle();
            studioId = sa?.studio_id || null;
          }

          // Fallback: if product already exists locally, reuse its studio_id
          if (!studioId) {
            const { data: existing } = await serviceClient
              .from('stripe_products')
              .select('studio_id, stripe_account_id, id')
              .eq('stripe_product_id', stripeProductId)
              .maybeSingle();
            if (existing) {
              studioId = existing.studio_id || null;
            }
          }

          if (!studioId) {
            console.warn('[Stripe Webhook] product event: could not determine studio for product', stripeProductId);
          } else {
            const { data: existing } = await serviceClient
              .from('stripe_products')
              .select('*')
              .eq('stripe_product_id', stripeProductId)
              .maybeSingle();

            if (existing) {
              await serviceClient.from('stripe_products').update({
                name,
                description,
                active,
                stripe_account_id: stripeAccountId || existing.stripe_account_id,
                updated_at: new Date().toISOString(),
              }).eq('id', existing.id);
              // If the product has a default price attached, try to update price fields
              try {
                const defaultPriceId = obj?.default_price && typeof obj.default_price === 'string'
                  ? obj.default_price
                  : null;
                if (defaultPriceId) {
                  const priceObj: any = await stripe.prices.retrieve(defaultPriceId, stripeAccountId ? { stripeAccount: stripeAccountId } : undefined);
                  await serviceClient.from('stripe_products').update({
                    stripe_price_id: priceObj.id || null,
                    price_amount: typeof priceObj.unit_amount === 'number' ? priceObj.unit_amount : null,
                    price_currency: priceObj.currency || 'eur',
                    price_interval: priceObj.recurring?.interval || null,
                    price_active: typeof priceObj.active === 'boolean' ? priceObj.active : true,
                    updated_at: new Date().toISOString(),
                  }).eq('id', existing.id);
                } else if (obj?.default_price_data) {
                  const pd: any = obj.default_price_data;
                  await serviceClient.from('stripe_products').update({
                    stripe_price_id: pd.id || null,
                    price_amount: typeof pd.unit_amount === 'number' ? pd.unit_amount : null,
                    price_currency: pd.currency || 'eur',
                    price_interval: pd.recurring?.interval || null,
                    price_active: typeof pd.active === 'boolean' ? pd.active : true,
                    updated_at: new Date().toISOString(),
                  }).eq('id', existing.id);
                }
              } catch (e) {
                console.warn('[Stripe Webhook] failed to fetch default price for product', stripeProductId, e);
              }
            } else {
              const insertPayload: any = {
                studio_id: studioId,
                stripe_product_id: stripeProductId,
                stripe_account_id: stripeAccountId || null,
                name,
                description,
                active,
              };

              // include default price data when present
              if (obj?.default_price_data) {
                const pd: any = obj.default_price_data;
                insertPayload.stripe_price_id = pd.id || null;
                insertPayload.price_amount = typeof pd.unit_amount === 'number' ? pd.unit_amount : null;
                insertPayload.price_currency = pd.currency || 'eur';
                insertPayload.price_interval = pd.recurring?.interval || null;
                insertPayload.price_active = typeof pd.active === 'boolean' ? pd.active : true;
              }

              const { error: insErr } = await serviceClient.from('stripe_products').insert(insertPayload);
              if (insErr) console.warn('[Stripe Webhook] insert product returned error', insErr);
            }
          }
        }

        // price.* events — update price fields on the product row (single-price model)
        if (event.type.startsWith('price.')) {
          const price = obj;
          const stripePriceId = price?.id;
          const stripeProductRef = typeof price?.product === 'string' ? price.product : price?.product?.id;
          const amount = typeof price?.unit_amount === 'number' ? price.unit_amount : (price?.unit_amount || null);
          const currency = price?.currency || 'eur';
          const interval = price?.recurring?.interval || null;
          const active = typeof price?.active === 'boolean' ? price.active : true;

          // Resolve local product row first
          const { data: prodRow } = await serviceClient
            .from('stripe_products')
            .select('*')
            .eq('stripe_product_id', stripeProductRef)
            .maybeSingle();

          if (!prodRow) {
            console.warn('[Stripe Webhook] price event: missing local product for', stripeProductRef);
          } else {
            // Update product with price fields
            await serviceClient.from('stripe_products').update({
              stripe_price_id: stripePriceId || prodRow.stripe_price_id || null,
              price_amount: amount,
              price_currency: currency,
              price_interval: interval,
              price_active: active,
              updated_at: new Date().toISOString(),
            }).eq('id', prodRow.id);
          }
        }
      } catch (e) {
        console.error('[Stripe Webhook] Error syncing product/price:', e);
      }
    }

    // Handle checkout.session.completed
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as any;

      console.log("Received checkout.session.completed for", session.id);

      // Find matching transaction
      const { data: tx, error: txErr } = await serviceClient
        .from("stripe_transactions")
        .select("*")
        .eq("stripe_checkout_session_id", session.id)
        .maybeSingle();

      if (txErr) {
        console.error("Error fetching stripe transaction:", txErr);
      }

      // Update transaction with payment intent and mark succeeded
      const updatePayload: any = {
        stripe_payment_intent_id: session.payment_intent || null,
        status: "succeeded",
      };

      // Try to retrieve payment intent details to get charge id
      try {
        if (session.payment_intent) {
          const pi = await stripe.paymentIntents.retrieve(
            session.payment_intent as string,
            tx?.stripe_account_id
              ? { stripeAccount: tx.stripe_account_id }
              : undefined,
          );
          const charge = (pi as any).charges?.data?.[0];
          if (charge) updatePayload.stripe_charge_id = charge.id;
          if ((pi as any).payment_method_types) {
            updatePayload.payment_method = (pi as any).payment_method_types[0];
          }
        }
      } catch (e) {
        console.warn("Failed to retrieve payment intent details:", e);
      }

      if (tx) {
        await serviceClient
          .from("stripe_transactions")
          .update(updatePayload)
          .eq("id", tx.id);
      }

      // Process enrollments or class pass purchases based on metadata
      const metadata = session.metadata || {};

      // Helper to resolve a user_id from either tx.user_id or user_profile_id
      async function resolveUserId(): Promise<string | null> {
        if (tx?.user_id) return tx.user_id;
        if (metadata.user_profile_id) {
          const { data: profile } = await serviceClient
            .from("user_profiles")
            .select("user_id")
            .eq("id", metadata.user_profile_id)
            .maybeSingle();
          return profile?.user_id || null;
        }
        return null;
      }

      const userId = await resolveUserId();

      // Resolve a privacy-focused profile snapshot for the resolved user (if any)
      let snapshot: any = {};
      if (userId) {
        try {
          // Prefer the normalized user_profiles table if available
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
            // Fallback to auth.users table
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
              house_number_addition:
                usr?.user_metadata?.house_number_addition ||
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
        } catch (e) {
          console.warn("Failed to resolve profile snapshot in webhook:", e);
        }
      }

      // If class pass purchase flow
      if (metadata.class_pass_product_id) {
        try {
          const studioId = metadata.studio_id;
          const productId = metadata.class_pass_product_id;
          const credits = parseInt(metadata.credit_count || "0", 10) || 0;
          const expirationMonths = metadata.expiration_months
            ? parseInt(metadata.expiration_months, 10)
            : null;

          if (!userId) {
            console.warn("No user resolved for class pass purchase; skipping");
          } else {
            // Upsert purchase row by session id
            // Compute expires_at if configured
            let expiresAt: string | null = null;
            if (expirationMonths && expirationMonths > 0) {
              const d = new Date();
              d.setMonth(d.getMonth() + expirationMonths);
              expiresAt = d.toISOString();
            }

            // Insert purchase (unique on checkout session id) then update to paid
            const { data: purchaseRow, error: insErr } = await serviceClient
              .from("class_pass_purchases")
              .insert({
                user_id: userId,
                studio_id: studioId,
                product_id: productId,
                credits_total: credits,
                credits_used: 0,
                expires_at: expiresAt,
                status: "paid",
                stripe_checkout_session_id: session.id,
                stripe_payment_intent_id: session.payment_intent || null,
              })
              .select("*")
              .maybeSingle();

            if (insErr && insErr.code !== "23505") { // ignore unique violation on retry
              console.error("Error inserting class_pass_purchase:", insErr);
            }

            // Fetch (or re-fetch) the purchase row to get id
            const { data: purchase } = await serviceClient
              .from("class_pass_purchases")
              .select("*")
              .eq("stripe_checkout_session_id", session.id)
              .maybeSingle();

            // Create ledger grant
            if (purchase && credits > 0) {
              const { error: ledErr } = await serviceClient
                .from("class_pass_ledger")
                .insert({
                  user_id: userId,
                  studio_id: studioId,
                  purchase_id: purchase.id,
                  delta: credits,
                  reason: "purchase",
                  metadata: { session_id: session.id },
                });
              if (ledErr) {
                console.error(
                  "Error inserting class_pass_ledger purchase grant:",
                  ledErr,
                );
              }
            }
          }
        } catch (e) {
          console.error("Error processing class pass purchase:", e);
        }
      }
      // If cart flow
      if (metadata.cart_id) {
        try {
          const { data: cart } = await serviceClient
            .from("carts")
            .select("id, user_id, status")
            .eq("id", metadata.cart_id)
            .maybeSingle();

          if (cart && cart.status === "active") {
            const { data: cartItems } = await serviceClient
              .from("cart_items")
              .select(
                "program_id, price_snapshot, lesson_detail_type, lesson_detail_id, lesson_metadata",
              )
              .eq("cart_id", metadata.cart_id);

            if (cartItems && cartItems.length > 0) {
              // If profile incomplete, skip enrollment and mark transaction
              const missing = missingProfileFields(snapshot);
              if (missing.length > 0) {
                console.warn(
                  "Skipping enrollment in webhook due to incomplete profile snapshot for user",
                  userId,
                  missing,
                );
                if (tx && tx.id) {
                  await serviceClient.from("stripe_transactions").update({
                    status: "failed_profile_incomplete",
                    metadata: { missing },
                  }).eq("id", tx.id);
                }
              } else {
                // Capacity/waitlist enforcement (belt + suspenders)
                const uniqueProgramIds = Array.from(
                  new Set(
                    (cartItems || []).map((i: any) => String(i.program_id))
                      .filter(Boolean),
                  ),
                );

                const { data: capPrograms } = await serviceClient
                  .from("programs")
                  .select(
                    "id, studio_id, title, capacity, waitlist_enabled, manual_full_override",
                  )
                  .in("id", uniqueProgramIds);

                const programById = new Map(
                  (capPrograms || []).map((p: any) => [String(p.id), p]),
                );

                const { data: activeRows, error: activeErr } =
                  await serviceClient
                    .from("inschrijvingen")
                    .select("program_id")
                    .in("program_id", uniqueProgramIds)
                    .eq("status", "actief");
                if (activeErr) {
                  console.warn(
                    "Failed to load active counts in webhook",
                    activeErr,
                  );
                }

                const enrolledCounts: Record<string, number> = {};
                for (const row of (activeRows || []) as any[]) {
                  const pid = String(row.program_id);
                  enrolledCounts[pid] = (enrolledCounts[pid] || 0) + 1;
                }

                const { data: acceptedRows } = await serviceClient
                  .from("inschrijvingen")
                  .select("program_id")
                  .eq("user_id", userId)
                  .in("program_id", uniqueProgramIds)
                  .eq("status", "waitlist_accepted");
                const acceptedSet = new Set(
                  (acceptedRows || []).map((r: any) => String(r.program_id)),
                );

                const blockedNoWaitlist: string[] = [];

                // Insert/upgrade enrollments (attach the resolved profile snapshot)
                const enrollPayload = (cartItems || []).flatMap((item: any) => {
                  const pid = String(item.program_id);
                  const program = programById.get(pid);
                  const cap = typeof (program as any)?.capacity === "number"
                    ? (program as any).capacity
                    : null;
                  const isFull = !!(program as any)?.manual_full_override ||
                    (!!cap && cap > 0 && (enrolledCounts[pid] || 0) >= cap);
                  const waitlistEnabled =
                    !!(program as any)?.waitlist_enabled && !!cap && cap > 0;

                  if (isFull && !acceptedSet.has(pid)) {
                    if (!waitlistEnabled) {
                      blockedNoWaitlist.push(pid);
                      return [];
                    }
                  }

                  const status =
                    (isFull && waitlistEnabled && !acceptedSet.has(pid))
                      ? "waitlisted"
                      : "actief";

                  return [{
                    user_id: userId,
                    program_id: item.program_id,
                    status,
                    form_data: {
                      lesson_detail_type: item.lesson_detail_type || null,
                      lesson_detail_id: item.lesson_detail_id || null,
                      lesson_metadata: item.lesson_metadata || null,
                      price_snapshot: item.price_snapshot || null,
                    },
                    profile_snapshot: snapshot || {},
                    updated_at: new Date().toISOString(),
                  }];
                });

                if (enrollPayload.length > 0) {
                  await serviceClient
                    .from("inschrijvingen")
                    .upsert(enrollPayload as any, {
                      onConflict: "user_id,program_id",
                    });

                  // Best-effort notify studio admins/owner for active enrollments
                  try {
                    const activeProgramIds = (enrollPayload as any[])
                      .filter((p) => p?.status === 'actief')
                      .map((p) => String(p.program_id))
                      .filter(Boolean)

                    if (activeProgramIds.length > 0) {
                      const { data: rows } = await serviceClient
                        .from('inschrijvingen')
                        .select('id, program_id, profile_snapshot, status')
                        .eq('user_id', userId)
                        .in('program_id', activeProgramIds)

                      for (const row of (rows || []) as any[]) {
                        if (row?.status !== 'actief') continue
                        const program = programById.get(String(row.program_id)) as any
                        const studioId = program?.studio_id ? String(program.studio_id) : ''
                        if (!studioId) continue
                        await notifyStudioAdminsOnEnrollment({
                          studioId,
                          programId: String(row.program_id),
                          enrollmentId: row?.id,
                          enrolledUserId: String(userId),
                          profileSnapshot: row?.profile_snapshot ?? snapshot,
                          programTitle: program?.title ?? null,
                        })
                      }
                    }
                  } catch {
                    // ignore
                  }
                }

                if (blockedNoWaitlist.length > 0 && tx?.id) {
                  await serviceClient.from("stripe_transactions").update({
                    status: "needs_manual_review_full",
                    metadata: { blocked_program_ids: blockedNoWaitlist },
                  }).eq("id", tx.id);
                }

                // Mark cart completed
                await serviceClient.from("carts").update({
                  status: "completed",
                  updated_at: new Date().toISOString(),
                }).eq("id", metadata.cart_id);
              }
            }
          } else {
            console.warn(
              "Cart not found or not active for cart_id=",
              metadata.cart_id,
            );
          }
        } catch (e) {
          console.error("Error processing cart enrollment:", e);
        }
      } else if (metadata.program_id) {
        // Single program payment flow
        try {
          const programId = metadata.program_id;
          if (!userId) {
            console.warn(
              "No user resolved for single-program payment; skipping enrollment",
            );
          } else {
            const missing = missingProfileFields(snapshot);
            if (missing.length > 0) {
              console.warn(
                "Skipping single-program enrollment due to incomplete profile snapshot for user",
                userId,
                missing,
              );
              if (tx && tx.id) {
                await serviceClient.from("stripe_transactions").update({
                  status: "failed_profile_incomplete",
                  metadata: { missing },
                }).eq("id", tx.id);
              }
            } else {
              // Capacity/waitlist enforcement (belt + suspenders)
              const { data: program } = await serviceClient
                .from("programs")
                .select("id, studio_id, title, capacity, waitlist_enabled, manual_full_override")
                .eq("id", programId)
                .maybeSingle();

              const cap = typeof (program as any)?.capacity === "number"
                ? (program as any).capacity
                : null;
              const waitlistEnabled = !!(program as any)?.waitlist_enabled &&
                !!cap && cap > 0;

              let status: "actief" | "waitlisted" = "actief";
              if (cap && cap > 0) {
                const { count: activeCount } = await serviceClient
                  .from("inschrijvingen")
                  .select("id", { count: "exact", head: true })
                  .eq("program_id", programId)
                  .eq("status", "actief");

                const enrolled = activeCount || 0;
                const isFull = !!(program as any)?.manual_full_override ||
                  enrolled >= cap;
                if (isFull) {
                  const { data: accepted } = await serviceClient
                    .from("inschrijvingen")
                    .select("id")
                    .eq("program_id", programId)
                    .eq("user_id", userId)
                    .eq("status", "waitlist_accepted")
                    .maybeSingle();

                  if (!accepted?.id) {
                    if (!waitlistEnabled) {
                      if (tx?.id) {
                        await serviceClient.from("stripe_transactions").update({
                          status: "needs_manual_review_full",
                          metadata: { blocked_program_ids: [programId] },
                        }).eq("id", tx.id);
                      }
                      // Skip insert to avoid overbooking
                      return NextResponse.json({ received: true });
                    }
                    status = "waitlisted";
                  }
                }
              }

              const { data: upserted } = await serviceClient.from("inschrijvingen").upsert({
                user_id: userId,
                program_id: programId,
                status,
                form_data: {},
                profile_snapshot: snapshot || {},
                updated_at: new Date().toISOString(),
              } as any, { onConflict: "user_id,program_id" }).select('id, status, profile_snapshot');

              // Best-effort notify studio admins/owner when enrollment is active
              try {
                const normalized = Array.isArray(upserted) ? upserted[0] : upserted
                if (status === 'actief') {
                  const studioId = (program as any)?.studio_id ? String((program as any).studio_id) : ''
                  if (studioId) {
                    await notifyStudioAdminsOnEnrollment({
                      studioId,
                      programId: String(programId),
                      enrollmentId: normalized?.id ?? null,
                      enrolledUserId: String(userId),
                      profileSnapshot: normalized?.profile_snapshot ?? snapshot,
                      programTitle: (program as any)?.title ?? null,
                    })
                  }
                }
              } catch {
                // ignore
              }
            }
          }
        } catch (e) {
          console.error("Error inserting single enrollment:", e);
        }
      }
    }

    // Return 200 to acknowledge receipt
    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("Unexpected webhook error:", err);
    return NextResponse.json({ error: "Webhook handler error" }, {
      status: 500,
    });
  }
}

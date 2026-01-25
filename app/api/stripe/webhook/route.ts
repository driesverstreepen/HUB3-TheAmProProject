import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Stripe integration removed; webhooks disabled" }, { status: 410 });
}
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

import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase";

export const revalidate = 3600;

const getAmsterdamDayKey = () => {
    try {
        return new Date().toLocaleDateString("sv-SE", {
            timeZone: "Europe/Amsterdam",
        });
    } catch {
        return new Date().toISOString().slice(0, 10);
    }
};

const normalizeDatePart = (raw: any): string | null => {
    if (!raw) return null;
    const str = String(raw);
    const datePart = str.length >= 10 ? str.slice(0, 10) : str;
    return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null;
};

const isTrialProgram = (p: any) => {
    const t = String(p?.program_type || "").toLowerCase();
    if (t.includes("trial")) return true;
    if (p?.is_trial) return true;
    if (p?.title && String(p.title).toLowerCase().includes("proef")) return true;
    if (p?.price === 0) return true;
    return false;
};

const getSeasonEndDatePart = (p: any): string | null => {
    const raw =
        (Array.isArray(p?.group_details)
            ? p?.group_details?.[0]?.season_end
            : p?.group_details?.season_end) ||
        null;
    return normalizeDatePart(raw);
};

const hasUpcomingScheduleForTrial = async (
    supabase: ReturnType<typeof createSupabaseServiceClient>,
    programId: string,
    program: any,
    todayKey: string,
) => {
    let sawAnyDate = false;
    let hasUpcoming = false;

    const detailsRaw = program?.workshop_details;
    const details = Array.isArray(detailsRaw) ? detailsRaw : (detailsRaw ? [detailsRaw] : []);
    for (const d of details) {
        const datePart = normalizeDatePart(d?.date || d?.start_datetime || d?.startDateTime || null);
        if (!datePart) continue;
        sawAnyDate = true;
        if (datePart >= todayKey) {
            hasUpcoming = true;
            break;
        }
    }

    if (!hasUpcoming) {
        const { data: lessons, error } = await supabase
            .from("lessons")
            .select("date")
            .eq("program_id", programId);

        if (!error && lessons) {
            for (const row of lessons as any[]) {
                const datePart = normalizeDatePart(row?.date);
                if (!datePart) continue;
                sawAnyDate = true;
                if (datePart >= todayKey) {
                    hasUpcoming = true;
                    break;
                }
            }
        }
    }

    return { sawAnyDate, hasUpcoming };
};

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> | { id: string } },
) {
    try {
        const resolved = await Promise.resolve(params);
        const programId = resolved?.id;

        if (!programId) {
            return NextResponse.json({ error: "Missing program id" }, {
                status: 400,
            });
        }

        const supabase = createSupabaseServiceClient();

        // 1) Load public program (service role bypasses RLS)
        const { data: program, error: programError } = await supabase
            .from("programs")
            .select(
                `
        id,
        title,
        description,
        program_type,
        price,
        capacity,
        is_public,
        dance_style,
        level,
        min_age,
        max_age,
        studio_id,
        show_capacity_to_users,
        linked_trial_program_id,
        group_details(*),
        workshop_details(*),
        program_locations(location_id, locations(*))
      `,
            )
            .eq("id", programId)
            .eq("is_public", true)
            .maybeSingle();

        if (programError) {
            return NextResponse.json(
                { error: programError.message || "Failed to load program" },
                { status: 500 },
            );
        }

        if (!program) {
            return NextResponse.json(
                { error: "Program not found or not public" },
                { status: 404 },
            );
        }

        // 2) Ensure the owning studio is public too (prevents leaking private studio data)
        const { data: studio, error: studioError } = await supabase
            .from("studios")
            .select("id, naam, stad, is_public")
            .eq("id", (program as any).studio_id)
            .maybeSingle();

        if (studioError) {
            return NextResponse.json(
                { error: studioError.message || "Failed to load studio" },
                { status: 500 },
            );
        }

        if (!studio || studio.is_public !== true) {
            return NextResponse.json(
                { error: "Program not found or not public" },
                { status: 404 },
            );
        }

        // 3) Optional linked trial title (nice-to-have; safe to omit)
        let linkedTrialProgram: { id: string; title: string } | null = null;
        try {
            const todayKey = getAmsterdamDayKey();
            const linkedId = (program as any)?.linked_trial_program_id as
                | string
                | null
                | undefined;
            if (linkedId) {
                const { data: linked, error: linkedError } = await supabase
                    .from("programs")
                    .select(
                        "id, title, is_public, program_type, price, is_trial, group_details(*), workshop_details(*)",
                    )
                    .eq("id", linkedId)
                    .maybeSingle();
                if (
                    !linkedError && linked && (linked as any).is_public === true
                ) {
                    // Only expose the linked proefles program when it isn't verlopen
                    // and still has upcoming proeflessen users can book.
                    const seasonEnd = getSeasonEndDatePart(linked);
                    if (!seasonEnd || seasonEnd >= todayKey) {
                        const trial = isTrialProgram(linked);
                        if (trial) {
                            const { sawAnyDate, hasUpcoming } = await hasUpcomingScheduleForTrial(
                                supabase,
                                String((linked as any).id),
                                linked,
                                todayKey,
                            );
                            if (!sawAnyDate || hasUpcoming) {
                                linkedTrialProgram = {
                                    id: (linked as any).id,
                                    title: (linked as any).title,
                                };
                            }
                        }
                    }
                }
            }
        } catch {
            // ignore
        }

        return NextResponse.json({ program, studio, linkedTrialProgram });
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Unexpected error" },
            { status: 500 },
        );
    }
}

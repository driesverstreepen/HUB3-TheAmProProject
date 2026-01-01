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

const isTrialProgram = (p: any) => {
    const t = String(p?.program_type || "").toLowerCase();
    if (t.includes("trial")) return true;
    if (p?.is_trial) return true;
    if (p?.title && String(p.title).toLowerCase().includes("proef")) return true;
    if (p?.price === 0) return true;
    return false;
};

const normalizeDatePart = (raw: any): string | null => {
    if (!raw) return null;
    const str = String(raw);
    const datePart = str.length >= 10 ? str.slice(0, 10) : str;
    return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null;
};

const getSeasonEndDatePart = (p: any): string | null => {
    const raw =
        (Array.isArray(p?.group_details)
            ? p?.group_details?.[0]?.season_end
            : p?.group_details?.season_end) ||
        null;
    return normalizeDatePart(raw);
};

const hasAnyUpcomingSchedule = (
    p: any,
    todayKey: string,
    trialLessonDatesByProgramId: Record<string, string[]>,
) => {
    const type = String(p?.program_type || "").toLowerCase();
    const trial = isTrialProgram(p);

    if (!(type === "workshop" || trial)) return { sawAnyDate: false, hasUpcoming: false };

    let sawAnyDate = false;
    let hasUpcoming = false;

    const detailsRaw = p?.workshop_details;
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

    if (!hasUpcoming && trial) {
        const pid = String(p?.id || "");
        const lessonDates = trialLessonDatesByProgramId[pid] || [];
        for (const datePart of lessonDates) {
            sawAnyDate = true;
            if (datePart >= todayKey) {
                hasUpcoming = true;
                break;
            }
        }
    }

    return { sawAnyDate, hasUpcoming };
};

const isExpiredForPublicListing = (
    p: any,
    todayKey: string,
    trialLessonDatesByProgramId: Record<string, string[]>,
) => {
    const seasonEnd = getSeasonEndDatePart(p);
    if (seasonEnd && seasonEnd < todayKey) return true;

    const { sawAnyDate, hasUpcoming } = hasAnyUpcomingSchedule(
        p,
        todayKey,
        trialLessonDatesByProgramId,
    );

    // For workshops/proeflessen: if we have schedule info and everything is in the past -> expired.
    if (sawAnyDate && !hasUpcoming) return true;
    return false;
};

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> | { id: string } },
) {
    try {
        const resolved = await Promise.resolve(params);
        const studioId = resolved?.id;

        if (!studioId) {
            return NextResponse.json({ error: "Missing studio id" }, {
                status: 400,
            });
        }

        const supabase = createSupabaseServiceClient();

        const { data: studio, error: studioError } = await supabase
            .from("studios")
            .select(
                "id, naam, beschrijving, adres, stad, postcode, contact_email, phone_number, website, is_public, features, logo_url",
            )
            .eq("id", studioId)
            .eq("is_public", true)
            .maybeSingle();

        if (studioError) {
            return NextResponse.json(
                { error: studioError.message || "Failed to load studio" },
                { status: 500 },
            );
        }

        if (!studio) {
            return NextResponse.json(
                { error: "Studio not found or not public" },
                { status: 404 },
            );
        }

        const { data: programs, error: programsError } = await supabase
            .from("programs")
            .select(
                `
        id,
        title,
        description,
        program_type,
        price,
        capacity,
                waitlist_enabled,
        is_public,
        dance_style,
        level,
        min_age,
        max_age,
        show_capacity_to_users,
        linked_trial_program_id,
        group_details(*),
        workshop_details(*),
        program_locations(location_id, locations(*))
      `,
            )
            .eq("studio_id", studioId)
            .eq("is_public", true)
            .order("title", { ascending: true });

        if (programsError) {
            return NextResponse.json(
                { error: programsError.message || "Failed to load programs" },
                { status: 500 },
            );
        }

        const programList = programs || [];

        // Collect trial ids and fetch their lesson dates so we can hide expired proeflessen
        // that are stored in the lessons table (not workshop_details).
        const todayKey = getAmsterdamDayKey();
        const trialIds = programList.filter(isTrialProgram).map((p: any) => p.id).filter(Boolean);
        const trialLessonDatesByProgramId: Record<string, string[]> = {};
        if (trialIds.length > 0) {
            const { data: lessons, error: lessonsError } = await supabase
                .from("lessons")
                .select("program_id, date")
                .in("program_id", trialIds);

            if (!lessonsError && lessons) {
                for (const row of lessons as any[]) {
                    const pid = String(row.program_id);
                    const datePart = normalizeDatePart(row.date);
                    if (!pid || !datePart) continue;
                    if (!trialLessonDatesByProgramId[pid]) trialLessonDatesByProgramId[pid] = [];
                    trialLessonDatesByProgramId[pid].push(datePart);
                }
            }
        }

        // Remove expired programs at the source (visitor-facing)
        const visibleProgramList = programList.filter((p: any) =>
            !isExpiredForPublicListing(p, todayKey, trialLessonDatesByProgramId)
        );

        // Attach enrolled_count (active enrollments only) so UI can show fullness.
        const programIds = visibleProgramList.map((p: any) => p.id).filter(Boolean);
        let enrolledCounts: Record<string, number> = {};
        if (programIds.length > 0) {
            const { data: inschrijvingen, error: insErr } = await supabase
                .from("inschrijvingen")
                .select("program_id")
                .in("program_id", programIds)
                .eq("status", "actief");

            if (!insErr && inschrijvingen) {
                for (const row of inschrijvingen as any[]) {
                    const pid = String(row.program_id);
                    enrolledCounts[pid] = (enrolledCounts[pid] || 0) + 1;
                }
            }
        }

        const programsWithCounts = visibleProgramList.map((p: any) => ({
            ...p,
            enrolled_count: enrolledCounts[String(p.id)] || 0,
        }));

        const { data: policies, error: policiesError } = await supabase
            .from("studio_policies")
            .select(
                "id, title, content, version, cancellation_policy, refund_policy",
            )
            .eq("studio_id", studioId)
            .eq("is_active", true)
            .order("version", { ascending: false });

        if (policiesError) {
            return NextResponse.json(
                {
                    error: policiesError.message ||
                        "Failed to load studio policies",
                },
                { status: 500 },
            );
        }

        return NextResponse.json({
            studio,
            programs: programsWithCounts,
            policies: policies || [],
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Unexpected error" },
            { status: 500 },
        );
    }
}

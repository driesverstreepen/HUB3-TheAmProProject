import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase";

export const revalidate = 86400;

const getAmsterdamDayKey = () => {
    try {
        // YYYY-MM-DD
        return new Date().toLocaleDateString("sv-SE", {
            timeZone: "Europe/Amsterdam",
        });
    } catch {
        return new Date().toISOString().slice(0, 10);
    }
};

const hashStringToInt = (str: string) => {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
};

const mulberry32 = (seed: number) => {
    return () => {
        let t = (seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

const seededShuffle = <T>(arr: T[], seedStr: string) => {
    const rand = mulberry32(hashStringToInt(seedStr));
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

const isTrialProgram = (p: any) => {
    const t = String(p?.program_type || "").toLowerCase();
    if (t.includes("trial")) return true;
    if (p?.is_trial) return true;
    if (p?.title && String(p.title).toLowerCase().includes("proef")) {
        return true;
    }
    if (p?.price === 0) return true;
    return false;
};

const hasUpcomingWorkshopDate = (p: any, todayKey: string) => {
    const detailsRaw = p?.workshop_details;
    const details = Array.isArray(detailsRaw) ? detailsRaw : (detailsRaw ? [detailsRaw] : []);
    if (!details || details.length === 0) return true;

    let sawAnyDate = false;
    for (const d of details) {
        const raw = d?.date || d?.start_datetime || d?.startDateTime || null;
        if (!raw) continue;
        const str = String(raw);
        const datePart = str.length >= 10 ? str.slice(0, 10) : str;
        if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
            sawAnyDate = true;
            if (datePart >= todayKey) return true;
        }
    }
    return !sawAnyDate;
};

export async function GET() {
    try {
        const supabase = createSupabaseServiceClient();

        // 1) Fetch public studios (source of truth for visibility)
        const { data: studios, error: studiosError } = await supabase
            .from("studios")
            .select("id")
            .eq("is_public", true);

        if (studiosError) {
            return NextResponse.json(
                {
                    error: studiosError.message ||
                        "Failed to load public studios",
                },
                { status: 500 },
            );
        }

        const studioIds = (studios || []).map((s: any) => s.id).filter(Boolean);
        if (studioIds.length === 0) {
            return NextResponse.json({
                dayKey: getAmsterdamDayKey(),
                programs: [],
            });
        }

        // 2) Fetch public programs belonging to public studios
        const { data, error } = await supabase
            .from("programs")
            .select(
                "*, studio:studios(naam, id), group_details(*), workshop_details(*), program_locations(location_id, locations(*))",
            )
            .eq("is_public", true)
            .in("studio_id", studioIds)
            .order("created_at", { ascending: false })
            .limit(500);

        if (error) {
            return NextResponse.json(
                { error: error.message || "Failed to load programs" },
                { status: 500 },
            );
        }

        const dayKey = getAmsterdamDayKey();
        const all = Array.isArray(data) ? data : [];

        const normalized = all
            .map((p: any) => {
            const locs = (p.program_locations || [])
                .map((pl: any) => pl?.locations)
                .filter(Boolean);
            return { ...p, locations: locs };
        })
            // Hide expired workshops/proeflessen (keep cursussen)
            .filter((p: any) => {
                const type = String(p?.program_type || "").toLowerCase();
                if (type === "workshop" || isTrialProgram(p)) {
                    return hasUpcomingWorkshopDate(p, dayKey);
                }
                return true;
            });

        const cursussenAll = normalized.filter(
            (p: any) => p.program_type === "group" && !isTrialProgram(p),
        );
        const workshopsAll = normalized.filter((p: any) =>
            p.program_type === "workshop"
        );
        const proeflessenAll = normalized.filter((p: any) => isTrialProgram(p));

        const cursussen = seededShuffle(cursussenAll, `${dayKey}:cursussen`)
            .slice(0, 6);
        const workshops = seededShuffle(workshopsAll, `${dayKey}:workshops`)
            .slice(0, 6);
        const proeflessen = seededShuffle(
            proeflessenAll,
            `${dayKey}:proeflessen`,
        ).slice(0, 6);

        const combined = [...cursussen, ...workshops, ...proeflessen];

        return NextResponse.json({ dayKey, programs: combined });
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Unexpected error" },
            { status: 500 },
        );
    }
}

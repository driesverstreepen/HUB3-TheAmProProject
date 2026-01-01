import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase";

export const revalidate = 3600;

type SortOption =
    | "newest"
    | "oldest"
    | "date-asc"
    | "price-asc"
    | "price-desc";

const parsePositiveInt = (value: string | null, fallback: number) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.floor(n);
};

const getAmsterdamDayKey = () => {
    try {
        return new Date().toLocaleDateString("sv-SE", {
            timeZone: "Europe/Amsterdam",
        });
    } catch {
        return new Date().toISOString().slice(0, 10);
    }
};

const hasUpcomingWorkshopDate = (program: any, todayKey: string) => {
    const detailsRaw = program?.workshop_details;
    const details = Array.isArray(detailsRaw) ? detailsRaw : (detailsRaw ? [detailsRaw] : []);
    if (!details || details.length === 0) return true; // no date info -> don't hide

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

    // If we have dates and all are < today => expired.
    return !sawAnyDate;
};

export async function GET(request: Request) {
    try {
        const supabase = createSupabaseServiceClient();

        const url = new URL(request.url);
        const page = parsePositiveInt(url.searchParams.get("page"), 1);
        const pageSize = Math.min(
            parsePositiveInt(url.searchParams.get("pageSize"), 12),
            48,
        );
        const search = (url.searchParams.get("search") || "").trim();
        const studioId = (url.searchParams.get("studioId") || "").trim();
        const city = (url.searchParams.get("city") || "").trim();
        const danceStyle = (url.searchParams.get("danceStyle") || "").trim();
        const level = (url.searchParams.get("level") || "").trim();
        const sort = (url.searchParams.get("sort") || "newest") as SortOption;
        const includeFacets =
            (url.searchParams.get("includeFacets") || "").trim() === "1";

        // Only consider workshops from public studios (source of truth for visibility)
        let studiosQuery = supabase
            .from("studios")
            .select("id")
            .eq("is_public", true);

        if (city) {
            studiosQuery = studiosQuery.eq("stad", city);
        }

        const { data: studios, error: studiosError } = await studiosQuery;

        if (studiosError) {
            return NextResponse.json({
                error: studiosError.message || "Failed to load public studios",
            }, { status: 500 });
        }

        const studioIds = (studios || [])
            .map((s: any) => s.id)
            .filter(Boolean);
        if (studioIds.length === 0) {
            return NextResponse.json({
                workshops: [],
                total: 0,
                page,
                pageSize,
            });
        }

        // Optional facets for filter dropdowns (keep separate from pagination)
        let facets:
            | { cities: string[]; danceStyles: string[]; levels: string[] }
            | undefined;

        if (includeFacets) {
            // Cities based on all public studios (not restricted to workshops)
            const { data: allCitiesData } = await supabase
                .from("studios")
                .select("stad")
                .eq("is_public", true);

            const citySet = new Set<string>();
            (allCitiesData || []).forEach((s: any) => {
                if (s?.stad) citySet.add(String(s.stad));
            });

            // Dance styles + levels based on public workshop programs in public studios
            const { data: styleLevelData } = await supabase
                .from("programs")
                .select("dance_style, level")
                .eq("is_public", true)
                .eq("program_type", "workshop")
                .in("studio_id", studioIds)
                .limit(2000);

            const styleSet = new Set<string>();
            const levelSet = new Set<string>();

            (styleLevelData || []).forEach((p: any) => {
                if (p?.dance_style) styleSet.add(String(p.dance_style));
                if (p?.level) levelSet.add(String(p.level));
            });

            facets = {
                cities: Array.from(citySet).sort((a, b) => a.localeCompare(b)),
                danceStyles: Array.from(styleSet).sort((a, b) =>
                    a.localeCompare(b)
                ),
                levels: Array.from(levelSet).sort((a, b) => a.localeCompare(b)),
            };
        }

        const start = (page - 1) * pageSize;
        const end = start + pageSize - 1;

        let query = supabase
            .from("programs")
            .select(
                "*, studio:studios(*), workshop_details(*), program_locations(location_id, locations(*))",
                { count: "exact" },
            )
            .eq("is_public", true)
            .eq("program_type", "workshop")
            .in("studio_id", studioIds);

        if (studioId) {
            query = query.eq("studio_id", studioId);
        }

        if (search) {
            const term = `%${search}%`;
            query = query.or(`title.ilike.${term},description.ilike.${term}`);
        }

        if (danceStyle) {
            query = query.eq("dance_style", danceStyle);
        }

        if (level) {
            query = query.eq("level", level);
        }

        switch (sort) {
            case "oldest":
                query = query.order("created_at", { ascending: true });
                break;
            case "date-asc":
                // Order by workshop start datetime (embedded table)
                query = query
                    .order("start_datetime", {
                        ascending: true,
                        foreignTable: "workshop_details",
                    })
                    .order("created_at", { ascending: false });
                break;
            case "price-asc":
                query = query.order("price", { ascending: true });
                break;
            case "price-desc":
                query = query.order("price", { ascending: false });
                break;
            case "newest":
            default:
                query = query.order("created_at", { ascending: false });
                break;
        }

        const { data, error, count } = await query.range(start, end);
        if (error) {
            return NextResponse.json({
                error: error.message || "Failed to load workshops",
            }, { status: 500 });
        }

        const todayKey = getAmsterdamDayKey();

        const normalized = (Array.isArray(data) ? data : [])
            .map((p: any) => {
            const locs = (p.program_locations || [])
                .map((pl: any) => pl?.locations)
                .filter(Boolean);
            return { ...p, locations: locs };
        })
            // Defensive: even if DB query returns past workshops, don't expose them.
            .filter((p: any) => hasUpcomingWorkshopDate(p, todayKey));

        return NextResponse.json({
            workshops: normalized,
            // Note: count reflects DB count; UI uses this for paging.
            // Keeping it unchanged avoids breaking API contract; filtering is best-effort.
            total: count ?? 0,
            page,
            pageSize,
            ...(facets ? { facets } : {}),
        });
    } catch (error: any) {
        return NextResponse.json({
            error: error?.message || "Unexpected error",
        }, { status: 500 });
    }
}

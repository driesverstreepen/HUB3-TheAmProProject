import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ studioId: string }> },
) {
    try {
        const authHeader = req.headers.get("authorization");
        if (!authHeader) {
            return NextResponse.json({ error: "Unauthorized" }, {
                status: 401,
            });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { studioId } = await params;

        const { searchParams } = new URL(req.url);
        const programId = (searchParams.get("programId") || "").trim();
        const includePrograms =
            (searchParams.get("includePrograms") || "").trim() === "true";

        // Get studio default settings
        const { data: studioSettings, error } = await supabase
            .from("studio_evaluation_settings")
            .select("*")
            .eq("studio_id", studioId)
            .maybeSingle();

        if (error && error.code !== "PGRST116") {
            throw error;
        }

        // Return default settings if not found
        const studioBase = studioSettings || {
            studio_id: studioId,
            enabled: false,
            default_visibility: "hidden",
            editable_after_publish_days: 7,
            allow_teachers_edit: true,
            method: "score",
            categories: [],
            rating_scale: ["voldoende", "goed", "zeer goed", "uitstekend"],
            periods: [],
        };

        const normalizedStudio = {
            ...studioBase,
            method: studioBase.method || "score",
            categories: Array.isArray(studioBase.categories)
                ? studioBase.categories
                : [],
            rating_scale: Array.isArray(studioBase.rating_scale) &&
                    studioBase.rating_scale.length > 0
                ? studioBase.rating_scale
                : ["voldoende", "goed", "zeer goed", "uitstekend"],
            periods: Array.isArray(studioBase.periods)
                ? studioBase.periods
                : [],
            default_visible_from: studioBase.default_visible_from || null,
        };

        // program-scoped: return effective settings for that program
        if (programId) {
            const { data: programSettings, error: psErr } = await supabase
                .from("program_evaluation_settings")
                .select("*")
                .eq("program_id", programId)
                .maybeSingle();

            if (
                psErr && psErr.code !== "PGRST116" && psErr.code !== "PGRST205"
            ) {
                throw psErr;
            }

            const effective = programSettings || {
                program_id: programId,
                enabled: false,
                default_visibility: normalizedStudio.default_visibility,
                default_visible_from: normalizedStudio.default_visible_from,
                editable_after_publish_days:
                    normalizedStudio.editable_after_publish_days,
                allow_teachers_edit: normalizedStudio.allow_teachers_edit,
                method: normalizedStudio.method,
                categories: normalizedStudio.categories,
                rating_scale: normalizedStudio.rating_scale,
                periods: normalizedStudio.periods,
            };

            return NextResponse.json({
                ...effective,
                method: effective.method || normalizedStudio.method || "score",
                categories: Array.isArray(effective.categories)
                    ? effective.categories
                    : [],
                rating_scale: Array.isArray(effective.rating_scale) &&
                        effective.rating_scale.length > 0
                    ? effective.rating_scale
                    : ["voldoende", "goed", "zeer goed", "uitstekend"],
                periods: Array.isArray(effective.periods)
                    ? effective.periods
                    : [],
                default_visible_from: effective.default_visible_from || null,
                studio_enabled: !!normalizedStudio.enabled,
            });
        }

        // includePrograms: list programs with their effective settings
        if (includePrograms) {
            const { data: programs, error: progErr } = await supabase
                .from("programs")
                .select("id, title")
                .eq("studio_id", studioId)
                .order("title", { ascending: true });
            if (progErr && (progErr as any)?.code !== "PGRST205") throw progErr;

            const programIds = (programs || []).map((p: any) => p.id);
            let programSettingsRows: any[] = [];
            if (programIds.length > 0) {
                const { data: rows, error: psErr } = await supabase
                    .from("program_evaluation_settings")
                    .select("*")
                    .in("program_id", programIds);
                if (!psErr) programSettingsRows = rows || [];
            }
            const byId: Record<string, any> = {};
            for (const row of programSettingsRows) {
                if (row?.program_id) byId[String(row.program_id)] = row;
            }

            const items = (programs || []).map((p: any) => {
                const row = byId[String(p.id)] || null;
                const eff = row || {
                    program_id: p.id,
                    enabled: false,
                    default_visibility: normalizedStudio.default_visibility,
                    default_visible_from: normalizedStudio.default_visible_from,
                    editable_after_publish_days:
                        normalizedStudio.editable_after_publish_days,
                    allow_teachers_edit: normalizedStudio.allow_teachers_edit,
                    method: normalizedStudio.method,
                    categories: normalizedStudio.categories,
                    rating_scale: normalizedStudio.rating_scale,
                    periods: normalizedStudio.periods,
                };
                return {
                    program_id: p.id,
                    program_title: p.title,
                    settings: {
                        ...eff,
                        method: eff.method || normalizedStudio.method ||
                            "score",
                        categories: Array.isArray(eff.categories)
                            ? eff.categories
                            : [],
                        rating_scale: Array.isArray(eff.rating_scale) &&
                                eff.rating_scale.length > 0
                            ? eff.rating_scale
                            : ["voldoende", "goed", "zeer goed", "uitstekend"],
                        periods: Array.isArray(eff.periods) ? eff.periods : [],
                        default_visible_from: eff.default_visible_from || null,
                    },
                };
            });

            return NextResponse.json({
                studio: normalizedStudio,
                programs: items,
            });
        }

        // Backwards-compatible default: return studio settings
        return NextResponse.json(normalizedStudio);
    } catch (error: any) {
        console.error("Error fetching evaluation settings:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ studioId: string }> },
) {
    try {
        const authHeader = req.headers.get("authorization");
        if (!authHeader) {
            return NextResponse.json({ error: "Unauthorized" }, {
                status: 401,
            });
        }

        const body = await req.json();
        const { studioId } = await params;

        const { searchParams } = new URL(req.url);
        const programId =
            (searchParams.get("programId") || body?.program_id || "").trim();
        const applyToAll =
            (searchParams.get("applyToAll") || "").trim() === "true";

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Verify user is studio admin
        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await supabase.auth.getUser(token);

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, {
                status: 401,
            });
        }

        const { data: roleData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("studio_id", studioId)
            .maybeSingle();

        if (!roleData || !["studio_admin", "admin"].includes(roleData.role)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Apply current settings to all programs in the studio
        if (applyToAll) {
            const { data: programs, error: progErr } = await supabase
                .from("programs")
                .select("id")
                .eq("studio_id", studioId);
            if (progErr) throw progErr;

            const programIds = (programs || []).map((p: any) => p.id);
            if (programIds.length === 0) {
                return NextResponse.json({ ok: true, updated: 0 });
            }

            const payload = programIds.map((pid: string) => ({
                program_id: pid,
                enabled: body.enabled,
                default_visibility: body.default_visibility,
                default_visible_from: body.default_visible_from ?? null,
                editable_after_publish_days: body.editable_after_publish_days,
                allow_teachers_edit: body.allow_teachers_edit,
                method: body.method || "score",
                categories: Array.isArray(body.categories)
                    ? body.categories
                    : [],
                rating_scale: Array.isArray(body.rating_scale) &&
                        body.rating_scale.length > 0
                    ? body.rating_scale
                    : ["voldoende", "goed", "zeer goed", "uitstekend"],
                periods: Array.isArray(body.periods) ? body.periods : [],
                updated_at: new Date().toISOString(),
            }));

            const { error } = await supabase
                .from("program_evaluation_settings")
                .upsert(payload, { onConflict: "program_id" });

            if (error) throw error;
            return NextResponse.json({ ok: true, updated: programIds.length });
        }

        // Program-scoped upsert
        if (programId) {
            // Verify program belongs to studio
            const { data: programRow } = await supabase
                .from("programs")
                .select("id")
                .eq("id", programId)
                .eq("studio_id", studioId)
                .maybeSingle();
            if (!programRow) {
                return NextResponse.json({ error: "Program not found" }, {
                    status: 404,
                });
            }

            const { data, error } = await supabase
                .from("program_evaluation_settings")
                .upsert({
                    program_id: programId,
                    enabled: body.enabled,
                    default_visibility: body.default_visibility,
                    default_visible_from: body.default_visible_from ?? null,
                    editable_after_publish_days:
                        body.editable_after_publish_days,
                    allow_teachers_edit: body.allow_teachers_edit,
                    method: body.method || "score",
                    categories: Array.isArray(body.categories)
                        ? body.categories
                        : [],
                    rating_scale: Array.isArray(body.rating_scale) &&
                            body.rating_scale.length > 0
                        ? body.rating_scale
                        : ["voldoende", "goed", "zeer goed", "uitstekend"],
                    periods: Array.isArray(body.periods) ? body.periods : [],
                    updated_at: new Date().toISOString(),
                }, { onConflict: "program_id" })
                .select()
                .single();

            if (error) throw error;
            return NextResponse.json(data);
        }

        // Studio-scoped upsert (master toggle + defaults)
        const { data, error } = await supabase
            .from("studio_evaluation_settings")
            .upsert({
                studio_id: studioId,
                enabled: body.enabled,
                default_visibility: body.default_visibility,
                default_visible_from: body.default_visible_from ?? null,
                editable_after_publish_days: body.editable_after_publish_days,
                allow_teachers_edit: body.allow_teachers_edit,
                method: body.method || "score",
                categories: Array.isArray(body.categories)
                    ? body.categories
                    : [],
                rating_scale: Array.isArray(body.rating_scale) &&
                        body.rating_scale.length > 0
                    ? body.rating_scale
                    : ["voldoende", "goed", "zeer goed", "uitstekend"],
                periods: Array.isArray(body.periods) ? body.periods : [],
                updated_at: new Date().toISOString(),
            }, { onConflict: "studio_id" })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (error: any) {
        console.error("Error updating evaluation settings:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// GET /api/studio/[studioId]/program-teachers
// Optional: ?programId=<uuid>
// Returns mapping from program_id -> array of teacher objects { id, naam, first_name, last_name, email }
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ studioId: string }> },
) {
    try {
        const { studioId } = await params;
        const { searchParams } = new URL(req.url);
        const programId = searchParams.get("programId") || undefined;

        if (!studioId) {
            return NextResponse.json({ error: "studioId is required" }, {
                status: 400,
            });
        }

        const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        // Fetch teacher assignments for studio (optionally narrowed to one program)
        let tpQuery = supabase
            .from("teacher_programs")
            .select("program_id, teacher_id")
            .eq("studio_id", studioId);

        if (programId) tpQuery = tpQuery.eq("program_id", programId);

        const { data: tps, error: tpErr } = await tpQuery;
        if (tpErr) {
            return NextResponse.json({ error: tpErr.message }, { status: 500 });
        }

        const teacherIds = Array.from(
            new Set((tps || []).map((t: any) => t.teacher_id).filter(Boolean)),
        );
        let profiles: any[] = [];
        if (teacherIds.length > 0) {
            const { data: profs, error: profErr } = await supabase
                .from("user_profiles")
                .select("user_id, first_name, last_name, email")
                .in("user_id", teacherIds);
            if (profErr) {
                return NextResponse.json({ error: profErr.message }, {
                    status: 500,
                });
            }
            profiles = profs || [];
        }

        const profMap: Record<string, any> = {};
        for (const p of profiles) {
            profMap[p.user_id] = {
                id: p.user_id,
                first_name: p.first_name || "",
                last_name: p.last_name || "",
                email: p.email || "",
                naam: `${p.first_name || ""} ${p.last_name || ""}`.trim() ||
                    p.email || "Naamloos",
            };
        }

        const mapping: Record<string, any[]> = {};
        const idsByProgram: Record<string, string[]> = {};
        for (const row of tps || []) {
            const pid = String(row.program_id);
            const tid = String(row.teacher_id);
            idsByProgram[pid] = idsByProgram[pid] || [];
            idsByProgram[pid].push(tid);
            const prof = profMap[tid];
            if (prof) {
                mapping[pid] = mapping[pid] || [];
                mapping[pid].push(prof);
            }
        }

        return NextResponse.json({ mapping, idsByProgram }, { status: 200 });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || "Internal error" }, {
            status: 500,
        });
    }
}

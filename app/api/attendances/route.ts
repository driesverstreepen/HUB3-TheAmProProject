import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function parseToken(request: NextRequest): string | null {
    const authHeader = request.headers.get("authorization") || "";
    let token = authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length).trim()
        : null;

    if (token) return token;

    try {
        const sbToken = request.cookies.get("sb:token")?.value ||
            request.cookies.get("sb:session")?.value ||
            request.cookies.get("supabase-auth-token")?.value;
        if (!sbToken) return null;

        try {
            const parsed = JSON.parse(sbToken);
            token = parsed?.access_token || parsed?.accessToken || null;
            return token;
        } catch {
            return sbToken;
        }
    } catch {
        return null;
    }
}

export async function GET(request: NextRequest) {
    try {
        if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
            return NextResponse.json({ error: "Supabase not configured" }, {
                status: 500,
            });
        }

        const token = parseToken(request);
        if (!token) {
            return NextResponse.json({ error: "Missing auth token" }, {
                status: 401,
            });
        }

        const url = new URL(request.url);
        const lessonIdsRaw = url.searchParams.get("lesson_ids") || "";
        const lessonIds = Array.from(
            new Set(
                lessonIdsRaw
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
            ),
        );

        if (lessonIds.length === 0) {
            return NextResponse.json({ error: "Missing lesson_ids" }, {
                status: 400,
            });
        }

        const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: { user } } = await userClient.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: "Not authenticated" }, {
                status: 401,
            });
        }

        const adminClient = createClient(
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY,
        );

        // Load lessons + program_id + teacher_id
        const { data: lessons, error: lessonsErr } = await adminClient
            .from("lessons")
            .select("id, program_id, teacher_id")
            .in("id", lessonIds);
        if (lessonsErr) throw lessonsErr;

        const lessonsArr = lessons || [];
        if (lessonsArr.length !== lessonIds.length) {
            return NextResponse.json(
                { error: "One or more lessons not found" },
                { status: 404 },
            );
        }

        const programIds = Array.from(
            new Set(
                lessonsArr.map((l: any) => String(l.program_id)).filter(
                    Boolean,
                ),
            ),
        );
        const { data: programs, error: programsErr } = await adminClient
            .from("programs")
            .select("id, studio_id")
            .in("id", programIds);
        if (programsErr) throw programsErr;

        const programStudio = new Map<string, string>(
            (programs || []).map((
                p: any,
            ) => [String(p.id), String(p.studio_id)]),
        );
        const studioIds = Array.from(
            new Set(
                (programs || []).map((p: any) => String(p.studio_id)).filter(
                    Boolean,
                ),
            ),
        );

        // Admin studios (new + legacy)
        const [studioMembersRes, legacyRolesRes] = await Promise.all([
            adminClient
                .from("studio_members")
                .select("studio_id, role")
                .eq("user_id", user.id)
                .in("studio_id", studioIds)
                .in("role", ["owner", "admin"]),
            adminClient
                .from("user_roles")
                .select("studio_id, role")
                .eq("user_id", user.id)
                .in("studio_id", studioIds)
                .in("role", ["studio_admin", "admin"]),
        ]);

        const adminStudios = new Set<string>([
            ...((studioMembersRes.data || []).map((r: any) =>
                String(r.studio_id)
            )),
            ...((legacyRolesRes.data || []).map((r: any) =>
                String(r.studio_id)
            )),
        ]);

        // Teacher programs (support both tables)
        let teacherProgramIds = new Set<string>();
        try {
            const [programTeachersRes, teacherProgramsRes] = await Promise.all([
                adminClient
                    .from("program_teachers")
                    .select("program_id")
                    .eq("user_id", user.id)
                    .in("program_id", programIds),
                adminClient
                    .from("teacher_programs")
                    .select("program_id")
                    .eq("teacher_id", user.id)
                    .in("program_id", programIds),
            ]);

            teacherProgramIds = new Set<string>([
                ...((programTeachersRes.data || []).map((r: any) =>
                    String(r.program_id)
                )),
                ...((teacherProgramsRes.data || []).map((r: any) =>
                    String(r.program_id)
                )),
            ]);
        } catch {
            teacherProgramIds = new Set<string>();
        }

        // Permission check: must be studio admin or assigned teacher for each lesson
        for (const lesson of lessonsArr) {
            const programId = String(lesson.program_id || "");
            const studioId = programStudio.get(programId);
            if (!programId || !studioId) {
                return NextResponse.json({
                    error: "Lesson missing program/studio linkage",
                }, { status: 400 });
            }

            const isAdmin = adminStudios.has(String(studioId));
            const isTeacher = teacherProgramIds.has(programId) ||
                String(lesson.teacher_id || "") === String(user.id);
            if (!isAdmin && !isTeacher) {
                return NextResponse.json({
                    error: "Not allowed to view attendance for this lesson",
                }, { status: 403 });
            }
        }

        const { data: attendances, error: attendancesErr } = await adminClient
            .from("lesson_attendances")
            .select("lesson_id, user_id, enrollment_id, status")
            .in("lesson_id", lessonIds);
        if (attendancesErr) throw attendancesErr;

        return NextResponse.json({ attendances: attendances || [] });
    } catch (error) {
        console.error("GET /api/attendances error", error);
        const message = error instanceof Error
            ? error.message
            : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function getStudioAndProgramSettings(
    supabase: any,
    studioId: string,
    programId?: string | null,
) {
    const { data: studio } = await supabase
        .from("studio_evaluation_settings")
        .select("enabled, default_visibility, default_visible_from, method")
        .eq("studio_id", studioId)
        .maybeSingle();

    let program: any = null;
    if (programId) {
        try {
            program = (await supabase
                .from("program_evaluation_settings")
                .select(
                    "enabled, default_visibility, default_visible_from, method",
                )
                .eq("program_id", programId)
                .maybeSingle()).data;
        } catch {}
    }

    return { studio, program };
}

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

        const { searchParams } = new URL(req.url);
        const programId = searchParams.get("programId");
        const userId = searchParams.get("userId");
        const teacherId = searchParams.get("teacherId");
        const visible = searchParams.get("visible");

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { studioId } = await params;

        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await supabase.auth.getUser(token);

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, {
                status: 401,
            });
        }

        // Check if feature is enabled
        const { studio: studioSettings } = await getStudioAndProgramSettings(
            supabase,
            studioId,
            null,
        );

        if (!studioSettings?.enabled) {
            return NextResponse.json({
                error: "Evaluations feature is disabled",
            }, { status: 403 });
        }

        // Verify user is allowed to read: admin, studio member, or assigned teacher to program
        const { data: roleData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("studio_id", studioId)
            .maybeSingle();

        const { data: studioMember } = await supabase
            .from("studio_members")
            .select("id")
            .eq("user_id", user.id)
            .eq("studio_id", studioId)
            .maybeSingle();

        let isAssignedTeacher = false;
        if (programId) {
            const { data: programTeacher } = await supabase
                .from("program_teachers")
                .select("id")
                .eq("program_id", programId)
                .eq("user_id", user.id)
                .maybeSingle();
            const { data: lessonTeacher } = await supabase
                .from("lessons")
                .select("id")
                .eq("program_id", programId)
                .eq("teacher_id", user.id)
                .limit(1)
                .maybeSingle();
            isAssignedTeacher = !!programTeacher || !!lessonTeacher;
        }

        const isAdmin = roleData &&
            ["studio_admin", "admin"].includes(roleData.role);
        const isStudioMember = !!studioMember;

        if (!isAdmin && !isStudioMember && !isAssignedTeacher) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Base query: select raw evaluation rows only
        let query = supabase
            .from("evaluations")
            .select("*")
            .eq("studio_id", studioId)
            .eq("deleted", false)
            .order("created_at", { ascending: false });

        if (programId) query = query.eq("program_id", programId);
        if (userId) query = query.eq("user_id", userId);
        if (teacherId) query = query.eq("teacher_id", teacherId);
        if (visible === "true") {
            query = query.or(
                "visibility_status.eq.visible_immediate,and(visibility_status.eq.visible_on_date,visible_from.lte.now())",
            );
        }

        const { data, error } = await query;

        if (error) throw error;

        return NextResponse.json(data || []);
    } catch (error: any) {
        console.error("Error fetching evaluations:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(
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

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await supabase.auth.getUser(token);

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, {
                status: 401,
            });
        }

        // Check if feature is enabled
        const { studio: studioSettings, program: programSettings } =
            await getStudioAndProgramSettings(
                supabase,
                studioId,
                body.program_id,
            );

        if (!studioSettings?.enabled) {
            return NextResponse.json({
                error: "Evaluations feature is disabled",
            }, { status: 403 });
        }

        // Require evaluations to be explicitly enabled per program
        if (!programSettings?.enabled) {
            return NextResponse.json({
                error: "Evaluations are disabled for this program",
            }, { status: 403 });
        }

        // Verify user is teacher or admin
        const { data: roleData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("studio_id", studioId)
            .maybeSingle();

        const { data: studioMember } = await supabase
            .from("studio_members")
            .select("id")
            .eq("user_id", user.id)
            .eq("studio_id", studioId)
            .maybeSingle();

        // Also allow teachers assigned to this program (program_teachers) or lessons of the program
        let programTeacher = null as any;
        let lessonTeacher = null as any;
        try {
            programTeacher = (await supabase
                .from("program_teachers")
                .select("id")
                .eq("program_id", body.program_id)
                .eq("user_id", user.id)
                .maybeSingle()).data;
        } catch {}
        try {
            lessonTeacher = (await supabase
                .from("lessons")
                .select("id")
                .eq("program_id", body.program_id)
                .eq("teacher_id", user.id)
                .limit(1)
                .maybeSingle()).data;
        } catch {}

        const isAdmin = roleData &&
            ["studio_admin", "admin"].includes(roleData.role);
        const isStudioMember = !!studioMember;
        const isAssignedTeacher = !!programTeacher || !!lessonTeacher;

        if (!isAdmin && !isStudioMember && !isAssignedTeacher) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Fetch program title and user profile info to denormalize
        let programTitle: string | null = null;
        try {
            const { data: prog } = await supabase
                .from("programs")
                .select("title")
                .eq("id", body.program_id)
                .maybeSingle();
            programTitle = prog?.title || null;
        } catch {}

        let teacherName: string | null = null;
        let studentName: string | null = null;
        let studentEmail: string | null = null;
        // If visible_on_date default is configured and client didn't send a date, apply default (program overrides studio)
        let visibleFrom = body.visible_from ?? null;
        try {
            const dv = programSettings?.default_visibility ||
                studioSettings?.default_visibility ||
                "hidden";
            const dfrom = programSettings?.default_visible_from ||
                studioSettings?.default_visible_from ||
                null;
            if (!visibleFrom && dv === "visible_on_date") {
                visibleFrom = dfrom;
            }
        } catch {}

        // Determine scoring scale for this evaluation (store score_max where possible)
        const method = (programSettings?.method || studioSettings?.method ||
            "score") as string;
        let scoreMax: number | null = null;
        if (method === "score") scoreMax = 10;
        if (method === "percent") scoreMax = 100;

        // Validate numeric score if provided
        if (typeof body.score === "number") {
            if (method === "score" && (body.score < 1 || body.score > 10)) {
                return NextResponse.json({
                    error: "Score must be between 1 and 10",
                }, { status: 400 });
            }
            if (method === "percent" && (body.score < 0 || body.score > 100)) {
                return NextResponse.json({
                    error: "Score must be between 0 and 100",
                }, { status: 400 });
            }
        }
        try {
            const { data: teacherProfile } = await supabase
                .from("user_profiles")
                .select("first_name, last_name, email")
                .eq("user_id", user.id)
                .maybeSingle();
            teacherName = teacherProfile
                ? `${teacherProfile.first_name || ""} ${
                    teacherProfile.last_name || ""
                }`.trim()
                : null;
        } catch {}
        try {
            const { data: studentProfile } = await supabase
                .from("user_profiles")
                .select("first_name, last_name, email")
                .eq("user_id", body.user_id)
                .maybeSingle();
            studentName = studentProfile
                ? `${studentProfile.first_name || ""} ${
                    studentProfile.last_name || ""
                }`.trim()
                : null;
            studentEmail = studentProfile?.email || null;
        } catch {}

        // Create evaluation
        const { data, error } = await supabase
            .from("evaluations")
            .insert({
                studio_id: studioId,
                program_id: body.program_id,
                teacher_id: user.id,
                user_id: body.user_id,
                enrollment_id: body.enrollment_id ?? null,
                score: body.score,
                score_max: scoreMax,
                criteria: body.criteria || {},
                comment: body.comment,
                visibility_status: body.visibility_status || "hidden",
                visible_from: visibleFrom,
                program_title: programTitle,
                teacher_name: teacherName,
                student_name: studentName,
                student_email: studentEmail,
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json(data);
    } catch (error: any) {
        console.error("Error creating evaluation:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

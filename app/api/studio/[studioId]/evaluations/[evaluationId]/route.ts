import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ studioId: string; evaluationId: string }> },
) {
    try {
        const authHeader = req.headers.get("authorization");
        if (!authHeader) {
            return NextResponse.json({ error: "Unauthorized" }, {
                status: 401,
            });
        }

        const body = await req.json();
        const { studioId, evaluationId } = await params;

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await supabase.auth.getUser(token);

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, {
                status: 401,
            });
        }

        // Get existing evaluation
        const { data: existing } = await supabase
            .from("evaluations")
            .select("teacher_id, studio_id")
            .eq("id", evaluationId)
            .single();

        if (!existing || existing.studio_id !== studioId) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        // Check if user is admin or the teacher who created it
        const { data: roleData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("studio_id", studioId)
            .maybeSingle();

        const isAdmin = roleData &&
            ["studio_admin", "admin"].includes(roleData.role);
        const isOwner = existing.teacher_id === user.id;

        if (!isAdmin && !isOwner) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Update evaluation
        const { data, error } = await supabase
            .from("evaluations")
            .update({
                score: body.score,
                score_max: body.score_max ?? undefined,
                criteria: body.criteria,
                comment: body.comment,
                visibility_status: body.visibility_status,
                visible_from: body.visible_from,
                enrollment_id: body.enrollment_id ?? null,
                // keep denormalized fields up to date if payload includes them
                program_title: body.program_title ?? undefined,
                teacher_name: body.teacher_name ?? undefined,
                student_name: body.student_name ?? undefined,
                student_email: body.student_email ?? undefined,
                updated_at: new Date().toISOString(),
                edited_by: user.id,
            })
            .eq("id", evaluationId)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json(data);
    } catch (error: any) {
        console.error("Error updating evaluation:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ studioId: string; evaluationId: string }> },
) {
    try {
        const authHeader = req.headers.get("authorization");
        if (!authHeader) {
            return NextResponse.json({ error: "Unauthorized" }, {
                status: 401,
            });
        }

        const { studioId, evaluationId } = await params;

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await supabase.auth.getUser(token);

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, {
                status: 401,
            });
        }

        // Get existing evaluation
        const { data: existing } = await supabase
            .from("evaluations")
            .select("teacher_id, studio_id")
            .eq("id", evaluationId)
            .single();

        if (!existing || existing.studio_id !== studioId) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        // Check if user is admin or the teacher who created it
        const { data: roleData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("studio_id", studioId)
            .maybeSingle();

        const isAdmin = roleData &&
            ["studio_admin", "admin"].includes(roleData.role);
        const isOwner = existing.teacher_id === user.id;

        if (!isAdmin && !isOwner) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Soft delete
        const { error } = await supabase
            .from("evaluations")
            .update({
                deleted: true,
                updated_at: new Date().toISOString(),
            })
            .eq("id", evaluationId);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Error deleting evaluation:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

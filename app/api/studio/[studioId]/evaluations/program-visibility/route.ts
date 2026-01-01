import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function PATCH(
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
        const { studioId } = await params;
        const body = await req.json();
        const { program_id, visibility } = body as {
            program_id: string;
            visibility: "hidden" | "visible_immediate";
        };

        if (
            !program_id || !["hidden", "visible_immediate"].includes(visibility)
        ) {
            return NextResponse.json({ error: "Invalid payload" }, {
                status: 400,
            });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await supabase.auth.getUser(token);
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, {
                status: 401,
            });
        }

        // Only studio admins can batch toggle visibility
        const { data: roleData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("studio_id", studioId)
            .maybeSingle();

        const isAdmin = roleData &&
            ["studio_admin", "admin"].includes(roleData.role);
        if (!isAdmin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { error } = await supabase
            .from("evaluations")
            .update({ visibility_status: visibility })
            .eq("studio_id", studioId)
            .eq("program_id", program_id)
            .eq("deleted", false);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error("program-visibility PATCH error", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

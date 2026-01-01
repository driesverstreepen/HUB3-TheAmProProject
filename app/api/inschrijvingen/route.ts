import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Helper to create Supabase client with cookies for server-side auth
async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    },
  );
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const { data, error } = await supabase
      .from("inschrijvingen")
      .insert(body)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ inschrijving: data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");
    const programId = searchParams.get("program_id");

    // If programId is provided, check teacher/admin access and return enrollments
    if (programId) {
      const { data: { user }, error: authError } = await supabase.auth
        .getUser();

      console.log("🔐 API Auth check:", {
        user: user?.id,
        authError,
        programId,
      });

      if (!user) {
        console.error("❌ No user found in session");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      // Get program to check studio_id
      const { data: program, error: programError } = await supabase
        .from("programs")
        .select("studio_id")
        .eq("id", programId)
        .single();

      console.log("📋 Program fetch:", { program, programError });

      if (!program) {
        return NextResponse.json({ error: "Program not found" }, {
          status: 404,
        });
      }

      // Check if user is teacher for this program or studio admin
      const [teacherCheck, adminCheck] = await Promise.all([
        supabase
          .from("teacher_programs")
          .select("id")
          .eq("program_id", programId)
          .eq("teacher_id", user.id)
          .maybeSingle(),
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("studio_id", program.studio_id)
          .eq("role", "studio_admin")
          .maybeSingle(),
      ]);

      console.log("🔍 Access check:", {
        teacherCheck: !!teacherCheck.data,
        adminCheck: !!adminCheck.data,
        teacherError: teacherCheck.error,
        adminError: adminCheck.error,
      });

      const hasAccess = !!teacherCheck.data || !!adminCheck.data;

      if (!hasAccess) {
        console.error("❌ Access denied for user:", user.id);
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }

      // Fetch enrollments with elevated privileges (service role bypasses RLS)
      const { data: enrollments, error } = await supabase
        .from("inschrijvingen")
        .select("id, user_id, status, sub_profile_id, profile_snapshot")
        .eq("program_id", programId);

      console.log("📊 Enrollments fetch:", {
        count: enrollments?.length,
        error,
      });

      if (error) throw error;

      return NextResponse.json({ enrollments });
    }

    // Original logic for user_id query
    let query = supabase
      .from("inschrijvingen")
      .select("*, program:programs(*), user:users(*)");

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ inschrijvingen: data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }
}

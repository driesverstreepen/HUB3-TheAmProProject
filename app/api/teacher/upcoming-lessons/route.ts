import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const teacherId = searchParams.get("teacherId");
    if (!teacherId) {
      return NextResponse.json({ error: "teacherId is required" }, {
        status: 400,
      });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "Supabase env not configured" }, {
        status: 500,
      });
    }

    // Verify the requester is the same teacher using server-side auth tied to cookies
    const cookieStore = await cookies();
    const serverClient = createServerClient(
      supabaseUrl,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: any) {
            cookieStore.set({ name, value: "", ...options });
          },
        },
      },
    );
    const { data: { session } } = await serverClient.auth.getSession();
    const uid = session?.user?.id;
    if (!uid || uid !== teacherId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Use service role to bypass RLS but scoped strictly to this teacherId
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString().split("T")[0];

    const { data: lessons, error } = await admin
      .from("lessons")
      .select(`
        id,
        date,
        time,
        duration_minutes,
        program_id,
        teacher_id,
        programs (
          id,
          title,
          dance_style,
          program_type,
          studio_id,
          studios (naam)
        )
      `)
      .eq("teacher_id", teacherId)
      .gte("date", todayISO)
      .order("date", { ascending: true })
      .order("time", { ascending: true })
      .limit(10);

    if (error) {
      return NextResponse.json({
        error: "Query failed",
        details: error.message,
      }, { status: 500 });
    }

    return NextResponse.json({ lessons });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

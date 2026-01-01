import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  createSupabaseServiceClient,
  supabaseAnonKey,
  supabaseUrl,
} from "@/lib/supabase";

function getUserClient(request: NextRequest) {
  const cookie = request.headers.get("cookie") || "";
  const authorization = request.headers.get("authorization") || "";

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase not configured");
  }

  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (authorization) headers.Authorization = authorization;

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers },
  });
}

async function requireSuperAdmin(request: NextRequest) {
  const userClient = getUserClient(request);
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: roleRow } = await userClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "super_admin")
    .maybeSingle();

  if (!roleRow) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const, userId: user.id };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return auth.response;

    const admin = createSupabaseServiceClient();

    const [{ count: usersCount }, { count: studiosCount }, { count: programsCount }, { count: consentsCount }] =
      await Promise.all([
        admin
          .from("user_profiles")
          .select("user_id", { count: "exact", head: true })
          .is("deleted_at", null),
        admin.from("studios").select("id", { count: "exact", head: true }),
        admin.from("programs").select("id", { count: "exact", head: true }),
        admin
          .from("user_consents")
          .select("id", { count: "exact", head: true }),
      ]);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { count: recentCount } = await admin
      .from("user_profiles")
      .select("user_id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("created_at", sevenDaysAgo.toISOString());

    return NextResponse.json({
      stats: {
        total_users: usersCount || 0,
        total_studios: studiosCount || 0,
        total_programs: programsCount || 0,
        total_consents: consentsCount || 0,
        recent_registrations: recentCount || 0,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 },
    );
  }
}

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

type PromoCardInterface = "user" | "studio";

function isValidInterface(value: any): value is PromoCardInterface {
  return value === "user" || value === "studio";
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({} as any));

    const iface = body?.interface;
    if (!isValidInterface(iface)) {
      return NextResponse.json({ error: "Invalid interface" }, { status: 400 });
    }

    const is_visible = Boolean(body?.is_visible);
    const title = String(body?.title ?? "");
    const description = String(body?.description ?? "");
    const button_label_raw = body?.button_label;
    const button_href_raw = body?.button_href;

    const button_label =
      typeof button_label_raw === "string" && button_label_raw.trim().length > 0
        ? button_label_raw.trim()
        : null;

    const button_href =
      typeof button_href_raw === "string" && button_href_raw.trim().length > 0
        ? button_href_raw.trim()
        : null;

    const admin = createSupabaseServiceClient();

    const { data, error } = await admin
      .from("promo_cards")
      .upsert(
        {
          interface: iface,
          is_visible,
          title,
          description,
          button_label,
          button_href,
          updated_at: new Date().toISOString(),
          updated_by: auth.userId,
        },
        { onConflict: "interface" },
      )
      .select("interface,is_visible,title,description,button_label,button_href")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ card: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 },
    );
  }
}

import type { SupabaseClient } from "@supabase/supabase-js";

export type AppRole =
    | "super_admin"
    | "studio_owner"
    | "studio_admin"
    | "teacher"
    | "user";

export async function getPrimaryRole(
    supabase: SupabaseClient,
    userId: string,
): Promise<AppRole> {
    // Prefer user_roles as source of truth; fall back to users.role if needed.
    const rolesResp = await supabase.from("user_roles").select("role").eq(
        "user_id",
        userId,
    );

    if (!rolesResp.error) {
        const role = (rolesResp.data?.[0] as any)?.role as AppRole | undefined;
        if (role) return role;
    }

    const userResp = await supabase.from("users").select("role").eq(
        "id",
        userId,
    ).maybeSingle();
    const fallback = (userResp.data as any)?.role as AppRole | undefined;
    return fallback || "user";
}

export async function getOwnerStudioId(
    supabase: SupabaseClient,
    userId: string,
): Promise<string | null> {
    const resp = await supabase
        .from("studios")
        .select("id")
        .eq("eigenaar_id", userId)
        .maybeSingle();

    if (resp.error) return null;
    return resp.data?.id ?? null;
}

export async function getPostLoginRedirectPath(
    supabase: SupabaseClient,
    userId: string,
): Promise<string> {
    const role = await getPrimaryRole(supabase, userId);
    if (role === "super_admin") return "/super-admin";

    const ownerStudioId = await getOwnerStudioId(supabase, userId);
    if (ownerStudioId) return `/studio/${ownerStudioId}`;

    // teacher behaves the same as user (and studio_admin is not special for routing)
    return "/dashboard";
}

import type { SupabaseClient } from "@supabase/supabase-js";

type EqFilters = Record<string, any>;

export async function safeSelect(
  client: SupabaseClient,
  table: string,
  select = "*",
  eqs?: EqFilters,
) {
  try {
    let q: any = client.from(table).select(select);
    if (eps(eqs)) {
      Object.entries(eqs!).forEach(([k, v]) => {
        q = q.eq(k, v);
      });
    }
    const res = await q;
    if (res.error) {
      // PostgREST missing table: PGRST205
      if (res.error.code === "PGRST205") {
        return { data: null, missingTable: true };
      }
      return { data: null, error: res.error };
    }
    return { data: res.data };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function safeInsert(
  client: SupabaseClient,
  table: string,
  payload: any,
) {
  try {
    const res = await client.from(table).insert(payload);
    if (res.error) {
      if (res.error.code === "PGRST205") {
        return { success: false, missingTable: true };
      }
      return { success: false, error: res.error };
    }
    return { success: true, data: res.data };
  } catch (err) {
    return { success: false, error: err };
  }
}

export async function safeUpdate(
  client: SupabaseClient,
  table: string,
  payload: any,
  eqs: EqFilters,
) {
  try {
    let q: any = client.from(table).update(payload);
    Object.entries(eqs).forEach(([k, v]) => {
      q = q.eq(k, v);
    });
    const res = await q;
    if (res.error) {
      if (res.error.code === "PGRST205") {
        return { success: false, missingTable: true };
      }
      return { success: false, error: res.error };
    }
    return { success: true, data: res.data };
  } catch (err) {
    return { success: false, error: err };
  }
}

export async function safeDelete(
  client: SupabaseClient,
  table: string,
  eqs: EqFilters,
) {
  try {
    let q: any = client.from(table).delete();
    Object.entries(eqs).forEach(([k, v]) => {
      q = q.eq(k, v);
    });
    const res = await q;
    if (res.error) {
      if (res.error.code === "PGRST205") {
        return { success: false, missingTable: true };
      }
      return { success: false, error: res.error };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err };
  }
}

function eps(obj?: any) {
  return obj && Object.keys(obj).length > 0;
}

/**
 * Check if a user has access to a studio (either as owner or admin)
 * @param client Supabase client
 * @param studioId Studio ID to check access for
 * @param userId User ID to check (defaults to current auth user)
 * @returns Object with hasAccess boolean and role if access granted
 */
export async function checkStudioAccess(
  client: SupabaseClient,
  studioId: string,
  userId?: string,
): Promise<{
  hasAccess: boolean;
  role?: "owner" | "admin" | "bookkeeper" | "comms" | "viewer" | string;
  error?: any;
}> {
  try {
    // If no userId provided, get current auth user
    if (!userId) {
      const { data: { user } } = await client.auth.getUser();
      if (!user) return { hasAccess: false };
      userId = user.id;
    }

    // Check studio_members table
    const { data, error } = await client
      .from("studio_members")
      .select("role")
      .eq("studio_id", studioId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Error checking studio access:", error);
      return { hasAccess: false, error };
    }

    if (!data) {
      return { hasAccess: false };
    }

    return {
      hasAccess: true,
      role: data.role as "owner" | "admin" | "bookkeeper" | "comms" | "viewer" | string,
    };
  } catch (err) {
    console.error("Exception checking studio access:", err);
    return { hasAccess: false, error: err };
  }
}

export async function checkStudioPermission(
  client: SupabaseClient,
  studioId: string,
  userId: string,
  permissionKey: string,
  opts?: { requireWrite?: boolean },
): Promise<{ allowed: boolean; role?: string; error?: any }> {
  try {
    // Owners always allowed.
    const { data: ownerRow, error: ownerErr } = await client
      .from('studios')
      .select('id')
      .eq('id', studioId)
      .eq('eigenaar_id', userId)
      .maybeSingle();

    if (ownerErr) {
      return { allowed: false, error: ownerErr };
    }
    if (ownerRow) {
      return { allowed: true, role: 'owner' };
    }

    const { data: memberRow, error: memberErr } = await client
      .from('studio_members')
      .select('role')
      .eq('studio_id', studioId)
      .eq('user_id', userId)
      .maybeSingle();

    if (memberErr) {
      return { allowed: false, error: memberErr };
    }

    const role = (memberRow as any)?.role as string | undefined;
    if (!role) return { allowed: false };
    if (role === 'owner') return { allowed: true, role };

    // Viewer is read-only: can view pages if permitted, but may never write.
    if (opts?.requireWrite && role === 'viewer') {
      return { allowed: false, role };
    }

    // Conservative fallback: admins are allowed if not configured yet.
    const { data: permRow, error: permErr } = await client
      .from('studio_role_permissions')
      .select('permissions')
      .eq('studio_id', studioId)
      .eq('role', role)
      .maybeSingle();

    if (permErr) {
      return { allowed: false, role, error: permErr };
    }

    const permissions = ((permRow as any)?.permissions || {}) as Record<string, any>;
    const allowed = role === 'admin'
      ? (permissions?.[permissionKey] ?? true) === true
      : permissions?.[permissionKey] === true;

    return { allowed, role };
  } catch (err) {
    console.error('Exception checking studio permission:', err);
    return { allowed: false, error: err };
  }
}

/**
 * Get all studios a user has access to
 * @param client Supabase client
 * @param userId User ID (defaults to current auth user)
 * @returns Array of studios with role information
 */
export async function getUserStudios(
  client: SupabaseClient,
  userId?: string,
): Promise<{ data: any[] | null; error?: any }> {
  try {
    if (!userId) {
      const { data: { user } } = await client.auth.getUser();
      if (!user) return { data: null };
      userId = user.id;
    }

    const { data: memberRows, error: memberErr } = await client
      .from("studio_members")
      .select("studio_id, role, studios(id, naam, eigenaar_id)")
      .eq("user_id", userId);

    if (memberErr) {
      console.error("Error fetching user studios:", memberErr);
      return { data: null, error: memberErr };
    }

    // Owners are not always present in studio_members. Include studios where user is eigenaar.
    const { data: ownerStudios, error: ownerErr } = await client
      .from("studios")
      .select("id, naam, eigenaar_id")
      .eq("eigenaar_id", userId);

    if (ownerErr) {
      // Do not hard-fail; membership rows might still be enough.
      console.warn("Error fetching owner studios:", ownerErr);
    }

    const merged: any[] = [];
    const seen = new Set<string>();

    for (const r of (memberRows || []) as any[]) {
      const studioId = String(r?.studio_id || r?.studios?.id || "");
      if (!studioId) continue;
      if (seen.has(studioId)) continue;
      seen.add(studioId);
      merged.push(r);
    }

    for (const s of (ownerStudios || []) as any[]) {
      const studioId = String(s?.id || "");
      if (!studioId) continue;
      if (seen.has(studioId)) continue;
      seen.add(studioId);
      merged.push({
        studio_id: studioId,
        role: "owner",
        studios: s,
      });
    }

    return { data: merged };
  } catch (err) {
    console.error("Exception fetching user studios:", err);
    return { data: null, error: err };
  }
}

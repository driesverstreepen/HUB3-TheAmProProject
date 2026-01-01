import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
export const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
const resolvedServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

// Client voor gebruik in client components
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

// Client voor gebruik in server-side code (API routes, etc.)
export const createSupabaseClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase environment variables are not set");
  }
  return createClient(supabaseUrl, supabaseAnonKey);
};

// Service-role client (server-side only) for endpoints that must read public data
// even when RLS policies are restrictive.
export const createSupabaseServiceClient = () => {
  const serviceKey = resolvedServiceKey;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase service role environment variables are not set");
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
};

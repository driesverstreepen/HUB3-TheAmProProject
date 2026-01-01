import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export type AppMode = "hub3" | "ampro";

export const appMode: AppMode =
  ((process.env.NEXT_PUBLIC_APP_MODE || process.env.APP_MODE || "hub3") as string)
    .trim()
    .toLowerCase() === "ampro"
    ? "ampro"
    : "hub3";

const resolveSupabaseConfig = () => {
  if (appMode === "ampro") {
    return {
      url: process.env.NEXT_PUBLIC_AMPRO_SUPABASE_URL || "",
      anonKey: process.env.NEXT_PUBLIC_AMPRO_SUPABASE_ANON_KEY || "",
      serviceKey: process.env.AMPRO_SUPABASE_SERVICE_ROLE_KEY || "",
    };
  }

  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  };
};

const { url: resolvedUrl, anonKey: resolvedAnonKey, serviceKey: resolvedServiceKey } =
  resolveSupabaseConfig();

export const supabaseUrl = resolvedUrl;
export const supabaseAnonKey = resolvedAnonKey;

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

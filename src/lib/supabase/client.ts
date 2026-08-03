import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ConfigurationError } from "@/lib/data/errors";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

export const isSupabaseConfigured = Boolean(
  url && key && !url.includes("your-project") && !key.includes("your-"),
);

let browserClient: SupabaseClient | null = null;

/** Return the singleton browser client with explicit callback handling. */
export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) throw new ConfigurationError();
  browserClient ??= createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });
  return browserClient;
}

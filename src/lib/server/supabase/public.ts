import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseEnv } from "@/lib/server/env";

let client: SupabaseClient | undefined;

/**
 * Anonymous client with no user session: for public data only (host resolution, published
 * hostel content). Row level security applies as the `anon` role. Safe in the proxy.
 */
export function getPublicSupabaseClient(): SupabaseClient {
  if (!client) {
    const { url, anonKey } = getPublicSupabaseEnv();
    client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}

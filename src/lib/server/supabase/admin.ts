import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseEnv } from "@/lib/server/env";

/**
 * SERVICE ROLE client: bypasses row level security. Restricted by ESLint and by
 * tests/unit/service-role-allowlist.test.ts to the modules listed in SERVICE_ROLE_ALLOWLIST
 * (eslint.config.mjs): payment webhooks, cron jobs, booking lookup, tenant provisioning and public-image uploads.
 * Never import this from request paths that act on behalf of a user.
 */
let client: SupabaseClient | undefined;

export function getServiceRoleClient(): SupabaseClient {
  if (!client) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set (server-only environment variable).");
    }
    const { url } = getPublicSupabaseEnv();
    client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}

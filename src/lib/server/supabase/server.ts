import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getPublicSupabaseEnv } from "@/lib/server/env";

/**
 * Client acting as the signed-in user (session from cookies). Every query runs under row level
 * security with the user's JWT. This is the default client for Server Components and Actions.
 */
export async function createSupabaseServerClient() {
  // A session client is always request-time. connection() also covers Next's validation pass, which
  // can supply cookies and would otherwise flag the auth library's Date.now() as prerendered.
  await connection();
  const cookieStore = await cookies();
  const { url, anonKey } = getPublicSupabaseEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies; the proxy refreshes the session instead (task 6).
        }
      },
    },
  });
}

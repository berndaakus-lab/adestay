import type { NextRequest } from "next/server";
import { getAppHosts, isSupabaseConfigured } from "@/lib/server/env";
import { nextWithSessionRefresh } from "@/lib/server/supabase/proxy-session";
import { handleProxyRequest } from "@/lib/server/tenant/proxy-handler";
import { resolveTenantByHost } from "@/lib/server/tenant/resolve";

// Next.js 16 "proxy" (formerly middleware). Runs on the Node.js runtime before every page.
export async function proxy(request: NextRequest) {
  return handleProxyRequest(request, {
    appHosts: getAppHosts(),
    resolveTenant: resolveTenantByHost,
    supabaseConfigured: isSupabaseConfigured(),
    // Refresh the Supabase session cookies when Supabase is configured.
    next: isSupabaseConfigured() ? nextWithSessionRefresh : undefined,
  });
}

export const config = {
  // Skip Next.js internals and static files (anything with a file extension).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};

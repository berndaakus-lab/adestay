import type { NextRequest } from "next/server";
import { getAppHost, isSupabaseConfigured } from "@/lib/server/env";
import { handleProxyRequest } from "@/lib/server/tenant/proxy-handler";
import { resolveTenantByHost } from "@/lib/server/tenant/resolve";

// Next.js 16 "proxy" (formerly middleware). Runs on the Node.js runtime before every page.
export async function proxy(request: NextRequest) {
  return handleProxyRequest(request, {
    appHost: getAppHost(),
    resolveTenant: resolveTenantByHost,
    supabaseConfigured: isSupabaseConfigured(),
  });
}

export const config = {
  // Skip Next.js internals and static files (anything with a file extension).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};

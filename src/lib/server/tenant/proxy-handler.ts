import { NextResponse, type NextRequest } from "next/server";
import {
  classifyHost,
  HEADER_SURFACE,
  HEADER_TENANT_ID,
  HEADER_TENANT_SLUG,
  HEADER_TENANT_STATUS,
  INTERNAL_HEADER_PREFIX,
  normalizeHost,
} from "@/lib/hosts";
import type { ResolvedTenant } from "./resolve";

export interface ProxyDeps {
  appHost: string;
  resolveTenant: (host: string) => Promise<ResolvedTenant | null>;
  supabaseConfigured: boolean;
}

/**
 * Request routing by host (docs/SYSTEM_ARCHITECTURE.md §4, ADR-0005):
 * 1. strip any inbound internal headers, so a client can never inject a tenant;
 * 2. app host -> staff/platform surface;
 * 3. any other host must be a verified tenant domain, otherwise 404.
 * The headers are a routing hint only: server code re-resolves before using them.
 */
export async function handleProxyRequest(request: NextRequest, deps: ProxyDeps): Promise<NextResponse> {
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) {
    if (name.startsWith(INTERNAL_HEADER_PREFIX) || name.startsWith("x-tenant-")) headers.delete(name);
  }

  const host = normalizeHost(request.headers.get("host"));
  if (!host) return new NextResponse("Bad request", { status: 400 });

  if (classifyHost(host, { appHost: deps.appHost }) === "app") {
    headers.set(HEADER_SURFACE, "app");
    return NextResponse.next({ request: { headers } });
  }

  if (!deps.supabaseConfigured) {
    return new NextResponse("Hostel websites are unavailable: Supabase is not configured.", { status: 503 });
  }

  const tenant = await deps.resolveTenant(host);
  // Onboarding tenants are not public yet; archived ones never resolve.
  if (!tenant || tenant.status === "onboarding") {
    return new NextResponse("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  }

  headers.set(HEADER_SURFACE, "tenant");
  headers.set(HEADER_TENANT_ID, tenant.id);
  headers.set(HEADER_TENANT_SLUG, tenant.slug);
  headers.set(HEADER_TENANT_STATUS, tenant.status);
  return NextResponse.next({ request: { headers } });
}

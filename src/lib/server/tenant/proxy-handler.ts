import { NextResponse, type NextRequest } from "next/server";
import {
  classifyHost,
  HEADER_SURFACE,
  HEADER_TENANT_ID,
  HEADER_TENANT_SLUG,
  HEADER_TENANT_STATUS,
  INTERNAL_HEADER_PREFIX,
  isPathOnSurface,
  normalizeHost,
  SITES_PREFIX,
} from "@/lib/hosts";
import type { ResolvedTenant } from "./resolve";

/** Continues the request (optionally rewritten); the real proxy also refreshes the auth session. */
export type ContinueRequest = (request: NextRequest, headers: Headers, rewriteTo?: URL) => Promise<NextResponse>;

export interface ProxyDeps {
  appHosts: readonly string[];
  resolveTenant: (host: string) => Promise<ResolvedTenant | null>;
  supabaseConfigured: boolean;
  /** Allow /sites/{slug} on the app host to preview hostel sites. Never true in production. */
  tenantPreview: boolean;
  next?: ContinueRequest;
}

/** Response that forwards the sanitised request headers (and rewrites when a target is given). */
export function buildContinueResponse(headers: Headers, rewriteTo?: URL): NextResponse {
  return rewriteTo ? NextResponse.rewrite(rewriteTo, { request: { headers } }) : NextResponse.next({ request: { headers } });
}

export const continueRequest: ContinueRequest = async (_request, headers, rewriteTo) => buildContinueResponse(headers, rewriteTo);

const isUnder = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/**
 * Request routing by host (docs/SYSTEM_ARCHITECTURE.md §4, ADR-0005):
 * 1. strip any inbound internal headers, so a client can never inject a tenant;
 * 2. app host -> staff/platform surface (plus /sites previews outside production);
 * 3. any other host must be a verified tenant domain (otherwise the "hostel not found" page) and is
 *    rewritten internally to /sites/{slug}/... so public pages have their own route tree.
 * The headers are a routing hint only: server code re-resolves before using them.
 */
export async function handleProxyRequest(request: NextRequest, deps: ProxyDeps): Promise<NextResponse> {
  const next = deps.next ?? continueRequest;
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) {
    if (name.startsWith(INTERNAL_HEADER_PREFIX) || name.startsWith("x-tenant-")) headers.delete(name);
  }

  const host = normalizeHost(request.headers.get("host"));
  if (!host) return new NextResponse("Bad request", { status: 400 });

  const { pathname, search } = request.nextUrl;
  // 404s must never be cached: a host can become a live hostel domain later.
  const noStore = { "cache-control": "private, no-store" };
  const notFound = () => NextResponse.rewrite(new URL("/not-found-page", request.url), { status: 404, headers: noStore });

  if (classifyHost(host, { appHosts: deps.appHosts }) === "app") {
    if (!isPathOnSurface(pathname, "app")) return notFound();
    if (isUnder(pathname, SITES_PREFIX) && !deps.tenantPreview) return notFound();
    headers.set(HEADER_SURFACE, "app");
    return next(request, headers);
  }

  if (!deps.supabaseConfigured) {
    return new NextResponse("Hostel websites are unavailable: Supabase is not configured.", { status: 503 });
  }

  const tenant = await deps.resolveTenant(host);
  // Onboarding tenants are not public yet; archived ones never resolve.
  if (!tenant || tenant.status === "onboarding") {
    return NextResponse.rewrite(new URL("/hostel-not-found", request.url), { status: 404, headers: noStore });
  }
  if (!isPathOnSurface(pathname, "tenant") || isUnder(pathname, SITES_PREFIX)) return notFound();

  headers.set(HEADER_SURFACE, "tenant");
  headers.set(HEADER_TENANT_ID, tenant.id);
  headers.set(HEADER_TENANT_SLUG, tenant.slug);
  headers.set(HEADER_TENANT_STATUS, tenant.status);
  const target = new URL(`${SITES_PREFIX}/${tenant.slug}${pathname === "/" ? "" : pathname}${search}`, request.url);
  return next(request, headers, target);
}

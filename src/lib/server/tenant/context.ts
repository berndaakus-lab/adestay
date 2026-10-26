import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { classifyHost, normalizeHost } from "@/lib/hosts";
import { getAppHost } from "@/lib/server/env";
import { resolveTenantByHost, type ResolvedTenant } from "./resolve";

export type TenantContext =
  | { surface: "app"; host: string }
  | { surface: "tenant"; host: string; tenant: ResolvedTenant }
  | { surface: "unknown"; host: string | null };

/**
 * Which surface and tenant this request is for, resolved from the Host header on the server.
 * Deliberately ignores the proxy's x-adestay-* hint headers and any client-supplied tenant id:
 * it re-resolves the host itself (ADR-0005 rule 2.4). Cached for the duration of one request.
 */
export const getTenantContext = cache(async (): Promise<TenantContext> => {
  const host = normalizeHost((await headers()).get("host"));
  if (!host) return { surface: "unknown", host: null };
  if (classifyHost(host, { appHost: getAppHost() }) === "app") return { surface: "app", host };

  const tenant = await resolveTenantByHost(host);
  if (!tenant || tenant.status === "onboarding") return { surface: "unknown", host };
  return { surface: "tenant", host, tenant };
});

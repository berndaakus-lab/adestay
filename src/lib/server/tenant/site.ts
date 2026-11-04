import "server-only";
import { cache } from "react";
import { isTenantPreviewEnabled } from "@/lib/server/env";
import { getTenantContext } from "./context";
import { resolveTenantBySlug, type ResolvedTenant } from "./resolve";

/**
 * The hostel a /sites/{slug}/... page is serving.
 * - "host": the request came on the hostel's own domain (the proxy rewrote it); the host must
 *   resolve to this same slug, so a slug in the URL can never select a different tenant.
 * - "preview": the app host outside production (staging previews, see isTenantPreviewEnabled).
 * Returns null when the page must 404. Tenant context selects public content only: private data
 * is still protected by membership/ownership checks and row level security.
 */
export interface SiteTenant {
  tenant: ResolvedTenant;
  mode: "host" | "preview";
  /** Prefix for links inside the site: "" on the hostel's domain, "/sites/{slug}" in preview. */
  basePath: string;
}

export const getSiteTenant = cache(async (slug: string): Promise<SiteTenant | null> => {
  const ctx = await getTenantContext();
  if (ctx.surface === "tenant") {
    return ctx.tenant.slug === slug ? { tenant: ctx.tenant, mode: "host", basePath: "" } : null;
  }
  if (ctx.surface === "app" && isTenantPreviewEnabled()) {
    const tenant = await resolveTenantBySlug(slug);
    if (!tenant || tenant.status === "onboarding") return null;
    return { tenant, mode: "preview", basePath: `/sites/${tenant.slug}` };
  }
  return null;
});

/** Link to a path inside the hostel site, correct on its own domain and in preview. */
export function sitePath(site: Pick<SiteTenant, "basePath">, path: string): string {
  if (!site.basePath) return path;
  return path === "/" ? site.basePath : `${site.basePath}${path}`;
}

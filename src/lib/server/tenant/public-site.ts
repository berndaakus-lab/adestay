import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";
import { isTenantPreviewEnabled } from "@/lib/server/env";
import { PUBLIC_CACHE_LIFE, publicCacheEnabled, publicSiteTag } from "./public-cache";
import { resolveTenantBySlug, type ResolvedTenant } from "./resolve";
import type { SiteTenant } from "./site";

async function cachedTenantBySlug(slug: string): Promise<ResolvedTenant | null> {
  "use cache";
  cacheLife(PUBLIC_CACHE_LIFE);
  cacheTag(`public-slug:${slug}`);
  const tenant = await resolveTenantBySlug(slug);
  // Tagged with the hostel too, so suspending or restoring it clears this entry at once.
  if (tenant) cacheTag(publicSiteTag(tenant.id));
  return tenant;
}

/**
 * The hostel a public page is serving, from the internal route /site/{mode}/{slug}. Only the proxy
 * can produce that path (src/lib/server/tenant/proxy-handler.ts): "live" after it has matched a
 * verified domain to this slug, "preview" for /sites/{slug} on the app host outside production.
 * It reads no request headers or cookies, so public pages can be rendered once and stored.
 *
 * It selects PUBLIC content only. Anything private (sessions, bookings, lookups, the student
 * portal) must keep using getSiteTenant, which re-checks the real host on every request.
 */
export const getPublicSite = cache(async (mode: string, slug: string): Promise<SiteTenant | null> => {
  if (mode !== "live" && mode !== "preview") return null;
  if (mode === "preview" && !isTenantPreviewEnabled()) return null;
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return null;
  const tenant = publicCacheEnabled() ? await cachedTenantBySlug(slug) : await resolveTenantBySlug(slug);
  if (!tenant || tenant.status === "onboarding") return null;
  return mode === "live" ? { tenant, mode: "host", basePath: "" } : { tenant, mode: "preview", basePath: `/sites/${tenant.slug}` };
});

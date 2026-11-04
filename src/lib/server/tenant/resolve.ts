import { normalizeHost } from "@/lib/hosts";

export type TenantStatus = "onboarding" | "active" | "suspended" | "archived";

export interface ResolvedTenant {
  id: string;
  slug: string;
  status: TenantStatus;
}

/** Looks a normalised host up in the database. Injected so tests need no network. */
export type HostLookup = (host: string) => Promise<ResolvedTenant | null>;

const POSITIVE_TTL_MS = 60_000;
const NEGATIVE_TTL_MS = 15_000;
const MAX_ENTRIES = 1_000;

interface CacheEntry {
  value: ResolvedTenant | null;
  expiresAt: number;
}

/**
 * Host -> tenant with a short in-memory cache (ADR-0005: about 60 s). Unknown hosts are cached
 * briefly too, so random Host headers cannot hammer the database. Best effort only: each server
 * instance has its own cache, and correctness never depends on it.
 */
export function createTenantResolver(lookup: HostLookup, now: () => number = Date.now) {
  const cache = new Map<string, CacheEntry>();

  return async function resolveTenant(rawHost: string | null | undefined): Promise<ResolvedTenant | null> {
    const host = normalizeHost(rawHost);
    if (!host) return null;

    const hit = cache.get(host);
    if (hit && hit.expiresAt > now()) return hit.value;

    const value = await lookup(host);
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
    cache.set(host, { value, expiresAt: now() + (value ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS) });
    return value;
  };
}

/** Default lookup through public.resolve_tenant_by_host as the anonymous role. */
export const supabaseHostLookup: HostLookup = async (host) => {
  const { getPublicSupabaseClient } = await import("@/lib/server/supabase/public");
  const { data, error } = await getPublicSupabaseClient()
    .rpc("resolve_tenant_by_host", { p_host: host })
    .maybeSingle<{ tenant_id: string; slug: string; status: TenantStatus }>();
  if (error) throw new Error(`Tenant lookup failed: ${error.message}`);
  return data ? { id: data.tenant_id, slug: data.slug, status: data.status } : null;
};

export const resolveTenantByHost = createTenantResolver(supabaseHostLookup);

/** Slug -> tenant through public.resolve_tenant_by_slug (anonymous; public facts only). */
export async function resolveTenantBySlug(slug: string): Promise<ResolvedTenant | null> {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return null;
  const { getPublicSupabaseClient } = await import("@/lib/server/supabase/public");
  const { data, error } = await getPublicSupabaseClient()
    .rpc("resolve_tenant_by_slug", { p_slug: slug })
    .maybeSingle<{ tenant_id: string; slug: string; status: TenantStatus }>();
  if (error) throw new Error(`Tenant lookup failed: ${error.message}`);
  return data ? { id: data.tenant_id, slug: data.slug, status: data.status } : null;
}

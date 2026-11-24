/**
 * Host handling shared by the proxy and server code (docs/adr/0005-domain-resolution.md).
 * Pure functions only: no environment access, no I/O.
 */

/** Lowercase, no port, no trailing dot. Returns null for an empty or malformed host. */
export function normalizeHost(rawHost: string | null | undefined): string | null {
  if (!rawHost) return null;
  let host = rawHost.trim().toLowerCase();
  // IPv6 literal "[::1]:3000" -> "[::1]"; otherwise strip ":port".
  host = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  host = host.replace(/\.+$/, "");
  if (!host || host.length > 253 || !/^[a-z0-9.\-[\]:]+$/.test(host)) return null;
  return host;
}

export interface HostConfig {
  /** Hosts serving the staff/platform surface, e.g. ["app.adestay.com", "adestay-git-staging.vercel.app"]. */
  appHosts: readonly string[];
}

const LOCAL_APP_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * "app": the shared staff/platform host (and plain localhost in development).
 * "tenant": any other host; it must resolve to a verified tenant domain.
 */
export function classifyHost(host: string, config: HostConfig): "app" | "tenant" {
  if (LOCAL_APP_HOSTS.has(host) || config.appHosts.some((h) => normalizeHost(h) === host)) return "app";
  return "tenant";
}

/** Internal request headers set by the proxy. Any inbound copies are stripped first. */
export const INTERNAL_HEADER_PREFIX = "x-adestay-";
export const HEADER_SURFACE = "x-adestay-surface";
export const HEADER_TENANT_ID = "x-adestay-tenant-id";
export const HEADER_TENANT_SLUG = "x-adestay-tenant-slug";
export const HEADER_TENANT_STATUS = "x-adestay-tenant-status";

/**
 * Which paths exist on which surface. Enforced in the proxy so wrong-surface requests get a real
 * 404 status (pages stream with partial prerendering, so a later notFound() cannot change it).
 * Pages still check their surface themselves as defence in depth.
 */
const TENANT_ONLY_PREFIXES = ["/portal"];
const APP_ONLY_PREFIXES = ["/sign-in", "/forgot-password", "/reset-password", "/mfa", "/account", "/auth", "/t", "/platform", "/design-system"];

/** The staging preview address of a hostel site on the app host: /sites/{slug}/... */
export const SITES_PREFIX = "/sites";

/**
 * Internal route tree for hostel sites: /site/{live|preview}/{slug}/... Only the proxy can reach
 * it, by rewriting; a request that names it directly gets a 404 on every host. The path therefore
 * carries a hostel the proxy has already checked, so public pages can be rendered once and stored.
 */
export const INTERNAL_SITE_PREFIX = "/site";

function matchesPrefix(path: string, prefixes: string[]): boolean {
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

export function isPathOnSurface(pathname: string, surface: "app" | "tenant"): boolean {
  if (surface === "app") return !matchesPrefix(pathname, TENANT_ONLY_PREFIXES);
  return !matchesPrefix(pathname, APP_ONLY_PREFIXES);
}

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
  /** Staff and platform admin host, e.g. "app.adestay.com". */
  appHost: string;
}

const LOCAL_APP_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * "app": the shared staff/platform host (and plain localhost in development).
 * "tenant": any other host; it must resolve to a verified tenant domain.
 */
export function classifyHost(host: string, config: HostConfig): "app" | "tenant" {
  if (host === normalizeHost(config.appHost) || LOCAL_APP_HOSTS.has(host)) return "app";
  return "tenant";
}

/** Internal request headers set by the proxy. Any inbound copies are stripped first. */
export const INTERNAL_HEADER_PREFIX = "x-adestay-";
export const HEADER_SURFACE = "x-adestay-surface";
export const HEADER_TENANT_ID = "x-adestay-tenant-id";
export const HEADER_TENANT_SLUG = "x-adestay-tenant-slug";
export const HEADER_TENANT_STATUS = "x-adestay-tenant-status";

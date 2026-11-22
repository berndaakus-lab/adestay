import "server-only";

/**
 * Vercel Domains API client for custom hostel domains (ADR-0005). Endpoints checked against the
 * Vercel REST API docs on 2026-11-22. The token is server-only and is never logged or returned.
 * This client only adds, verifies and removes domains on the configured project.
 */
const API = "https://api.vercel.com";
const TIMEOUT_MS = 10_000;

export interface DomainRecord {
  type: string;
  domain: string;
  value: string;
  reason?: string;
}

/** Safe to store in tenant_domains.verification and show to platform admins. */
export interface DomainDetails {
  records: DomainRecord[];
  recommendedCname: string | null;
  recommendedIpv4: string[];
  misconfigured: boolean | null;
  note?: "in_use_elsewhere";
}

export type DomainSync =
  | { status: "verified" | "pending" | "failed"; details: DomainDetails }
  /** Network, auth, rate limit or server problem: says nothing about the domain, so change nothing. */
  | { status: "unavailable" };

interface VercelConfig {
  token: string;
  projectId: string;
  teamId?: string;
}

function getConfig(): VercelConfig | null {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) return null;
  return { token, projectId, teamId: process.env.VERCEL_TEAM_ID || undefined };
}

/** Without a token the platform UI sets domain status by hand (decision 2026-11-14). */
export function isVercelDomainsConfigured(): boolean {
  return getConfig() !== null;
}

async function call(config: VercelConfig, method: string, path: string, query: Record<string, string>, body?: unknown) {
  const url = new URL(path, API);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  if (config.teamId) url.searchParams.set("teamId", config.teamId);
  try {
    const response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${config.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json: unknown = await response.json().catch(() => null);
    return { status: response.status, json: (json ?? {}) as Record<string, unknown> };
  } catch {
    return { status: 0, json: {} as Record<string, unknown> };
  }
}

const projectDomainPath = (config: VercelConfig, hostname: string) =>
  `/v9/projects/${encodeURIComponent(config.projectId)}/domains/${encodeURIComponent(hostname)}`;

function readRecords(value: unknown): DomainRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
    .filter((r) => typeof r.type === "string" && typeof r.domain === "string" && typeof r.value === "string")
    .slice(0, 10)
    .map((r) => ({
      type: (r.type as string).slice(0, 20),
      domain: (r.domain as string).slice(0, 253),
      value: (r.value as string).slice(0, 512),
      ...(typeof r.reason === "string" ? { reason: r.reason.slice(0, 200) } : {}),
    }));
}

function rankedValues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const flat = value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { rank, value: v } = entry as { rank?: unknown; value?: unknown };
    const values = Array.isArray(v) ? v : [v];
    return values.filter((x): x is string => typeof x === "string").map((x) => ({ rank: typeof rank === "number" ? rank : 99, value: x.slice(0, 253) }));
  });
  return flat.sort((a, b) => a.rank - b.rank).map((x) => x.value).slice(0, 4);
}

const emptyDetails = (): DomainDetails => ({ records: [], recommendedCname: null, recommendedIpv4: [], misconfigured: null });

/**
 * Makes sure the domain is on the project, asks Vercel to verify it and reads its DNS state. It is
 * "verified" only when Vercel has confirmed ownership (strictly `true`: the docs' example shows a
 * string) AND the DNS points at Vercel, so a resolved host can actually serve the site with TLS.
 */
export async function syncDomain(hostname: string): Promise<DomainSync> {
  const config = getConfig();
  if (!config) return { status: "unavailable" };
  const path = projectDomainPath(config, hostname);

  let project = await call(config, "GET", path, {});
  if (project.status === 404) {
    project = await call(config, "POST", `/v10/projects/${encodeURIComponent(config.projectId)}/domains`, {}, { name: hostname });
    if (project.status === 409) return { status: "failed", details: { ...emptyDetails(), note: "in_use_elsewhere" } };
    if (project.status === 400 || project.status === 403) return { status: "failed", details: emptyDetails() };
  }
  if (project.status !== 200) return { status: "unavailable" };

  let verified = project.json.verified === true;
  const records = readRecords(project.json.verification);
  if (!verified) {
    // 400 here means the DNS challenge is not complete yet, which is the normal pending case.
    const attempt = await call(config, "POST", `${path}/verify`, {});
    if (attempt.status === 0 || attempt.status === 401 || attempt.status === 429 || attempt.status >= 500) return { status: "unavailable" };
    verified = attempt.status === 200 && attempt.json.verified === true;
  }

  const dns = await call(config, "GET", `/v6/domains/${encodeURIComponent(hostname)}/config`, { projectIdOrName: config.projectId });
  if (dns.status !== 200) return { status: "unavailable" };
  const misconfigured = dns.json.misconfigured === false ? false : true;
  const details: DomainDetails = {
    records: verified ? [] : records,
    recommendedCname: rankedValues(dns.json.recommendedCNAME)[0] ?? null,
    recommendedIpv4: rankedValues(dns.json.recommendedIPv4),
    misconfigured,
  };
  return { status: verified && !misconfigured ? "verified" : "pending", details };
}

/** Removal stops Vercel serving a domain we no longer own (dangling-domain takeover, T19). */
export async function removeDomainFromVercel(hostname: string): Promise<boolean> {
  const config = getConfig();
  if (!config) return false;
  const { status } = await call(config, "DELETE", projectDomainPath(config, hostname), {});
  return status === 200 || status === 404;
}

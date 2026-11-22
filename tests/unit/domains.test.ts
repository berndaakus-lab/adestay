import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DOMAIN = "80000000-0000-4000-8000-000000000001";
const HOST = "book.hostel.com.gh";
const TOKEN = "test-token-not-real";

const h = vi.hoisted(() => ({
  rpc: [] as { name: string; args: Record<string, unknown> }[],
  rpcError: null as null | { code: string },
  row: null as null | { id: string; hostname: string; kind: string; status: string },
  platformAdmin: true,
  jobRows: [] as { id: string; hostname: string }[],
  jobRpc: [] as { name: string; args: Record<string, unknown> }[],
  jobChanged: true as boolean,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ requireStaffSession: async () => ({ id: "user" }) }));
vi.mock("@/lib/server/tenant/context", () => ({ getTenantContext: async () => ({ surface: "app" }) }));
vi.mock("@/lib/server/authz", () => ({
  AuthorizationError: class extends Error {},
  isPlatformAdmin: async () => h.platformAdmin,
  requirePermission: () => {},
  requireTenantMember: async () => null,
}));
vi.mock("@/lib/server/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      h.rpc.push({ name, args });
      return { data: name === "add_custom_domain" ? DOMAIN : null, error: h.rpcError };
    },
    from() {
      const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: h.row, error: null }) };
      return query;
    },
  }),
}));
vi.mock("@/lib/server/supabase/admin", () => ({
  getServiceRoleClient: () => ({
    from() {
      const query = {
        select: () => query, eq: () => query, in: () => query, neq: () => query, order: () => query,
        limit: async () => ({ data: h.jobRows, error: null }),
      };
      return query;
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      h.jobRpc.push({ name, args });
      return { data: h.jobChanged, error: null };
    },
  }),
}));

import { runDomainVerification } from "@/app/api/cron/verify-domains/job";
import { GET } from "@/app/api/cron/verify-domains/route";
import {
  addHostelDomain,
  checkHostelDomain,
  makeDomainPrimary,
  removeHostelDomain,
  setDomainStatusManually,
} from "@/lib/server/actions/domain-actions";
import { isCronAuthorized } from "@/lib/server/cron-auth";
import { removeDomainFromVercel, syncDomain } from "@/lib/server/domains/vercel";
import { addDomainSchema } from "@/lib/validation/domains";

type Reply = { status: number; body?: unknown } | "network";
const idle = { status: "idle" as const };
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

const challenge = [{ type: "TXT", domain: `_vercel.${HOST}`, value: "vc-domain-verify=abc", reason: "pending_domain_verification", extra: "dropped" }];
const dnsOk = { status: 200, body: { misconfigured: false, recommendedCNAME: [{ rank: 2, value: "b.vercel-dns.test" }, { rank: 1, value: "a.vercel-dns.test" }], recommendedIPv4: [{ rank: 1, value: ["76.76.21.21"] }] } };
const dnsBad = { status: 200, body: { ...dnsOk.body, misconfigured: true } };

let calls: { method: string; url: URL; auth: string | null }[];
function mockVercel(routes: Record<string, Reply>) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (input: URL, init: RequestInit) => {
    const url = new URL(input);
    calls.push({ method: init.method ?? "GET", url, auth: new Headers(init.headers).get("authorization") });
    const reply = routes[`${init.method} ${url.pathname}`];
    if (reply === "network" || !reply) throw new Error("network down");
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status });
  }));
}

const P = `/v9/projects/prj_1/domains/${HOST}`;
const ADD = "/v10/projects/prj_1/domains";
const CONFIG = `/v6/domains/${HOST}/config`;

beforeEach(() => {
  vi.stubEnv("VERCEL_API_TOKEN", TOKEN);
  vi.stubEnv("VERCEL_PROJECT_ID", "prj_1");
  vi.stubEnv("VERCEL_TEAM_ID", "team_1");
  vi.stubEnv("NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN", "adestay.test");
  h.rpc.length = 0;
  h.jobRpc.length = 0;
  h.jobRows = [];
  h.jobChanged = true;
  h.rpcError = null;
  h.row = { id: DOMAIN, hostname: HOST, kind: "custom", status: "pending" };
  h.platformAdmin = true;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("syncDomain", () => {
  it("is verified only when ownership is confirmed and DNS is correct", async () => {
    mockVercel({ [`GET ${P}`]: { status: 200, body: { verified: true } }, [`GET ${CONFIG}`]: dnsOk });
    const result = await syncDomain(HOST);
    expect(result).toMatchObject({ status: "verified", details: { misconfigured: false, recommendedCname: "a.vercel-dns.test", recommendedIpv4: ["76.76.21.21"] } });
    expect(calls[0].auth).toBe(`Bearer ${TOKEN}`);
    expect(calls[0].url.searchParams.get("teamId")).toBe("team_1");
  });

  it("stays pending when ownership is confirmed but DNS is wrong", async () => {
    mockVercel({ [`GET ${P}`]: { status: 200, body: { verified: true } }, [`GET ${CONFIG}`]: dnsBad });
    expect((await syncDomain(HOST)).status).toBe("pending");
  });

  it('does not treat the string "true" as verified', async () => {
    mockVercel({ [`GET ${P}`]: { status: 200, body: { verified: "true" } }, [`POST ${P}/verify`]: { status: 400 }, [`GET ${CONFIG}`]: dnsOk });
    expect((await syncDomain(HOST)).status).toBe("pending");
  });

  it("adds a missing domain and returns only the expected record fields", async () => {
    mockVercel({
      [`GET ${P}`]: { status: 404 },
      [`POST ${ADD}`]: { status: 200, body: { verified: false, verification: challenge } },
      [`POST ${P}/verify`]: { status: 400 },
      [`GET ${CONFIG}`]: dnsBad,
    });
    const result = await syncDomain(HOST);
    expect(result).toMatchObject({ status: "pending" });
    if (result.status !== "unavailable") {
      expect(result.details.records).toEqual([{ type: "TXT", domain: `_vercel.${HOST}`, value: "vc-domain-verify=abc", reason: "pending_domain_verification" }]);
    }
  });

  it("becomes verified when the verify call succeeds", async () => {
    mockVercel({ [`GET ${P}`]: { status: 200, body: { verified: false, verification: challenge } }, [`POST ${P}/verify`]: { status: 200, body: { verified: true } }, [`GET ${CONFIG}`]: dnsOk });
    const result = await syncDomain(HOST);
    expect(result.status).toBe("verified");
    if (result.status !== "unavailable") expect(result.details.records).toEqual([]);
  });

  it("reports a domain held by another project as failed", async () => {
    mockVercel({ [`GET ${P}`]: { status: 404 }, [`POST ${ADD}`]: { status: 409 } });
    expect(await syncDomain(HOST)).toMatchObject({ status: "failed", details: { note: "in_use_elsewhere" } });
  });

  it.each<[string, Record<string, Reply>]>([
    ["network failure", { [`GET ${P}`]: "network" }],
    ["bad token", { [`GET ${P}`]: { status: 401 } }],
    ["rate limit", { [`GET ${P}`]: { status: 429 } }],
    ["server error", { [`GET ${P}`]: { status: 500 } }],
    ["verify rate limited", { [`GET ${P}`]: { status: 200, body: { verified: false } }, [`POST ${P}/verify`]: { status: 429 } }],
    ["DNS lookup failure", { [`GET ${P}`]: { status: 200, body: { verified: true } }, [`GET ${CONFIG}`]: { status: 500 } }],
  ])("changes nothing on %s", async (_name, routes) => {
    mockVercel(routes);
    expect(await syncDomain(HOST)).toEqual({ status: "unavailable" });
  });

  it("encodes the hostname in the path", async () => {
    mockVercel({});
    await syncDomain("a/../../evil");
    expect(calls[0].url.pathname).toContain("a%2F..%2F..%2Fevil");
  });

  it("treats a domain already gone from Vercel as removed", async () => {
    mockVercel({ [`DELETE ${P}`]: { status: 404 } });
    expect(await removeDomainFromVercel(HOST)).toBe(true);
    mockVercel({ [`DELETE ${P}`]: { status: 500 } });
    expect(await removeDomainFromVercel(HOST)).toBe(false);
  });
});

describe("domain actions", () => {
  it("needs a platform admin before anything happens", async () => {
    h.platformAdmin = false;
    mockVercel({});
    const data = form({ tenantId: TENANT, hostname: HOST, domainId: DOMAIN, status: "verified", reason: "No longer used" });
    for (const action of [addHostelDomain, checkHostelDomain, setDomainStatusManually, makeDomainPrimary, removeHostelDomain]) {
      expect((await action(idle, data)).message).toMatch(/permission/);
    }
    expect(h.rpc).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("normalises hostnames and refuses URLs", () => {
    expect(addDomainSchema.parse({ tenantId: TENANT, hostname: " Book.Hostel.COM.gh. " }).hostname).toBe(HOST);
    for (const hostname of ["https://book.hostel.com", "hostel", "book.hostel.com/path", "a b.com", "-bad.example.com"]) {
      expect(addDomainSchema.safeParse({ tenantId: TENANT, hostname }).success).toBe(false);
    }
  });

  it("adds through the RPC, then stores what Vercel reports", async () => {
    mockVercel({ [`GET ${P}`]: { status: 404 }, [`POST ${ADD}`]: { status: 200, body: { verified: false, verification: challenge } }, [`POST ${P}/verify`]: { status: 400 }, [`GET ${CONFIG}`]: dnsBad });
    expect(await addHostelDomain(idle, form({ tenantId: TENANT, hostname: HOST }))).toMatchObject({ status: "success", domainStatus: "pending" });
    expect(h.rpc[0]).toMatchObject({ name: "add_custom_domain", args: { p_hostname: HOST, p_platform_root_domain: "adestay.test" } });
    expect(h.rpc[1]).toMatchObject({ name: "set_domain_status", args: { p_domain_id: DOMAIN, p_status: "pending" } });
  });

  it("does not call Vercel when the database refuses the domain", async () => {
    h.rpcError = { code: "23505" };
    mockVercel({});
    expect((await addHostelDomain(idle, form({ tenantId: TENANT, hostname: HOST }))).message).toMatch(/already in use/);
    expect(calls).toEqual([]);
  });

  it("works without a token, leaving status to be set by hand", async () => {
    vi.stubEnv("VERCEL_API_TOKEN", "");
    mockVercel({});
    expect((await addHostelDomain(idle, form({ tenantId: TENANT, hostname: HOST }))).message).toMatch(/not connected/);
    expect(calls).toEqual([]);
    expect(await setDomainStatusManually(idle, form({ domainId: DOMAIN, status: "verified" }))).toMatchObject({ status: "success", domainStatus: "verified" });
    expect(h.rpc.at(-1)).toMatchObject({ name: "set_domain_status", args: { p_status: "verified" } });
  });

  it("refuses manual status once Vercel is connected", async () => {
    mockVercel({});
    expect((await setDomainStatusManually(idle, form({ domainId: DOMAIN, status: "verified" }))).message).toMatch(/Vercel is connected/);
    expect(h.rpc).toEqual([]);
  });

  it("changes nothing when Vercel is unreachable during a check", async () => {
    mockVercel({ [`GET ${P}`]: "network" });
    expect((await checkHostelDomain(idle, form({ domainId: DOMAIN }))).message).toMatch(/nothing changed/);
    expect(h.rpc).toEqual([]);
  });

  it("does not re-check a verified domain", async () => {
    h.row = { id: DOMAIN, hostname: HOST, kind: "custom", status: "verified" };
    mockVercel({});
    expect((await checkHostelDomain(idle, form({ domainId: DOMAIN }))).domainStatus).toBe("verified");
    expect(calls).toEqual([]);
  });

  it("leaves a primary domain on Vercel when the RPC refuses removal", async () => {
    h.rpcError = { code: "22023" };
    mockVercel({ [`DELETE ${P}`]: { status: 200 } });
    expect((await removeHostelDomain(idle, form({ domainId: DOMAIN, reason: "Moved away" }))).status).toBe("error");
    expect(calls).toEqual([]);
  });

  it("removes a custom domain from Vercel after the RPC", async () => {
    mockVercel({ [`DELETE ${P}`]: { status: 200 } });
    expect((await removeHostelDomain(idle, form({ domainId: DOMAIN, reason: "Moved away" }))).message).toBe("Domain removed.");
    expect(calls.map((c) => c.method)).toEqual(["DELETE"]);
  });

  it("warns when Vercel still holds a removed domain", async () => {
    mockVercel({ [`DELETE ${P}`]: { status: 500 } });
    expect((await removeHostelDomain(idle, form({ domainId: DOMAIN, reason: "Moved away" }))).message).toMatch(/taken over/);
  });

  it("never detaches the wildcard for a platform subdomain", async () => {
    h.row = { id: DOMAIN, hostname: "hostel.adestay.test", kind: "platform_subdomain", status: "verified" };
    mockVercel({});
    expect((await removeHostelDomain(idle, form({ domainId: DOMAIN, reason: "Not needed" }))).status).toBe("success");
    expect(calls).toEqual([]);
  });
});

describe("cron", () => {
  const SECRET = "a-long-enough-cron-secret";
  const request = (authorization?: string) =>
    new Request("https://app.test/api/cron/verify-domains", { headers: authorization ? { authorization } : {} }) as never;

  it("checks the bearer secret", () => {
    expect(isCronAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
    for (const header of [null, "", SECRET, `Bearer ${SECRET}x`, `bearer ${SECRET}`, "Bearer wrong"]) {
      expect(isCronAuthorized(header, SECRET)).toBe(false);
    }
  });

  it("refuses everything without a safe secret", () => {
    expect(isCronAuthorized("Bearer undefined", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer ", "")).toBe(false);
    expect(isCronAuthorized("Bearer short", "short")).toBe(false);
  });

  it("returns 401 and does no work without the secret", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    h.jobRows = [{ id: DOMAIN, hostname: HOST }];
    mockVercel({});
    expect((await GET(request("Bearer wrong"))).status).toBe(401);
    expect((await GET(request())).status).toBe(401);
    expect(calls).toEqual([]);
    expect(h.jobRpc).toEqual([]);
  });

  it("runs with the secret and returns counts only", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    h.jobRows = [{ id: DOMAIN, hostname: HOST }];
    mockVercel({ [`GET ${P}`]: { status: 200, body: { verified: true } }, [`GET ${CONFIG}`]: dnsOk });
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ checked: 1, verified: 1, unavailable: 0 });
    expect(h.jobRpc[0]).toMatchObject({ name: "record_domain_check", args: { p_domain_id: DOMAIN, p_status: "verified" } });
  });

  it("skips without a Vercel token", async () => {
    vi.stubEnv("VERCEL_API_TOKEN", "");
    expect(await runDomainVerification()).toMatchObject({ skipped: "vercel_not_configured" });
  });

  it("records nothing for a domain Vercel could not answer about", async () => {
    h.jobRows = [{ id: DOMAIN, hostname: HOST }];
    mockVercel({ [`GET ${P}`]: { status: 500 } });
    expect(await runDomainVerification()).toEqual({ checked: 0, verified: 0, unavailable: 1 });
    expect(h.jobRpc).toEqual([]);
  });

  it("stops at its time budget", async () => {
    h.jobRows = [{ id: DOMAIN, hostname: HOST }, { id: "second", hostname: HOST }];
    mockVercel({ [`GET ${P}`]: { status: 200, body: { verified: true } }, [`GET ${CONFIG}`]: dnsOk });
    const times = [0, 0, 60_000];
    expect((await runDomainVerification(() => times.shift() ?? 60_000)).checked).toBe(1);
  });
});

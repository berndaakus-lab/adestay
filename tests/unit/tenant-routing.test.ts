import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { classifyHost, normalizeHost } from "@/lib/hosts";
import { handleProxyRequest, type ProxyDeps } from "@/lib/server/tenant/proxy-handler";
import { createTenantResolver, type ResolvedTenant } from "@/lib/server/tenant/resolve";

const ALDER: ResolvedTenant = { id: "11111111-1111-4111-8111-111111111111", slug: "alder-house", status: "active" };
const SUSPENDED: ResolvedTenant = { id: "33333333-3333-4333-8333-333333333333", slug: "closed-hostel", status: "suspended" };

const directory: Record<string, ResolvedTenant> = {
  "alder-house.localhost": ALDER,
  "book.alderhouse.com.gh": ALDER,
  "closed-hostel.localhost": SUSPENDED,
};

function deps(overrides: Partial<ProxyDeps> = {}): ProxyDeps {
  return {
    appHost: "app.adestay.test",
    supabaseConfigured: true,
    resolveTenant: async (host) => directory[host] ?? null,
    ...overrides,
  };
}

function request(host: string, extraHeaders: Record<string, string> = {}) {
  // The URL is fixed; the Host header is what the proxy reads (as on Vercel).
  return new NextRequest("http://placeholder.invalid/rooms", { headers: { host, ...extraHeaders } });
}

/** Internal request headers forwarded by NextResponse.next({ request: { headers } }). */
function forwarded(response: Response, name: string): string | null {
  return response.headers.get(`x-middleware-request-${name}`);
}

describe("normalizeHost", () => {
  it.each([
    ["Book.AlderHouse.com.gh:443", "book.alderhouse.com.gh"],
    ["alder-house.localhost:3000", "alder-house.localhost"],
    ["example.com.", "example.com"],
    ["[::1]:3000", "[::1]"],
    ["  LOCALHOST ", "localhost"],
  ])("%s -> %s", (raw, expected) => {
    expect(normalizeHost(raw)).toBe(expected);
  });

  it.each(["", null, undefined, "bad host/with/path", "x".repeat(300)])("rejects %s", (raw) => {
    expect(normalizeHost(raw as string)).toBeNull();
  });
});

describe("classifyHost", () => {
  it("treats the configured app host and localhost as the app surface", () => {
    expect(classifyHost("app.adestay.test", { appHost: "APP.adestay.test:443" })).toBe("app");
    expect(classifyHost("localhost", { appHost: "app.adestay.test" })).toBe("app");
  });

  it("treats every other host as a tenant host", () => {
    expect(classifyHost("alder-house.localhost", { appHost: "app.adestay.test" })).toBe("tenant");
  });
});

describe("proxy", () => {
  it("routes the app host to the app surface", async () => {
    const res = await handleProxyRequest(request("app.adestay.test"), deps());
    expect(forwarded(res, "x-adestay-surface")).toBe("app");
    expect(forwarded(res, "x-adestay-tenant-id")).toBeNull();
  });

  it("resolves a verified tenant host and forwards its id as an internal header", async () => {
    const res = await handleProxyRequest(request("Book.AlderHouse.com.gh"), deps());
    expect(forwarded(res, "x-adestay-surface")).toBe("tenant");
    expect(forwarded(res, "x-adestay-tenant-id")).toBe(ALDER.id);
    expect(forwarded(res, "x-adestay-tenant-status")).toBe("active");
  });

  it("returns 404 for unknown hosts", async () => {
    const res = await handleProxyRequest(request("evil.example.com"), deps());
    expect(res.status).toBe(404);
  });

  it("strips spoofed tenant headers on the app host", async () => {
    const res = await handleProxyRequest(
      request("app.adestay.test", { "x-adestay-tenant-id": ALDER.id, "x-tenant-id": ALDER.id }),
      deps(),
    );
    expect(forwarded(res, "x-adestay-tenant-id")).toBeNull();
    expect(forwarded(res, "x-tenant-id")).toBeNull();
  });

  it("ignores a spoofed tenant id: the host alone decides the tenant", async () => {
    const res = await handleProxyRequest(
      request("closed-hostel.localhost", { "x-adestay-tenant-id": ALDER.id, "x-adestay-tenant-status": "active" }),
      deps(),
    );
    expect(forwarded(res, "x-adestay-tenant-id")).toBe(SUSPENDED.id);
    expect(forwarded(res, "x-adestay-tenant-status")).toBe("suspended");
  });

  it("returns 404 for onboarding tenants", async () => {
    const res = await handleProxyRequest(
      request("new-hostel.localhost"),
      deps({ resolveTenant: async () => ({ id: "x", slug: "new-hostel", status: "onboarding" }) }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 503 for tenant hosts when Supabase is not configured, without querying", async () => {
    const resolveTenant = vi.fn();
    const res = await handleProxyRequest(request("alder-house.localhost"), deps({ supabaseConfigured: false, resolveTenant }));
    expect(res.status).toBe(503);
    expect(resolveTenant).not.toHaveBeenCalled();
  });

  it("rejects a missing or malformed Host header", async () => {
    const res = await handleProxyRequest(request("bad host"), deps());
    expect(res.status).toBe(400);
  });
});

describe("tenant resolver cache", () => {
  it("caches hits for 60 s and misses for 15 s", async () => {
    let clock = 0;
    const lookup = vi.fn(async (host: string) => directory[host] ?? null);
    const resolve = createTenantResolver(lookup, () => clock);

    await resolve("alder-house.localhost");
    await resolve("ALDER-HOUSE.localhost:3000");
    expect(lookup).toHaveBeenCalledTimes(1);

    clock = 59_000;
    await resolve("alder-house.localhost");
    expect(lookup).toHaveBeenCalledTimes(1);
    clock = 61_000;
    await resolve("alder-house.localhost");
    expect(lookup).toHaveBeenCalledTimes(2);

    await resolve("unknown.example");
    clock += 14_000;
    await resolve("unknown.example");
    expect(lookup).toHaveBeenCalledTimes(3);
    clock += 2_000;
    await resolve("unknown.example");
    expect(lookup).toHaveBeenCalledTimes(4);
  });

  it("never looks up a malformed host", async () => {
    const lookup = vi.fn();
    const resolve = createTenantResolver(lookup);
    expect(await resolve("bad host")).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });
});

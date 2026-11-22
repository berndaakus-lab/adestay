import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bookingLookupSchema } from "@/lib/validation/booking";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SECRET = "a-test-secret-of-enough-length";

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  site: null as null | { tenant: { id: string; slug: string; status: string } },
  headers: new Headers(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => h.headers }));
vi.mock("@/lib/server/supabase/admin", () => ({ getServiceRoleClient: () => ({ rpc: h.rpc }) }));
vi.mock("@/lib/server/tenant/site", () => ({ getSiteTenant: async () => h.site }));

import { lookupBookingStatus } from "@/lib/server/actions/booking-lookup-actions";
import { clientAddress, lookupClientKey, rateLimitAddress } from "@/lib/server/booking-lookup/client-key";

const form = (change: Record<string, string> = {}) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ site: "hostel-a", reference: " ha-7k3q9p ", contact: " Ama@Example.com ", ...change })) data.set(key, value);
  return data;
};
const look = (change?: Record<string, string>) => lookupBookingStatus({ status: "idle" }, form(change));
const answer = (outcome: string, booking_status: string | null = null) => ({ data: [{ outcome, booking_status }], error: null });

beforeEach(() => {
  vi.stubEnv("LOG_REDACTION_SALT", SECRET);
  vi.stubEnv("VERCEL", "1");
  h.site = { tenant: { id: TENANT, slug: "hostel-a", status: "active" } };
  h.headers = new Headers({ "x-forwarded-for": "41.66.1.1" });
  h.rpc.mockReset().mockResolvedValue(answer("found", "approved"));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("visitor identity", () => {
  it.each([
    ["41.66.1.1", "41.66.1.1"],
    [" 41.66.1.1 ", "41.66.1.1"],
    ["::ffff:41.66.1.1", "41.66.1.1"],
    ["2001:db8:1:2:3:4:5:6", "2001:db8:1:2::/64"],
    ["2001:db8:1:2::9", "2001:db8:1:2::/64"],
    ["2001:DB8:0001:2::9", "2001:db8:1:2::/64"],
    ["2001:db8::1", "2001:db8:0:0::/64"],
    ["::1", "0:0:0:0::/64"],
    ["fe80::1%eth0", "fe80:0:0:0::/64"],
  ])("%s becomes %s", (raw, expected) => expect(rateLimitAddress(raw)).toBe(expected));

  it.each(["", "nonsense", "999.1.1.1", "1.2.3", "::ffff:999.1.1.1"])("refuses %j", (raw) => expect(rateLimitAddress(raw)).toBeNull());

  it("treats a whole IPv6 /64 as one visitor", () => {
    expect(rateLimitAddress("2001:db8:1:2::a")).toBe(rateLimitAddress("2001:db8:1:2:ffff::b"));
    expect(rateLimitAddress("2001:db8:1:2::a")).not.toBe(rateLimitAddress("2001:db8:1:3::a"));
  });

  it("uses the first forwarded address on Vercel", () => {
    expect(clientAddress(new Headers({ "x-forwarded-for": "41.66.1.1, 10.0.0.1" }), true)).toBe("41.66.1.1");
    expect(clientAddress(new Headers(), true)).toBeNull();
  });

  it("ignores a forwarded header when there is no trusted proxy", () => {
    expect(clientAddress(new Headers({ "x-forwarded-for": "8.8.8.8" }), false)).toBe("127.0.0.1");
  });

  it("makes a keyed 64-character hash that hides the address", () => {
    const key = lookupClientKey("41.66.1.1", SECRET);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toBe(lookupClientKey("41.66.1.1", `${SECRET}-other`));
    expect(key).not.toBe(lookupClientKey("41.66.1.2", SECRET));
  });

  it("needs a secret of at least 16 characters", () => {
    expect(lookupClientKey("41.66.1.1", "short")).toBeNull();
    expect(lookupClientKey("41.66.1.1", "")).toBeNull();
  });
});

describe("lookup form", () => {
  it("normalises an email and a Ghana phone number", () => {
    expect(bookingLookupSchema.parse({ reference: "HA-1", contact: " Ama@Example.COM " }).contact).toBe("ama@example.com");
    expect(bookingLookupSchema.parse({ reference: "HA-1", contact: "024 123 4567" }).contact).toBe("+233241234567");
  });
  it("passes an unusable contact on, so it gets the normal not-found answer", () => {
    expect(bookingLookupSchema.parse({ reference: "HA-1", contact: "12345" }).contact).toBe("12345");
  });
  it.each([{ reference: "", contact: "a@b.co" }, { reference: "HA-1", contact: " " }, { reference: "x".repeat(21), contact: "a@b.co" }, { reference: "HA-1", contact: "x".repeat(255) }])(
    "refuses %j",
    (input) => expect(bookingLookupSchema.safeParse(input).success).toBe(false),
  );
});

describe("lookupBookingStatus", () => {
  it("uses the site's hostel and a hashed visitor key, and returns status only", async () => {
    const state = await look({ tenant_id: OTHER, p_tenant_id: OTHER });
    expect(state).toEqual({ status: "found", bookingStatus: "approved" });
    expect(h.rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = h.rpc.mock.calls[0];
    expect(fn).toBe("lookup_booking");
    expect(args).toEqual({
      p_tenant_id: TENANT,
      p_reference: "ha-7k3q9p",
      p_contact: "ama@example.com",
      p_client_key: lookupClientKey("41.66.1.1", SECRET),
    });
    expect(JSON.stringify(args)).not.toContain("41.66.1.1");
  });

  it("drops anything extra the database might return", async () => {
    h.rpc.mockResolvedValue({ data: [{ outcome: "found", booking_status: "approved", full_name: "Ama", decision_reason: "x" }], error: null });
    expect(await look()).toEqual({ status: "found", bookingStatus: "approved" });
  });

  it("gives one answer for every kind of not found", async () => {
    h.rpc.mockResolvedValue(answer("not_found"));
    const first = await look();
    const second = await look({ reference: "HA-000000", contact: "other@example.com" });
    expect(first.message).toMatch(/could not find/);
    expect(second).toEqual(first);
  });

  it("explains the rate limit", async () => {
    h.rpc.mockResolvedValue(answer("rate_limited"));
    expect((await look()).message).toMatch(/15 minutes/);
  });

  it("works for a suspended hostel (D-16)", async () => {
    h.site!.tenant.status = "suspended";
    expect((await look()).status).toBe("found");
  });

  it("refuses when this is not a hostel site", async () => {
    h.site = null;
    expect((await look()).message).toMatch(/unavailable/);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("does not query for an incomplete form", async () => {
    expect((await look({ reference: " " })).fieldErrors).toHaveProperty("reference");
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("fails closed without the secret", async () => {
    vi.stubEnv("LOG_REDACTION_SALT", "");
    expect((await look()).message).toMatch(/unavailable/);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("fails closed when the visitor's address is unknown on Vercel", async () => {
    h.headers = new Headers();
    expect((await look()).message).toMatch(/unavailable/);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ data: null, error: { code: "XX000", message: "relation secret_table" } }],
    [{ data: [{ outcome: "strange", booking_status: null }], error: null }],
    [{ data: [{ outcome: "found", booking_status: null }], error: null }],
    [{ data: [], error: null }],
  ])("reports unavailable for a bad response", async (response) => {
    h.rpc.mockResolvedValue(response);
    const state = await look();
    expect(state.message).toMatch(/unavailable/);
    expect(JSON.stringify(state)).not.toContain("secret_table");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret_table");
  });

  it("does not throw when the call fails", async () => {
    h.rpc.mockRejectedValue(new Error("network ama@example.com"));
    expect((await look()).message).toMatch(/unavailable/);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("ama@example.com");
  });
});

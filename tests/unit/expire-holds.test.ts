import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "a-cron-secret-of-enough-length";

const h = vi.hoisted(() => ({ rpc: vi.fn(), email: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/supabase/admin", () => ({ getServiceRoleClient: () => ({ rpc: h.rpc }) }));
vi.mock("@/lib/server/email/booking-email", () => ({ sendBookingEmail: h.email }));

import { runHoldExpiry } from "@/app/api/cron/expire-holds/job";
import { GET } from "@/app/api/cron/expire-holds/route";

type Batch = { expired_reservations: number; has_more: boolean; lapsed_request_ids: string[] };
const batch = (ids: string[], has_more = false): { data: Batch[]; error: null } => ({
  data: [{ expired_reservations: ids.length, has_more, lapsed_request_ids: ids }],
  error: null,
});

/** Answers expire_reservations from a queue and purge_expired_rate_limits with a count. */
function database(batches: unknown[], purge: unknown = { data: 3, error: null }) {
  h.rpc.mockImplementation(async (fn: string) => (fn === "purge_expired_rate_limits" ? purge : (batches.shift() ?? batch([]))));
}
const expiryCalls = () => h.rpc.mock.calls.filter(([fn]) => fn === "expire_reservations");
const call = (authorization?: string) =>
  GET(new Request("https://app.test/api/cron/expire-holds", { headers: authorization ? { authorization } : {} }) as never);

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  h.rpc.mockReset();
  h.email.mockReset().mockResolvedValue("sent");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("runHoldExpiry", () => {
  it("expires holds, emails each student through the job path, and cleans up", async () => {
    database([batch(["r1", "r2"])]);
    expect(await runHoldExpiry()).toEqual({ expired: 2, emailsSent: 2, emailsNotSent: 0, hasMore: false, rateLimitsPurged: 3, failed: false });
    expect(h.rpc).toHaveBeenCalledWith("expire_reservations", { p_limit: 100 });
    expect(h.email).toHaveBeenCalledWith(expect.anything(), "r1", "lapsed", { asJob: true });
    expect(h.email).toHaveBeenCalledWith(expect.anything(), "r2", "lapsed", { asJob: true });
  });

  it("does nothing extra when no hold is due", async () => {
    database([batch([])]);
    expect(await runHoldExpiry()).toMatchObject({ expired: 0, emailsSent: 0, hasMore: false, failed: false });
    expect(h.email).not.toHaveBeenCalled();
    expect(expiryCalls()).toHaveLength(1);
  });

  it("keeps going while more holds are due", async () => {
    database([batch(["r1"], true), batch(["r2"], true), batch(["r3"], false)]);
    expect(await runHoldExpiry()).toMatchObject({ expired: 3, emailsSent: 3, hasMore: false });
    expect(expiryCalls()).toHaveLength(3);
  });

  it("stops at the batch limit and reports more waiting", async () => {
    h.rpc.mockImplementation(async (fn: string) => (fn === "expire_reservations" ? batch(["r"], true) : { data: 0, error: null }));
    expect(await runHoldExpiry()).toMatchObject({ expired: 10, hasMore: true });
    expect(expiryCalls()).toHaveLength(10);
  });

  it("stops when due rows are locked, instead of spinning", async () => {
    database([{ data: [{ expired_reservations: 0, has_more: true, lapsed_request_ids: [] }], error: null }]);
    expect(await runHoldExpiry()).toMatchObject({ expired: 0, hasMore: true, failed: false });
    expect(expiryCalls()).toHaveLength(1);
  });

  it("starts no new batch after the time budget", async () => {
    database([batch(["r1"], true), batch(["r2"], false)]);
    const clock = vi.fn().mockReturnValueOnce(0).mockReturnValue(40_000);
    expect(await runHoldExpiry(clock)).toMatchObject({ expired: 1, hasMore: true });
    expect(expiryCalls()).toHaveLength(1);
  });

  it("sends a large batch only a few at a time", async () => {
    let active = 0;
    let highest = 0;
    h.email.mockImplementation(async () => {
      active++;
      highest = Math.max(highest, active);
      await Promise.resolve();
      active--;
      return "sent";
    });
    database([batch(Array.from({ length: 23 }, (_, i) => `r${i}`))]);
    expect((await runHoldExpiry()).emailsSent).toBe(23);
    expect(highest).toBeLessThanOrEqual(5);
  });

  it.each(["not_configured", "failed"])("still expires the hold when an email is %s", async (delivery) => {
    h.email.mockResolvedValue(delivery);
    database([batch(["r1", "r2"])]);
    expect(await runHoldExpiry()).toMatchObject({ expired: 2, emailsSent: 0, emailsNotSent: 2, failed: false });
  });

  it("reports a database failure but keeps the work already done", async () => {
    database([batch(["r1"], true), { data: null, error: { code: "XX000", message: "relation secret_table" } }]);
    expect(await runHoldExpiry()).toMatchObject({ expired: 1, emailsSent: 1, failed: true });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret_table");
  });

  it("treats an empty response as a failure", async () => {
    database([{ data: [], error: null }]);
    expect((await runHoldExpiry()).failed).toBe(true);
  });

  it("does not fail the job when clean-up fails", async () => {
    database([batch(["r1"])], { data: null, error: { code: "XX000" } });
    expect(await runHoldExpiry()).toMatchObject({ expired: 1, rateLimitsPurged: null, failed: false });
  });
});

describe("GET /api/cron/expire-holds", () => {
  it.each([undefined, "Bearer wrong-secret-of-some-length", SECRET])("refuses authorization %j", async (authorization) => {
    const response = await call(authorization);
    expect(response.status).toBe(401);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("refuses everything without a configured secret", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("returns counts only, and is never cached", async () => {
    database([batch(["70000000-0000-4000-8000-000000000001"])]);
    const response = await call(`Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ expired: 1, emailsSent: 1 });
    expect(text).not.toContain("70000000");
  });

  it("returns 500 so a scheduler can see a failed run", async () => {
    database([{ data: null, error: { code: "XX000" } }]);
    expect((await call(`Bearer ${SECRET}`)).status).toBe(500);
  });

  it("does not expose an unexpected error", async () => {
    h.rpc.mockRejectedValue(new Error("connection to secret-host failed"));
    const response = await call(`Bearer ${SECRET}`);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret-host");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret-host");
  });
});

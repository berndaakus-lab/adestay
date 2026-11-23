import { beforeEach, describe, expect, it, vi } from "vitest";
import { extendHoldSchema } from "@/lib/validation/booking";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID = "70000000-0000-4000-8000-000000000001";

const h = vi.hoisted(() => ({
  access: null as null | { tenantId: string; slug: string; name: string; role: string; permissions: string[] },
  surface: "app",
  session: vi.fn(async () => ({ id: "user" })),
  revalidate: vi.fn(),
  email: vi.fn(),
  rpc: vi.fn(),
  owned: { data: { id: "x" } as null | { id: string }, error: null as null | { code: string } },
  reads: [] as { table: string; filters: [string, unknown][] }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidate }));
vi.mock("@/lib/server/auth", () => ({ requireStaffSession: h.session }));
vi.mock("@/lib/server/tenant/context", () => ({ getTenantContext: async () => ({ surface: h.surface }) }));
vi.mock("@/lib/server/email/booking-email", () => ({ sendBookingEmail: h.email }));
vi.mock("@/lib/server/authz", async () => {
  const { hasPermission } = await import("@/lib/permissions");
  class AuthorizationError extends Error {}
  return {
    AuthorizationError,
    requireTenantMember: async () => {
      if (!h.access) throw new AuthorizationError("Not found");
      return h.access;
    },
    requirePermission: (access: never, permission: never) => {
      if (!hasPermission(access, permission)) throw new AuthorizationError("Forbidden");
    },
  };
});
vi.mock("@/lib/server/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: h.rpc,
    from(table: string) {
      const read = { table, filters: [] as [string, unknown][] };
      h.reads.push(read);
      const query = {
        select: () => query,
        eq(column: string, value: unknown) {
          read.filters.push([column, value]);
          return query;
        },
        maybeSingle: async () => h.owned,
      };
      return query;
    },
  }),
}));

import {
  approveBooking,
  cancelBooking,
  confirmBookingHold,
  extendBookingHold,
  rejectBooking,
  startBookingReview,
  waitlistBooking,
  type BookingReviewState,
} from "@/lib/server/actions/booking-review-actions";

type Action = (slug: string, prev: BookingReviewState, data: FormData) => Promise<BookingReviewState>;
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const staff = (...permissions: string[]) => ({ tenantId: TENANT, slug: "hostel-a", name: "A", role: "staff", permissions });

const reason = "Student asked to cancel";
const CASES: {
  name: string; action: Action; permission: string; table: string; fields: Record<string, string>;
  rpc: string; args: Record<string, unknown>; email: string | null; silent?: boolean;
}[] = [
  { name: "start review", action: startBookingReview, permission: "bookings.review", table: "booking_requests", fields: { id: ID }, rpc: "start_booking_review", args: { p_request_id: ID }, email: null, silent: true },
  { name: "approve", action: approveBooking, permission: "bookings.review", table: "booking_requests", fields: { id: ID }, rpc: "approve_booking_request", args: { p_request_id: ID }, email: "approved" },
  { name: "reject", action: rejectBooking, permission: "bookings.review", table: "booking_requests", fields: { id: ID, reason }, rpc: "reject_booking_request", args: { p_request_id: ID, p_reason: reason }, email: "rejected" },
  { name: "waitlist", action: waitlistBooking, permission: "bookings.review", table: "booking_requests", fields: { id: ID }, rpc: "waitlist_booking_request", args: { p_request_id: ID }, email: "waitlisted" },
  { name: "cancel", action: cancelBooking, permission: "bookings.cancel", table: "booking_requests", fields: { id: ID, reason }, rpc: "cancel_booking_request", args: { p_request_id: ID, p_reason: reason }, email: null },
  { name: "extend", action: extendBookingHold, permission: "bookings.review", table: "reservations", fields: { id: ID, reason, hours: "24" }, rpc: "extend_hold", args: { p_reservation_id: ID, p_hours: 24, p_reason: reason }, email: null },
  { name: "confirm", action: confirmBookingHold, permission: "bookings.review", table: "reservations", fields: { id: ID, reason }, rpc: "confirm_reservation", args: { p_reservation_id: ID, p_reason: reason }, email: null },
];
const run = (c: (typeof CASES)[number], fields = c.fields) => c.action("hostel-a", { status: "idle" }, form(fields));

beforeEach(() => {
  h.surface = "app";
  h.access = staff("bookings.read", "bookings.review", "bookings.cancel");
  h.owned = { data: { id: ID }, error: null };
  h.reads.length = 0;
  h.session.mockClear();
  h.revalidate.mockClear();
  h.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  h.email.mockReset().mockResolvedValue("sent");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe.each(CASES)("$name", (c) => {
  it("calls its RPC with validated input after checking the record's hostel", async () => {
    expect((await run(c)).status).toBe("success");
    expect(h.session).toHaveBeenCalled();
    expect(h.reads).toEqual([{ table: c.table, filters: [["tenant_id", TENANT], ["id", ID]] }]);
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(h.rpc).toHaveBeenCalledWith(c.rpc, c.args);
    expect(h.revalidate).toHaveBeenCalledWith("/t/hostel-a", "layout");
  });

  it("needs its own permission", async () => {
    h.access = staff("bookings.read", ...["bookings.review", "bookings.cancel"].filter((p) => p !== c.permission));
    expect((await run(c)).message).toMatch(/permission/);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("refuses non-members and the wrong surface", async () => {
    h.access = null;
    expect((await run(c)).status).toBe("error");
    h.access = staff(c.permission);
    h.surface = "tenant";
    expect((await run(c)).status).toBe("error");
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("does not act on a record from another hostel", async () => {
    h.owned = { data: null, error: null };
    expect((await run(c)).message).toMatch(/no longer exists/);
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.email).not.toHaveBeenCalled();
  });

  it("refuses an invalid id", async () => {
    expect((await run(c, { ...c.fields, id: "nope" })).fieldErrors).toHaveProperty("id");
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("sends no email and changes nothing visible when the RPC refuses", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: "55000", message: "raw text" } });
    const state = await run(c);
    expect(state.message).toMatch(/has changed/);
    expect(JSON.stringify(state)).not.toContain("raw text");
    expect(h.email).not.toHaveBeenCalled();
    expect(h.revalidate).not.toHaveBeenCalled();
  });

  it("tells staff whether the student was informed", async () => {
    const state = await run(c);
    if (c.email) {
      expect(h.email).toHaveBeenCalledWith(expect.anything(), ID, c.email);
      expect(state.message).toMatch(/has been emailed/);
      expect(state.warning).toBeUndefined();
    } else {
      expect(h.email).not.toHaveBeenCalled();
      if (c.silent) expect(state.warning).toBeUndefined();
      else expect(state.warning).toMatch(/No email is sent/);
    }
  });
});

describe("email problems", () => {
  it.each(["not_configured", "failed"])("keeps the decision and warns staff when delivery is %s", async (delivery) => {
    h.email.mockResolvedValue(delivery);
    const state = await approveBooking("hostel-a", { status: "idle" }, form({ id: ID }));
    expect(state.status).toBe("success");
    expect(state.message).not.toMatch(/emailed/);
    expect(state.warning).toMatch(/not emailed/);
  });
});

describe("errors and input", () => {
  it("explains no capacity", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: "AS409" } });
    expect((await approveBooking("hostel-a", { status: "idle" }, form({ id: ID }))).message).toMatch(/No bed is left/);
  });

  it("never shows unknown database text", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "relation secret_table" } });
    const state = await approveBooking("hostel-a", { status: "idle" }, form({ id: ID }));
    expect(state.message).toMatch(/quote reference/);
    expect(JSON.stringify(state)).not.toContain("secret_table");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret_table");
  });

  it("reports a failed hostel check", async () => {
    h.owned = { data: null, error: { code: "42501" } };
    expect((await approveBooking("hostel-a", { status: "idle" }, form({ id: ID }))).message).toMatch(/permission/);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it.each([rejectBooking, cancelBooking, confirmBookingHold])("needs a reason", async (action) => {
    const state = await action("hostel-a", { status: "idle" }, form({ id: ID, reason: "  " }));
    expect(state.fieldErrors).toHaveProperty("reason");
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it.each(["0", "337", "1.5", "-1", "abc", ""])("refuses %j extra hours", (hours) => {
    expect(extendHoldSchema.safeParse({ id: ID, reason, hours }).success).toBe(false);
  });
});

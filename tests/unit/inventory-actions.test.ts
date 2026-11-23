import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TYPE = "20000000-0000-4000-8000-0000000000a1";
const PERIOD = "10000000-0000-4000-8000-0000000000a1";
const ROOM = "30000000-0000-4000-8000-0000000000a1";

type Result = { data: { id: string }[] | null; error: { code: string; message?: string } | null };
interface Call { table: string; op: string; payload?: unknown; filters: [string, unknown][] }

const h = vi.hoisted(() => ({
  calls: [] as { table: string; op: string; payload?: unknown; filters: [string, unknown][] }[],
  results: [] as unknown[],
  access: null as null | { tenantId: string; slug: string; name: string; role: string; permissions: string[] },
  surface: "app",
  session: vi.fn(async () => ({ id: "user" })),
  revalidate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidate, updateTag: vi.fn(), cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ requireStaffSession: h.session }));
vi.mock("@/lib/server/tenant/context", () => ({ getTenantContext: async () => ({ surface: h.surface }) }));
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
    from(table: string) {
      const call: Call = { table, op: "", filters: [] };
      const query = {
        insert(payload: unknown) { call.op = "insert"; call.payload = payload; h.calls.push(call); return query; },
        update(payload: unknown) { call.op = "update"; call.payload = payload; h.calls.push(call); return query; },
        delete() { call.op = "delete"; h.calls.push(call); return query; },
        eq(column: string, value: unknown) { call.filters.push([column, value]); return query; },
        is(column: string, value: unknown) { call.filters.push([column, value]); return query; },
        select() { return query; },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(h.results.shift() ?? { data: [{ id: "new-id" }], error: null }).then(resolve);
        },
      };
      return query;
    },
  }),
}));

import {
  createBedBlock,
  createRoom,
  createRoomType,
  deleteRoom,
  releaseBedBlock,
  setRoomTypePrice,
  updateRoom,
  type InventoryFormState,
} from "@/lib/server/actions/inventory-actions";

const idle: InventoryFormState = { status: "idle" };
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const member = (permissions: string[], role = "staff") => ({ tenantId: TENANT_A, slug: "hostel-a", name: "Hostel A", role, permissions });
const room = { roomTypeId: TYPE, label: "A-101" };

beforeEach(() => {
  h.calls.length = 0;
  h.results.length = 0;
  h.access = member(["inventory.read", "inventory.manage"]);
  h.surface = "app";
  h.session.mockClear();
  h.session.mockImplementation(async () => ({ id: "user" }));
  h.revalidate.mockClear();
});

describe("authorization runs before anything is written", () => {
  it("requires a staff session (MFA) on every call", async () => {
    await createRoom("hostel-a", idle, form(room));
    expect(h.session).toHaveBeenCalledWith("/t/hostel-a");
  });

  it("lets the sign-in or MFA redirect propagate", async () => {
    h.session.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(createRoom("hostel-a", idle, form(room))).rejects.toThrow("NEXT_REDIRECT");
    expect(h.calls).toEqual([]);
  });

  it("refuses non-members", async () => {
    h.access = null;
    expect((await createRoom("hostel-a", idle, form(room))).message).toMatch(/permission/);
    expect(h.calls).toEqual([]);
  });

  it("refuses staff with inventory.read only", async () => {
    h.access = member(["inventory.read"]);
    expect((await createRoom("hostel-a", idle, form(room))).message).toMatch(/permission/);
    expect(h.calls).toEqual([]);
  });

  it("prices need pricing.manage, not inventory.manage", async () => {
    const result = await setRoomTypePrice("hostel-a", idle, form({ roomTypeId: TYPE, bookingPeriodId: PERIOD, amount: "100" }));
    expect(result.message).toMatch(/permission/);
    expect(h.calls).toEqual([]);
  });

  it("works only on the app host", async () => {
    h.surface = "tenant";
    expect((await createRoom("hostel-a", idle, form(room))).status).toBe("error");
    expect(h.session).not.toHaveBeenCalled();
  });

  it("refuses a malformed tenant slug", async () => {
    expect((await createRoom("../evil", idle, form(room))).status).toBe("error");
    expect(h.session).not.toHaveBeenCalled();
  });
});

describe("tenant scoping", () => {
  it("takes tenant_id from the membership, ignoring the form", async () => {
    await createRoom("hostel-a", idle, form({ ...room, tenant_id: TENANT_B, tenantId: TENANT_B }));
    expect(h.calls[0].payload).toMatchObject({ tenant_id: TENANT_A, room_type_id: TYPE, label: "A-101" });
  });

  it("scopes updates and never writes tenant_id", async () => {
    await updateRoom("hostel-a", idle, form({ ...room, id: ROOM, tenant_id: TENANT_B }));
    expect(h.calls[0].payload).not.toHaveProperty("tenant_id");
    expect(h.calls[0].filters).toEqual([["tenant_id", TENANT_A], ["id", ROOM]]);
  });

  it("treats a row hidden by RLS as not found", async () => {
    h.results.push({ data: [], error: null } satisfies Result);
    const result = await deleteRoom("hostel-a", idle, form({ id: ROOM }));
    expect(result).toMatchObject({ status: "error", message: expect.stringMatching(/no longer exists/) });
    expect(h.revalidate).not.toHaveBeenCalled();
  });
});

describe("results", () => {
  it("returns field errors without touching the database", async () => {
    const result = await createRoomType("hostel-a", idle, form({ name: "Double", occupancy: "13" }));
    expect(result.fieldErrors).toHaveProperty("occupancy");
    expect(h.calls).toEqual([]);
  });

  it("refreshes the workspace after success", async () => {
    expect(await createRoom("hostel-a", idle, form(room))).toMatchObject({ status: "success", id: "new-id" });
    expect(h.revalidate).toHaveBeenCalledWith("/t/hostel-a", "layout");
  });

  it("maps a duplicate to a friendly message", async () => {
    h.results.push({ data: null, error: { code: "23505" } } satisfies Result);
    expect((await createRoom("hostel-a", idle, form(room))).message).toMatch(/already exists/);
  });

  it("never shows raw database text", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    h.results.push({ data: null, error: { code: "XX000", message: "secret table detail" } } satisfies Result);
    const result = await createRoom("hostel-a", idle, form(room));
    expect(result.message).toMatch(/reference [0-9a-f]{8}/);
    expect(result.message).not.toContain("secret");
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
    log.mockRestore();
  });

  it("sends a block as an inclusive range", async () => {
    await createBedBlock("hostel-a", idle, form({ bedId: ROOM, startsOn: "2026-10-01", endsOn: "2026-10-15", reason: "Leak" }));
    expect(h.calls[0].payload).toMatchObject({ blocked: "[2026-10-01,2026-10-15]", tenant_id: TENANT_A });
  });

  it("releases only a live block", async () => {
    await releaseBedBlock("hostel-a", idle, form({ id: ROOM }));
    expect(h.calls[0].filters).toContainEqual(["released_at", null]);
  });
});

describe("setRoomTypePrice", () => {
  const price = { roomTypeId: TYPE, bookingPeriodId: PERIOD, amount: "4,500", deposit: "1,000" };
  beforeEach(() => { h.access = member(["pricing.manage"]); });

  it("updates an existing price without writing keys", async () => {
    await setRoomTypePrice("hostel-a", idle, form(price));
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]).toMatchObject({ op: "update", payload: { amount_minor: 450000, deposit_minor: 100000 } });
    expect(h.calls[0].payload).not.toHaveProperty("tenant_id");
  });

  it("inserts when there is no price yet", async () => {
    h.results.push({ data: [], error: null } satisfies Result);
    expect((await setRoomTypePrice("hostel-a", idle, form(price))).status).toBe("success");
    expect(h.calls.map((c) => c.op)).toEqual(["update", "insert"]);
    expect(h.calls[1].payload).toMatchObject({ tenant_id: TENANT_A, room_type_id: TYPE, booking_period_id: PERIOD });
  });

  it("does not insert after a failed update", async () => {
    h.results.push({ data: null, error: { code: "42501" } } satisfies Result);
    expect((await setRoomTypePrice("hostel-a", idle, form(price))).status).toBe("error");
    expect(h.calls).toHaveLength(1);
  });
});

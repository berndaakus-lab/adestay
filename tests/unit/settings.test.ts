import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizePhone } from "@/lib/phone";
import { PERMISSION_GROUPS } from "@/lib/permission-labels";
import { DELEGABLE_PERMISSIONS, operationalSettingsSchema, permissionSetKey, permissionSetSchema, profileSchema } from "@/lib/validation/settings";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SET = "99999999-0000-4000-8000-0000000000a9";

const h = vi.hoisted(() => ({
  calls: [] as { table: string; op: string; payload?: Record<string, unknown>; filters: [string, unknown][] }[],
  results: [] as unknown[],
  access: null as null | { tenantId: string; slug: string; name: string; role: string; permissions: string[] },
  revalidate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidate }));
vi.mock("@/lib/server/auth", () => ({ requireStaffSession: async () => ({ id: "user" }) }));
vi.mock("@/lib/server/tenant/context", () => ({ getTenantContext: async () => ({ surface: "app" }) }));
vi.mock("@/lib/server/authz", async () => {
  const { hasPermission } = await import("@/lib/permissions");
  class AuthorizationError extends Error {}
  return {
    AuthorizationError,
    isPlatformAdmin: async () => false,
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
      const call: (typeof h.calls)[number] = { table, op: "", filters: [] };
      h.calls.push(call);
      const query = {
        insert(payload: Record<string, unknown>) { call.op = "insert"; call.payload = payload; return query; },
        update(payload: Record<string, unknown>) { call.op = "update"; call.payload = payload; return query; },
        delete() { call.op = "delete"; return query; },
        eq(column: string, value: unknown) { call.filters.push([column, value]); return query; },
        select() { return query; },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(h.results.shift() ?? { data: [{ id: "new-id", tenant_id: TENANT }], error: null }).then(resolve);
        },
      };
      return query;
    },
  }),
}));

import {
  createPermissionSet,
  deletePermissionSet,
  updateHostelProfile,
  updateOperationalSettings,
  updatePermissionSet,
} from "@/lib/server/actions/settings-actions";

const idle = { status: "idle" as const };
const form = (fields: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) for (const v of [value].flat()) data.append(key, v);
  return data;
};
const member = (permissions: string[]) => ({ tenantId: TENANT, slug: "hostel-a", name: "Hostel A", role: "staff", permissions });
const rules = { holdDays: "5", holdExtensionMax: "1", depositPolicy: "fixed", depositValue: "500.00", minPaidPercentForCheckin: "100" };

beforeEach(() => {
  h.calls.length = 0;
  h.results.length = 0;
  h.access = { ...member([]), role: "hostel_admin" };
  h.revalidate.mockClear();
});

describe("phones", () => {
  it.each([
    ["024 123 4567", "+233241234567"],
    ["233241234567", "+233241234567"],
    ["+233 24 123 4567", "+233241234567"],
    ["(024) 123-4567", "+233241234567"],
    ["+447911123456", "+447911123456"],
  ])("%s", (input, phone) => expect(normalizePhone(input)).toBe(phone));
  it.each(["", "12345", "0241234", "+23324123456", "+2332412345678", "phone"])("refuses %s", (input) => expect(normalizePhone(input)).toBeNull());
});

describe("profile", () => {
  it("normalises and turns blanks into null", () => {
    const v = profileSchema.parse({ displayName: " Alder ", contactPhone: "024 123 4567", digitalAddress: "ga-123-4567", primaryColor: "#2F5D74", tagline: "", isPublished: "on" });
    expect(v).toMatchObject({ displayName: "Alder", contactPhone: "+233241234567", digitalAddress: "GA-123-4567", primaryColor: "#2f5d74", tagline: null, isPublished: true });
  });
  it.each([
    { primaryColor: "#b69a61" },
    { accentColor: "#ffffff" },
    { contactPhone: "123" },
    { digitalAddress: "Accra" },
    { mapUrl: "javascript:alert(1)" },
    { mapUrl: "http://maps.test" },
    { contactEmail: "nope" },
    { displayName: "x" },
  ])("refuses %j", (change) => expect(profileSchema.safeParse({ displayName: "Alder", ...change }).success).toBe(false));
});

describe("booking rules", () => {
  it("keeps a whole-number percentage and clears unused values", () => {
    expect(operationalSettingsSchema.parse(rules).depositValue).toBe(0);
    expect(operationalSettingsSchema.parse({ ...rules, depositPolicy: "percent", depositValue: "30" }).depositValue).toBe(30);
    expect(operationalSettingsSchema.parse({ ...rules, depositPolicy: "full", depositValue: "99" }).depositValue).toBe(0);
    expect(operationalSettingsSchema.parse({ ...rules, depositPolicy: "none", depositValue: "" }).depositValue).toBe(0);
  });
  it.each([
    { holdDays: "0" },
    { holdDays: "15" },
    { holdExtensionMax: "4" },
    { minPaidPercentForCheckin: "101" },
    { depositPolicy: "percent", depositValue: "" },
    { depositPolicy: "percent", depositValue: "101" },
    { depositPolicy: "other" },
  ])("refuses %j", (change) => expect(operationalSettingsSchema.safeParse({ ...rules, ...change }).success).toBe(false));
  it("saves the hold in hours for the member's hostel only", async () => {
    await updateOperationalSettings("hostel-a", idle, form({ ...rules, tenant_id: OTHER, booking_requires_verified_email: "false" }));
    expect(h.calls[0].payload).toMatchObject({ hold_duration_hours: 120, deposit_value: 0 });
    expect(h.calls[0].payload).not.toHaveProperty("tenant_id");
    expect(h.calls[0].payload).not.toHaveProperty("booking_requires_verified_email");
    expect(h.calls[0].filters).toEqual([["tenant_id", TENANT]]);
  });
});

describe("permission sets", () => {
  it("labels every delegable permission and nothing else", () => {
    expect(PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key)).sort()).toEqual([...DELEGABLE_PERMISSIONS].sort());
  });
  it.each(["staff.manage", "payments.configure", "made.up"])("refuses %s", (permission) =>
    expect(permissionSetSchema.safeParse({ name: "Deputy", permissions: [permission] }).success).toBe(false),
  );
  it("needs a permission", () => expect(permissionSetSchema.safeParse({ name: "Empty", permissions: [] }).success).toBe(false));
  it.each([["Night Porter", "night_porter"], ["24h desk", "set_24h_desk"], ["Caissière", "caissiere"]])("key for %s", (name, key) => {
    expect(permissionSetKey(name)).toBe(key);
    expect(key).toMatch(/^[a-z][a-z0-9_]{1,40}$/);
  });
  it("creates for the member's hostel with every ticked permission", async () => {
    await createPermissionSet("hostel-a", idle, form({ name: "Night Porter", permissions: ["inventory.read", "checkin.manage"], tenant_id: OTHER, is_system: "true" }));
    expect(h.calls[0].payload).toEqual({ tenant_id: TENANT, key: "night_porter", name: "Night Porter", description: null, permissions: ["inventory.read", "checkin.manage"] });
  });
  it("can never touch a system set", async () => {
    await updatePermissionSet("hostel-a", idle, form({ id: SET, name: "Porter", permissions: ["inventory.read"] }));
    await deletePermissionSet("hostel-a", idle, form({ id: SET }));
    for (const call of h.calls) expect(call.filters).toEqual([["tenant_id", TENANT], ["id", SET], ["is_system", false]]);
  });
  it("explains a set still in use", async () => {
    h.results.push({ data: null, error: { code: "23503" } });
    expect((await deletePermissionSet("hostel-a", idle, form({ id: SET }))).message).toMatch(/still use/);
  });
});

describe("authorization", () => {
  it("profile and rules need settings.manage, not settings.read", async () => {
    h.access = member(["settings.read"]);
    expect((await updateHostelProfile("hostel-a", idle, form({ displayName: "Alder" }))).message).toMatch(/permission/);
    expect((await updateOperationalSettings("hostel-a", idle, form(rules))).message).toMatch(/permission/);
    expect(h.calls).toEqual([]);
  });
  it("permission sets need staff.manage", async () => {
    h.access = member(["settings.manage", "inventory.manage"]);
    const data = form({ id: SET, name: "Porter", permissions: ["inventory.read"] });
    for (const action of [createPermissionSet, updatePermissionSet, deletePermissionSet]) {
      expect((await action("hostel-a", idle, data)).message).toMatch(/permission/);
    }
    expect(h.calls).toEqual([]);
  });
  it("reports a row RLS hides as gone", async () => {
    h.results.push({ data: [], error: null });
    expect((await updateHostelProfile("hostel-a", idle, form({ displayName: "Alder" }))).message).toMatch(/no longer exists/);
    expect(h.revalidate).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SET = "99999999-0000-4000-8000-0000000000a9";
const MEMBER = "70000000-0000-4000-8000-0000000000a1";

const h = vi.hoisted(() => ({
  rpc: [] as { name: string; args: Record<string, unknown> }[],
  rpcResult: null as null | { data: unknown; error: { code: string; message?: string } | null },
  row: null as null | { id: string; invited_email: string | null },
  filters: [] as [string, unknown][],
  invite: vi.fn(),
  platformAdmin: true,
  surface: "app",
  session: vi.fn(async () => ({ id: "user" })),
  access: null as null | { tenantId: string; slug: string; name: string; role: string; permissions: string[] },
  revalidate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidate }));
vi.mock("@/lib/server/auth", () => ({ requireStaffSession: h.session }));
vi.mock("@/lib/server/tenant/context", () => ({ getTenantContext: async () => ({ surface: h.surface }) }));
vi.mock("@/lib/server/authz", async () => {
  const { hasPermission } = await import("@/lib/permissions");
  class AuthorizationError extends Error {}
  return {
    AuthorizationError,
    isPlatformAdmin: async () => h.platformAdmin,
    requireTenantMember: async () => {
      if (!h.access) throw new AuthorizationError("Not found");
      return h.access;
    },
    requirePermission: (access: never, permission: never) => {
      if (!hasPermission(access, permission)) throw new AuthorizationError("Forbidden");
    },
  };
});
vi.mock("@/lib/server/supabase/admin", () => ({
  getServiceRoleClient: () => ({ auth: { admin: { inviteUserByEmail: h.invite } } }),
}));
vi.mock("@/lib/server/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      h.rpc.push({ name, args });
      return h.rpcResult ?? { data: "new-id", error: null };
    },
    from() {
      const query = {
        select: () => query,
        eq(column: string, value: unknown) { h.filters.push([column, value]); return query; },
        maybeSingle: async () => ({ data: h.row, error: null }),
      };
      return query;
    },
  }),
}));

import {
  changeMemberRole,
  createTenant,
  inviteFirstAdmin,
  inviteStaff,
  resendFirstAdminInvite,
  resendStaffInvitation,
  revokeMember,
  setTenantStatus,
} from "@/lib/server/actions/provisioning-actions";

const idle = { status: "idle" as const };
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const hostel = { name: "Alder House", slug: "Alder-House", referencePrefix: "ald", adminEmail: "Owner@Example.test" };
const staffInvite = { email: "New@Example.test", role: "staff", permissionSetId: SET };
const admin = () => ({ tenantId: TENANT, slug: "hostel-a", name: "Hostel A", role: "hostel_admin", permissions: [] });
const staff = () => ({ tenantId: TENANT, slug: "hostel-a", name: "Hostel A", role: "staff", permissions: ["inventory.manage"] });

beforeEach(() => {
  h.rpc.length = 0;
  h.filters.length = 0;
  h.rpcResult = null;
  h.row = null;
  h.platformAdmin = true;
  h.surface = "app";
  h.access = admin();
  h.invite.mockReset();
  h.invite.mockResolvedValue({ error: null });
  h.session.mockClear();
  h.session.mockImplementation(async () => ({ id: "user" }));
  h.revalidate.mockClear();
});

describe("platform actions", () => {
  it("creates a hostel through the RPC, then sends the invitation", async () => {
    const result = await createTenant(idle, form(hostel));
    expect(result).toMatchObject({ status: "success", id: "new-id", emailSent: true });
    expect(h.rpc[0]).toMatchObject({
      name: "create_tenant",
      args: { p_slug: "alder-house", p_reference_prefix: "ALD", p_admin_email: "owner@example.test" },
    });
    expect(h.invite).toHaveBeenCalledWith("owner@example.test");
    expect(h.session).toHaveBeenCalledWith("/platform");
  });

  it("refuses anyone who is not a platform admin before any write", async () => {
    h.platformAdmin = false;
    for (const action of [createTenant, setTenantStatus, inviteFirstAdmin, resendFirstAdminInvite]) {
      expect((await action(idle, form(hostel))).message).toMatch(/permission/);
    }
    expect(h.rpc).toEqual([]);
    expect(h.invite).not.toHaveBeenCalled();
  });

  it("works only on the app host", async () => {
    h.surface = "tenant";
    expect((await createTenant(idle, form(hostel))).status).toBe("error");
    expect(h.session).not.toHaveBeenCalled();
  });

  it("lets the MFA redirect propagate", async () => {
    h.session.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(createTenant(idle, form(hostel))).rejects.toThrow("NEXT_REDIRECT");
    expect(h.rpc).toEqual([]);
  });

  it.each([{ slug: "app" }, { slug: "x" }, { slug: "Bad Slug!" }, { referencePrefix: "A1" }, { adminEmail: "nope" }, { name: "x" }])("refuses %j", async (change) => {
    const result = await createTenant(idle, form({ ...hostel, ...change }));
    expect(Object.keys(result.fieldErrors ?? {})).toHaveLength(1);
    expect(h.rpc).toEqual([]);
  });

  it("sends no email when the hostel could not be created", async () => {
    h.rpcResult = { data: null, error: { code: "23505" } };
    expect((await createTenant(idle, form(hostel))).message).toMatch(/already in use/);
    expect(h.invite).not.toHaveBeenCalled();
  });

  it("keeps the hostel and reports when the email fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    h.invite.mockResolvedValue({ error: { code: "over_email_send_rate_limit", status: 429, message: "owner@example.test limited" } });
    const result = await createTenant(idle, form(hostel));
    expect(result).toMatchObject({ status: "success", emailSent: false });
    expect(result.message).toMatch(/Resend/);
    expect(JSON.stringify(log.mock.calls)).not.toContain("owner@example.test");
    log.mockRestore();
  });

  it("needs a reason to change status", async () => {
    expect((await setTenantStatus(idle, form({ tenantId: TENANT, status: "suspended", reason: "" }))).fieldErrors).toHaveProperty("reason");
    expect(h.rpc).toEqual([]);
  });

  it("refuses archiving", async () => {
    expect((await setTenantStatus(idle, form({ tenantId: TENANT, status: "archived", reason: "Closing" }))).fieldErrors).toHaveProperty("status");
    expect(h.rpc).toEqual([]);
  });

  it("re-sends only an open invitation for that address", async () => {
    h.rpcResult = { data: [{ membership_id: MEMBER, email: "owner@example.test", status: "invited" }], error: null };
    expect((await resendFirstAdminInvite(idle, form({ tenantId: TENANT, email: "owner@example.test" }))).status).toBe("success");
    expect(h.invite).toHaveBeenCalledOnce();

    h.invite.mockClear();
    expect((await resendFirstAdminInvite(idle, form({ tenantId: TENANT, email: "someone@else.test" }))).status).toBe("error");
    h.rpcResult = { data: [{ membership_id: MEMBER, email: "owner@example.test", status: "active" }], error: null };
    expect((await resendFirstAdminInvite(idle, form({ tenantId: TENANT, email: "owner@example.test" }))).status).toBe("error");
    expect(h.invite).not.toHaveBeenCalled();
  });
});

describe("staff invitations", () => {
  it("uses the membership's hostel, ignoring the form", async () => {
    await inviteStaff("hostel-a", idle, form({ ...staffInvite, tenantId: OTHER, p_tenant_id: OTHER }));
    expect(h.rpc[0]).toMatchObject({ name: "invite_staff_member", args: { p_tenant_id: TENANT, p_email: "new@example.test", p_role: "staff", p_permission_set_id: SET } });
    expect(h.invite).toHaveBeenCalledWith("new@example.test");
  });

  it("needs staff.manage", async () => {
    h.access = staff();
    for (const action of [inviteStaff, resendStaffInvitation, changeMemberRole, revokeMember]) {
      expect((await action("hostel-a", idle, form(staffInvite))).message).toMatch(/permission/);
    }
    expect(h.rpc).toEqual([]);
    expect(h.invite).not.toHaveBeenCalled();
  });

  it("sends no email when the RPC refuses", async () => {
    h.rpcResult = { data: null, error: { code: "42501" } };
    expect((await inviteStaff("hostel-a", idle, form(staffInvite))).message).toMatch(/permission/);
    expect(h.invite).not.toHaveBeenCalled();
  });

  it("does not reveal whether the address already has an account", async () => {
    const sent = await inviteStaff("hostel-a", idle, form(staffInvite));
    h.invite.mockResolvedValue({ error: { code: "email_exists", status: 422, message: "exists" } });
    const existing = await inviteStaff("hostel-a", idle, form(staffInvite));
    expect(existing).toEqual(sent);
  });

  it("checks role and permission set together", async () => {
    expect((await inviteStaff("hostel-a", idle, form({ email: "a@example.test", role: "staff" }))).fieldErrors).toHaveProperty("permissionSetId");
    expect((await inviteStaff("hostel-a", idle, form({ email: "a@example.test", role: "hostel_admin", permissionSetId: SET }))).fieldErrors).toHaveProperty("permissionSetId");
    expect(h.rpc).toEqual([]);
  });

  it("re-sends only an open invitation of this hostel", async () => {
    h.row = { id: MEMBER, invited_email: "new@example.test" };
    expect((await resendStaffInvitation("hostel-a", idle, form({ membershipId: MEMBER }))).status).toBe("success");
    expect(h.filters).toEqual([["tenant_id", TENANT], ["id", MEMBER], ["status", "invited"]]);
    expect(h.invite).toHaveBeenCalledWith("new@example.test");

    h.invite.mockClear();
    h.row = null;
    expect((await resendStaffInvitation("hostel-a", idle, form({ membershipId: MEMBER }))).status).toBe("error");
    expect(h.invite).not.toHaveBeenCalled();
  });

  it("changes a role through the RPC", async () => {
    await changeMemberRole("hostel-a", idle, form({ membershipId: MEMBER, role: "hostel_admin" }));
    expect(h.rpc[0]).toEqual({ name: "change_member_role", args: { p_membership_id: MEMBER, p_role: "hostel_admin", p_permission_set_id: null } });
  });

  it("revokes with a reason and maps the last-admin rule", async () => {
    expect((await revokeMember("hostel-a", idle, form({ membershipId: MEMBER, reason: "" }))).fieldErrors).toHaveProperty("reason");
    h.rpcResult = { data: null, error: { code: "23514" } };
    expect((await revokeMember("hostel-a", idle, form({ membershipId: MEMBER, reason: "Left" }))).message).toMatch(/at least one active admin/);
  });
});

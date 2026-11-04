/**
 * Permission catalog (docs/RBAC_MATRIX.md §2). Must match app.permission_catalog() in
 * supabase/migrations; tests/unit/permissions.test.ts fails if they drift apart.
 */
export const PERMISSIONS = [
  "bookings.read",
  "bookings.review",
  "bookings.cancel",
  "bookings.create_on_behalf",
  "allocations.read",
  "allocations.manage",
  "inventory.read",
  "inventory.manage",
  "pricing.manage",
  "residents.read",
  "residents.read_sensitive",
  "residents.manage",
  "checkin.manage",
  "finance.read",
  "finance.invoice_manage",
  "finance.record_payment",
  "finance.refund_request",
  "finance.refund_approve",
  "maintenance.read",
  "maintenance.manage",
  "announcements.manage",
  "reports.read",
  "reports.export",
  "settings.read",
  "settings.manage",
  "payments.configure",
  "staff.manage",
  "audit.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type MembershipRole = "hostel_admin" | "staff";

/** A signed-in user's access to one tenant, as returned by public.my_memberships(). */
export interface TenantAccess {
  tenantId: string;
  slug: string;
  name: string;
  role: MembershipRole;
  permissions: readonly string[];
}

export function hasPermission(access: TenantAccess | null | undefined, permission: Permission): boolean {
  if (!access) return false;
  return access.role === "hostel_admin" || access.permissions.includes(permission);
}

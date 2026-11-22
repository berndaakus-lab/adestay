import "server-only";
import type { Permission, TenantAccess } from "@/lib/permissions";
import { requireStaffSession } from "@/lib/server/auth";
import { AuthorizationError, requirePermission, requireTenantMember } from "@/lib/server/authz";
import { getTenantContext } from "@/lib/server/tenant/context";

/**
 * Layouts do not protect Server Actions, so each staff action calls this first: app host, session
 * + MFA (redirects when needed, so the redirect must propagate), membership and permission.
 * Returns null when the caller may not act.
 */
export async function authorizeStaffAction(tenantSlug: string, permission: Permission): Promise<TenantAccess | null> {
  if (!/^[a-z0-9-]{3,40}$/.test(tenantSlug)) return null;
  if ((await getTenantContext()).surface !== "app") return null;
  await requireStaffSession(`/t/${tenantSlug}`);
  try {
    const access = await requireTenantMember(tenantSlug);
    requirePermission(access, permission, "action");
    return access;
  } catch (error) {
    if (error instanceof AuthorizationError) return null;
    throw error;
  }
}

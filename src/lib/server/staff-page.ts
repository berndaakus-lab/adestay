import "server-only";
import { notFound } from "next/navigation";
import { hasPermission, type Permission, type TenantAccess } from "@/lib/permissions";
import { requireStaffSession } from "@/lib/server/auth";
import { AuthorizationError, requireTenantMember } from "@/lib/server/authz";

/**
 * Guard for a staff page: session + MFA, membership, and any one of the given permissions.
 * Everything else is a 404, so a page's existence is not revealed (RBAC_MATRIX §5).
 */
export async function requireStaffPage(tenantSlug: string, path: string, anyOf?: Permission[]): Promise<TenantAccess> {
  await requireStaffSession(`/t/${tenantSlug}${path}`);
  let access: TenantAccess;
  try {
    access = await requireTenantMember(tenantSlug);
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    throw error;
  }
  if (anyOf && !anyOf.some((permission) => hasPermission(access, permission))) notFound();
  return access;
}

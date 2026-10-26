import "server-only";
import { cache } from "react";
import { hasPermission, type Permission, type TenantAccess } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";

/**
 * Server-side authorization (docs/RBAC_MATRIX.md §5). This layer gives early, clear failures;
 * row level security in the database remains the final authority.
 */
export class AuthorizationError extends Error {
  /** 404 for reads (does not reveal that the resource exists), 403 for actions. */
  constructor(
    readonly status: 403 | 404,
    message: string,
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** The signed-in user's active memberships, read once per request (revocation is immediate). */
export const getMyMemberships = cache(async (): Promise<TenantAccess[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_memberships");
  if (error) throw new Error(`Could not load memberships: ${error.message}`);
  return (data ?? []).map(
    (row: { tenant_id: string; slug: string; name: string; role: TenantAccess["role"]; permissions: string[] }) => ({
      tenantId: row.tenant_id,
      slug: row.slug,
      name: row.name,
      role: row.role,
      permissions: row.permissions ?? [],
    }),
  );
});

export const isPlatformAdmin = cache(async (): Promise<boolean> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("am_i_platform_admin");
  if (error) throw new Error(`Could not check platform admin: ${error.message}`);
  return data === true;
});

/** Staff routes /t/{tenantSlug}/...: the user must be an active member of that tenant. */
export async function requireTenantMember(tenantSlug: string): Promise<TenantAccess> {
  const access = (await getMyMemberships()).find((m) => m.slug === tenantSlug.toLowerCase());
  if (!access) throw new AuthorizationError(404, "Not found");
  return access;
}

/** Throws unless the access grants the permission. Use mode "read" for pages, "action" for mutations. */
export function requirePermission(access: TenantAccess | null | undefined, permission: Permission, mode: "read" | "action" = "action"): void {
  if (!hasPermission(access, permission)) {
    throw new AuthorizationError(mode === "read" ? 404 : 403, mode === "read" ? "Not found" : "Forbidden");
  }
}

export async function requirePlatformAdmin(): Promise<void> {
  if (!(await isPlatformAdmin())) throw new AuthorizationError(404, "Not found");
}

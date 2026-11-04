import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { StaffShell } from "@/components/staff/staff-shell";
import { requireStaffSession } from "@/lib/server/auth";
import { AuthorizationError, getMyMemberships, requireTenantMember } from "@/lib/server/authz";
import { getTenantContext } from "@/lib/server/tenant/context";
import { visibleStaffNav } from "@/lib/staff-nav";

// Staff workspace for one hostel: signed in, MFA where required, and an active member of
// this hostel (404 otherwise, so the existence of other hostels is not revealed).
async function Workspace({ params, children }: { params: LayoutProps<"/t/[tenantSlug]">["params"]; children: ReactNode }) {
  if ((await getTenantContext()).surface !== "app") notFound();
  const { tenantSlug } = await params;
  const user = await requireStaffSession(`/t/${tenantSlug}`);

  let access;
  try {
    access = await requireTenantMember(tenantSlug);
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    throw error;
  }
  const memberships = await getMyMemberships();

  return (
    <StaffShell
      tenantSlug={access.slug}
      tenantName={access.name}
      roleLabel={access.role === "hostel_admin" ? "Hostel admin" : "Staff"}
      userEmail={user.email}
      nav={visibleStaffNav(access)}
      current=""
      canSwitchHostel={memberships.length > 1}
    >
      {children}
    </StaffShell>
  );
}

export default function WorkspaceLayout({ children, params }: LayoutProps<"/t/[tenantSlug]">) {
  return (
    <Suspense fallback={<div className="flex-1 bg-background" aria-busy="true" />}>
      <Workspace params={params}>{children}</Workspace>
    </Suspense>
  );
}

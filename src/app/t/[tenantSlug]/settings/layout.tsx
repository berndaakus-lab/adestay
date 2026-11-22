import { Suspense, type ReactNode } from "react";
import { SectionNav } from "@/components/staff/section-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { hasPermission } from "@/lib/permissions";
import { requireStaffPage } from "@/lib/server/staff-page";

async function SettingsFrame({ params, children }: { params: LayoutProps<"/t/[tenantSlug]/settings">["params"]; children: ReactNode }) {
  const { tenantSlug } = await params;
  const access = await requireStaffPage(tenantSlug, "/settings", ["settings.read", "settings.manage", "staff.manage"]);
  const base = `/t/${access.slug}/settings`;
  const canSeeSettings = hasPermission(access, "settings.read") || hasPermission(access, "settings.manage");
  const canManageStaff = hasPermission(access, "staff.manage");
  const items = [
    { href: base, label: "Profile" },
    ...(canSeeSettings ? [{ href: `${base}/operations`, label: "Booking rules" }] : []),
    ...(canManageStaff ? [{ href: `${base}/team`, label: "Team" }, { href: `${base}/permissions`, label: "Permission sets" }] : []),
  ];
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <p className="eyebrow mb-3">Settings</p>
        <h1 className="text-4xl">Hostel settings</h1>
      </div>
      <SectionNav label="Settings sections" items={items} />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>{children}</Suspense>
    </div>
  );
}

export default function SettingsLayout({ params, children }: LayoutProps<"/t/[tenantSlug]/settings">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-64 w-full max-w-4xl" />}>
      <SettingsFrame params={params}>{children}</SettingsFrame>
    </Suspense>
  );
}

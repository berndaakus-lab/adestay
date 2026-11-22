import { Suspense, type ReactNode } from "react";
import { SectionNav } from "@/components/staff/section-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { hasPermission } from "@/lib/permissions";
import { INVENTORY_PAGE_PERMISSIONS } from "@/lib/staff-nav";
import { requireStaffPage } from "@/lib/server/staff-page";

async function InventoryFrame({ params, children }: { params: LayoutProps<"/t/[tenantSlug]/inventory">["params"]; children: ReactNode }) {
  const { tenantSlug } = await params;
  const access = await requireStaffPage(tenantSlug, "/inventory", INVENTORY_PAGE_PERMISSIONS);
  const base = `/t/${access.slug}/inventory`;
  const canSeeRooms = hasPermission(access, "inventory.read") || hasPermission(access, "inventory.manage");
  const items = [
    ...(canSeeRooms ? [{ href: base, label: "Capacity" }] : []),
    { href: `${base}/periods`, label: "Periods" },
    { href: `${base}/room-types`, label: "Room types" },
    ...(canSeeRooms ? [{ href: `${base}/rooms`, label: "Rooms and beds" }] : []),
    { href: `${base}/prices`, label: "Prices" },
    ...(hasPermission(access, "inventory.manage") ? [{ href: `${base}/import`, label: "Import CSV" }] : []),
  ];
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <p className="eyebrow mb-3">Inventory</p>
        <h1 className="text-4xl">Rooms and beds</h1>
      </div>
      <SectionNav label="Inventory sections" items={items} />
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 md:p-6">
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>{children}</Suspense>
      </section>
    </div>
  );
}

export default function InventoryLayout({ params, children }: LayoutProps<"/t/[tenantSlug]/inventory">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-64 w-full max-w-5xl" />}>
      <InventoryFrame params={params}>{children}</InventoryFrame>
    </Suspense>
  );
}

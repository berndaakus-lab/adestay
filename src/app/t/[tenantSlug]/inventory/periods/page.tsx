import type { Metadata } from "next";
import { PeriodsPanel, type PeriodRow } from "@/components/staff/inventory/periods";
import { hasPermission } from "@/lib/permissions";
import { INVENTORY_PAGE_PERMISSIONS } from "@/lib/staff-nav";
import { requireStaffPage } from "@/lib/server/staff-page";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";

export const metadata: Metadata = { title: "Booking periods" };

export default async function PeriodsPage({ params }: PageProps<"/t/[tenantSlug]/inventory/periods">) {
  const { tenantSlug } = await params;
  const access = await requireStaffPage(tenantSlug, "/inventory/periods", INVENTORY_PAGE_PERMISSIONS);
  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("booking_periods")
    .select("id, name, kind, starts_on, ends_on, booking_opens_at, booking_closes_at, status")
    .eq("tenant_id", access.tenantId)
    .order("starts_on", { ascending: false });
  if (error) throw new Error(`Could not load periods (${error.code})`);
  return (
    <>
      <h2 className="font-heading text-xl">Booking periods</h2>
      <PeriodsPanel tenantSlug={access.slug} periods={(data ?? []) as PeriodRow[]} canManage={hasPermission(access, "inventory.manage")} />
    </>
  );
}

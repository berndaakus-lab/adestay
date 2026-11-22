import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PricesPanel, type PriceRow } from "@/components/staff/inventory/prices";
import { hasPermission } from "@/lib/permissions";
import { firstParam } from "@/lib/search-params";
import { INVENTORY_PAGE_PERMISSIONS } from "@/lib/staff-nav";
import { requireStaffPage } from "@/lib/server/staff-page";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";

export const metadata: Metadata = { title: "Prices" };

export default async function PricesPage({ params, searchParams }: PageProps<"/t/[tenantSlug]/inventory/prices">) {
  const { tenantSlug } = await params;
  const access = await requireStaffPage(tenantSlug, "/inventory/prices", INVENTORY_PAGE_PERMISSIONS);
  const requested = firstParam((await searchParams).period);
  const db = await createSupabaseServerClient();
  const [periodsResult, typesResult, pricesResult] = await Promise.all([
    db.from("booking_periods").select("id, name, status").eq("tenant_id", access.tenantId).neq("status", "archived").order("starts_on", { ascending: false }),
    db.from("room_types").select("id, name").eq("tenant_id", access.tenantId).order("sort_order").order("name"),
    db.from("room_type_prices").select("id, room_type_id, booking_period_id, amount_minor, deposit_minor").eq("tenant_id", access.tenantId),
  ]);
  for (const result of [periodsResult, typesResult, pricesResult]) {
    if (result.error) throw new Error(`Could not load prices (${result.error.code})`);
  }
  const periods = periodsResult.data ?? [];
  const types = typesResult.data ?? [];
  const base = `/t/${access.slug}/inventory`;

  if (!periods.length || !types.length) {
    return (
      <>
        <h2 className="font-heading text-xl">Prices</h2>
        <EmptyState
          title="Nothing to price yet"
          description="Prices are set per room type and booking period, so add both first."
          action={
            <Link href={`${base}/${periods.length ? "room-types" : "periods"}`} className="text-sm text-primary underline decoration-brass underline-offset-4">
              {periods.length ? "Go to room types" : "Go to booking periods"}
            </Link>
          }
        />
      </>
    );
  }

  const period = periods.find((p) => p.id === requested) ?? periods[0];
  const rows: PriceRow[] = types.map((type) => {
    const price = (pricesResult.data ?? []).find((p) => p.room_type_id === type.id && p.booking_period_id === period.id);
    return {
      roomTypeId: type.id,
      roomTypeName: type.name,
      priceId: price?.id ?? null,
      // bigint pesewas; limited to GH₵ 1,000,000 by the database, so safe as a number.
      amountMinor: price ? Number(price.amount_minor) : null,
      depositMinor: price ? Number(price.deposit_minor) : null,
    };
  });

  return (
    <>
      <h2 className="font-heading text-xl">Prices</h2>
      <nav aria-label="Booking period" className="flex flex-wrap gap-2">
        {periods.map((p) => (
          <Link
            key={p.id}
            href={`${base}/prices?period=${p.id}`}
            aria-current={p.id === period.id ? "page" : undefined}
            className="inline-flex min-h-11 items-center rounded-sm border border-input px-3 text-sm aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
          >
            {p.name}
          </Link>
        ))}
      </nav>
      <PricesPanel tenantSlug={access.slug} periodId={period.id} rows={rows} canManage={hasPermission(access, "pricing.manage")} />
    </>
  );
}

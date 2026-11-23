import { Check, Circle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDay } from "@/lib/inventory-display";
import { hasPermission } from "@/lib/permissions";
import { INVENTORY_PAGE_PERMISSIONS } from "@/lib/staff-nav";
import { requireStaffPage } from "@/lib/server/staff-page";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";

export const metadata: Metadata = { title: "Capacity" };

interface CapacityRow {
  room_type_id: string;
  booking_period_id: string;
  total_beds: number;
  out_of_service_beds: number;
  blocked_beds: number;
  sellable_beds: number;
}

interface AvailabilityRow {
  room_type_id: string;
  booking_period_id: string;
  reserved_beds: number;
  remaining_beds: number;
  overcommitted: boolean;
}

function SetupStep({ done, href, children }: { done: boolean; href: string; children: string }) {
  return (
    <li className="flex items-center gap-3 text-sm">
      {done ? <Check className="size-4 shrink-0 text-success" aria-hidden="true" /> : <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
      <span className="sr-only">{done ? "Done: " : "To do: "}</span>
      <Link href={href} className="inline-flex min-h-11 items-center text-primary underline decoration-brass underline-offset-4">
        {children}
      </Link>
    </li>
  );
}

export default async function CapacityPage({ params }: PageProps<"/t/[tenantSlug]/inventory">) {
  const { tenantSlug } = await params;
  const access = await requireStaffPage(tenantSlug, "/inventory", INVENTORY_PAGE_PERMISSIONS);
  const base = `/t/${access.slug}/inventory`;
  if (!hasPermission(access, "inventory.read") && !hasPermission(access, "inventory.manage")) redirect(`${base}/prices`);

  const db = await createSupabaseServerClient();
  const [capacity, availability, periods, types, prices] = await Promise.all([
    db.rpc("room_type_capacity", { p_tenant_id: access.tenantId }),
    db.rpc("room_type_availability", { p_tenant_id: access.tenantId }),
    db.from("booking_periods").select("id, name, starts_on, ends_on, status").eq("tenant_id", access.tenantId).neq("status", "archived").order("starts_on", { ascending: false }),
    db.from("room_types").select("id, name, sort_order").eq("tenant_id", access.tenantId).order("sort_order").order("name"),
    db.from("room_type_prices").select("id", { count: "exact", head: true }).eq("tenant_id", access.tenantId),
  ]);
  for (const result of [capacity, availability, periods, types, prices]) {
    if (result.error) throw new Error(`Could not load capacity (${result.error.code})`);
  }
  const live = (availability.data ?? []) as AvailabilityRow[];
  const rows = ((capacity.data ?? []) as CapacityRow[]).map((row) => {
    const match = live.find((a) => a.room_type_id === row.room_type_id && a.booking_period_id === row.booking_period_id);
    return { ...row, reserved_beds: match?.reserved_beds ?? 0, remaining_beds: match?.remaining_beds ?? row.sellable_beds, overcommitted: match?.overcommitted ?? false };
  });
  const periodRows = periods.data ?? [];
  const typeRows = types.data ?? [];
  const hasBeds = rows.some((row) => row.total_beds > 0);
  const ready = periodRows.length > 0 && typeRows.length > 0 && hasBeds && (prices.count ?? 0) > 0;

  return (
    <div className="flex flex-col gap-8">
      {ready ? null : (
        <div className="flex flex-col gap-2">
          <h2 className="font-heading text-xl">Set up this hostel</h2>
          <ol className="flex flex-col">
            <SetupStep done={periodRows.length > 0} href={`${base}/periods`}>Add a booking period</SetupStep>
            <SetupStep done={typeRows.length > 0} href={`${base}/room-types`}>Add room types</SetupStep>
            <SetupStep done={hasBeds} href={`${base}/rooms`}>Add rooms and beds (or import a CSV)</SetupStep>
            <SetupStep done={(prices.count ?? 0) > 0} href={`${base}/prices`}>Set prices</SetupStep>
          </ol>
        </div>
      )}
      {periodRows.map((period) => {
        const lines = typeRows.flatMap((type) => {
          const row = rows.find((r) => r.booking_period_id === period.id && r.room_type_id === type.id);
          return row ? [{ name: type.name, ...row }] : [];
        });
        const sum = (key: "total_beds" | "out_of_service_beds" | "blocked_beds" | "sellable_beds" | "reserved_beds" | "remaining_beds") =>
          lines.reduce((total, line) => total + line[key], 0);
        return (
          <div key={period.id} className="flex flex-col gap-3">
            <div>
              <h2 className="font-heading text-xl break-words">{period.name}</h2>
              <p className="text-sm text-muted-foreground">
                {formatDay(period.starts_on)} to {formatDay(period.ends_on)}. <span className="font-semibold text-foreground">{sum("sellable_beds")} sellable {sum("sellable_beds") === 1 ? "bed" : "beds"}.</span>
              </p>
            </div>
            {lines.length ? (
              <>
                <ul className="flex flex-col divide-y divide-border rounded-sm border border-border md:hidden">
                  {lines.map((line) => (
                    <li key={line.room_type_id} className="flex flex-col gap-1 p-3 text-sm">
                      <span className="flex justify-between gap-2 font-semibold">
                        <span className="break-words">{line.name}</span>
                        <span className="shrink-0 tabular-nums">{line.sellable_beds} sellable</span>
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {line.total_beds} beds · {line.out_of_service_beds} out of service · {line.blocked_beds} blocked
                      </span>
                      <span className="tabular-nums">
                        {line.reserved_beds} reserved · {line.remaining_beds} left
                        {line.overcommitted ? <span className="ml-2 font-semibold text-danger">Overbooked</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Room type</TableHead>
                        <TableHead className="text-right">Beds</TableHead>
                        <TableHead className="text-right">Out of service</TableHead>
                        <TableHead className="text-right">Blocked</TableHead>
                        <TableHead className="text-right">Sellable</TableHead>
                        <TableHead className="text-right">Reserved</TableHead>
                        <TableHead className="text-right">Left</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line) => (
                        <TableRow key={line.room_type_id}>
                          <TableCell className="font-medium">{line.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{line.total_beds}</TableCell>
                          <TableCell className="text-right tabular-nums">{line.out_of_service_beds}</TableCell>
                          <TableCell className="text-right tabular-nums">{line.blocked_beds}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">{line.sellable_beds}</TableCell>
                          <TableCell className="text-right tabular-nums">{line.reserved_beds}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {line.remaining_beds}
                            {line.overcommitted ? <span className="ml-2 text-danger">Overbooked</span> : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-semibold">Total</TableCell>
                        <TableCell className="text-right tabular-nums">{sum("total_beds")}</TableCell>
                        <TableCell className="text-right tabular-nums">{sum("out_of_service_beds")}</TableCell>
                        <TableCell className="text-right tabular-nums">{sum("blocked_beds")}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{sum("sellable_beds")}</TableCell>
                        <TableCell className="text-right tabular-nums">{sum("reserved_beds")}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{sum("remaining_beds")}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Add room types to see capacity.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

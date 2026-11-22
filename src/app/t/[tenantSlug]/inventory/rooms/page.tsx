import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { AddRoomButton } from "@/components/staff/inventory/rooms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { labelOf, UNIT_STATUSES, unitTone } from "@/lib/inventory-display";
import { hasPermission } from "@/lib/permissions";
import { firstParam } from "@/lib/search-params";
import { requireStaffPage } from "@/lib/server/staff-page";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";

export const metadata: Metadata = { title: "Rooms and beds" };

const PAGE_SIZE = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function RoomsPage({ params, searchParams }: PageProps<"/t/[tenantSlug]/inventory/rooms">) {
  const { tenantSlug } = await params;
  const access = await requireStaffPage(tenantSlug, "/inventory/rooms", ["inventory.read", "inventory.manage"]);
  const query = await searchParams;
  const search = (firstParam(query.q) ?? "").trim().slice(0, 20);
  const typeFilter = firstParam(query.type) ?? "";
  const page = Math.max(1, Math.min(1000, Number.parseInt(firstParam(query.page) ?? "1", 10) || 1));
  const canManage = hasPermission(access, "inventory.manage");

  const db = await createSupabaseServerClient();
  let rooms = db
    .from("rooms")
    .select("id, label, block, floor, status, room_type_id, beds(id, status)", { count: "exact" })
    .eq("tenant_id", access.tenantId)
    .order("label")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (search) rooms = rooms.ilike("label", `%${search.replace(/[\\%_]/g, "\\$&")}%`);
  if (UUID.test(typeFilter)) rooms = rooms.eq("room_type_id", typeFilter);

  const [roomResult, typeResult] = await Promise.all([
    rooms,
    db.from("room_types").select("id, name, occupancy").eq("tenant_id", access.tenantId).order("sort_order").order("name"),
  ]);
  if (roomResult.error) throw new Error(`Could not load rooms (${roomResult.error.code})`);
  if (typeResult.error) throw new Error(`Could not load room types (${typeResult.error.code})`);

  const rows = roomResult.data ?? [];
  const types = typeResult.data ?? [];
  const total = roomResult.count ?? rows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const base = `/t/${access.slug}/inventory`;
  const pageHref = (target: number) => {
    const next = new URLSearchParams();
    if (search) next.set("q", search);
    if (UUID.test(typeFilter)) next.set("type", typeFilter);
    if (target > 1) next.set("page", String(target));
    const text = next.toString();
    return `${base}/rooms${text ? `?${text}` : ""}`;
  };
  const filtered = Boolean(search) || UUID.test(typeFilter);
  const add = canManage && types.length ? <AddRoomButton tenantSlug={access.slug} types={types} /> : null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-xl">Rooms and beds</h2>
        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link href={`${base}/import`}>Import CSV</Link>
            </Button>
            {add}
          </div>
        ) : null}
      </div>

      {total > 0 || filtered ? (
        <form method="get" action={`${base}/rooms`} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="room-search" className="text-sm font-medium">
              Room number
            </label>
            <Input id="room-search" name="q" defaultValue={search} maxLength={20} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="room-type-filter" className="text-sm font-medium">
              Room type
            </label>
            <select id="room-type-filter" name="type" defaultValue={typeFilter} className="h-11 w-full rounded-sm border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <option value="">All room types</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline">
            Filter
          </Button>
        </form>
      ) : null}

      {rows.length ? (
        <ul className="divide-y divide-border rounded-sm border border-border">
          {rows.map((room) => {
            const beds = (room.beds ?? []) as { id: string; status: string }[];
            const inUse = beds.filter((bed) => bed.status !== "retired").length;
            const place = [room.block ? `Block ${room.block}` : null, room.floor ? `Floor ${room.floor}` : null].filter(Boolean).join(" · ");
            return (
              <li key={room.id}>
                <Link href={`${base}/rooms/${room.id}`} className="flex min-h-14 flex-col gap-1 p-3 hover:bg-muted sm:flex-row sm:items-center sm:justify-between">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-primary underline decoration-brass underline-offset-4">{room.label}</span>
                  <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    {types.find((type) => type.id === room.room_type_id)?.name}
                    {place ? ` · ${place}` : ""} · {inUse} {inUse === 1 ? "bed" : "beds"}
                    {room.status === "active" ? null : <Badge variant={unitTone(room.status)}>{labelOf(UNIT_STATUSES, room.status)}</Badge>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : filtered ? (
        <p className="text-sm text-muted-foreground">No rooms match this filter.</p>
      ) : (
        <EmptyState
          title="No rooms yet"
          description={types.length ? "Add rooms one by one, or import them all from a CSV file." : "Add a room type first, then its rooms."}
          action={types.length ? add : canManage ? (
            <Button asChild>
              <Link href={`${base}/room-types`}>Add a room type</Link>
            </Button>
          ) : null}
        />
      )}

      {pages > 1 ? (
        <nav aria-label="Room pages" className="flex items-center justify-between gap-3 text-sm">
          {page > 1 ? <Link href={pageHref(page - 1)} className="inline-flex min-h-11 items-center text-primary underline decoration-brass underline-offset-4">Previous</Link> : <span />}
          <span className="text-muted-foreground">
            Page {page} of {pages} · {total} rooms
          </span>
          {page < pages ? <Link href={pageHref(page + 1)} className="inline-flex min-h-11 items-center text-primary underline decoration-brass underline-offset-4">Next</Link> : <span />}
        </nav>
      ) : null}
    </>
  );
}

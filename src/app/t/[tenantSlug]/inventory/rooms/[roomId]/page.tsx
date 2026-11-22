import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { BedsPanel, RoomActions, type BedRow, type RoomValues } from "@/components/staff/inventory/rooms";
import { Badge } from "@/components/ui/badge";
import { labelOf, UNIT_STATUSES, unitTone } from "@/lib/inventory-display";
import { hasPermission } from "@/lib/permissions";
import { requireStaffPage } from "@/lib/server/staff-page";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";

export const metadata: Metadata = { title: "Room details" };

export default async function RoomPage({ params }: PageProps<"/t/[tenantSlug]/inventory/rooms/[roomId]">) {
  const { tenantSlug, roomId } = await params;
  const access = await requireStaffPage(tenantSlug, "/inventory/rooms", ["inventory.read", "inventory.manage"]);
  if (!z.uuid().safeParse(roomId).success) notFound();

  const db = await createSupabaseServerClient();
  const [roomResult, bedsResult, typesResult] = await Promise.all([
    db.from("rooms").select("id, room_type_id, label, block, floor, gender_policy_override, status, notes").eq("tenant_id", access.tenantId).eq("id", roomId).maybeSingle(),
    db.from("beds").select("id, label, status, bed_blocks(id, blocked, reason, released_at)").eq("tenant_id", access.tenantId).eq("room_id", roomId).order("label"),
    db.from("room_types").select("id, name, occupancy").eq("tenant_id", access.tenantId).order("sort_order").order("name"),
  ]);
  if (roomResult.error) throw new Error(`Could not load the room (${roomResult.error.code})`);
  if (bedsResult.error) throw new Error(`Could not load beds (${bedsResult.error.code})`);
  if (typesResult.error) throw new Error(`Could not load room types (${typesResult.error.code})`);
  if (!roomResult.data) notFound();

  const room = roomResult.data as RoomValues;
  const types = typesResult.data ?? [];
  const type = types.find((t) => t.id === room.room_type_id);
  const beds: BedRow[] = (bedsResult.data ?? []).map((bed) => ({
    id: bed.id,
    label: bed.label,
    status: bed.status,
    blocks: ((bed.bed_blocks ?? []) as { id: string; blocked: string; reason: string; released_at: string | null }[]).filter((block) => !block.released_at),
  }));
  const canManage = hasPermission(access, "inventory.manage");
  const place = [room.block ? `Block ${room.block}` : null, room.floor ? `Floor ${room.floor}` : null].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/t/${access.slug}/inventory/rooms`} className="self-start text-sm text-primary underline decoration-brass underline-offset-4">
        Back to rooms
      </Link>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 font-heading text-2xl">
            Room {room.label}
            <Badge variant={unitTone(room.status)} className="font-sans">
              {labelOf(UNIT_STATUSES, room.status)}
            </Badge>
          </h2>
          <p className="text-sm text-muted-foreground">
            {type?.name}
            {place ? ` · ${place}` : ""}
          </p>
          {room.notes ? <p className="mt-2 text-sm break-words">{room.notes}</p> : null}
        </div>
        {canManage ? <RoomActions tenantSlug={access.slug} room={room} types={types} /> : null}
      </div>
      <h3 className="font-heading text-xl">Beds</h3>
      <BedsPanel tenantSlug={access.slug} roomId={room.id} beds={beds} occupancy={type?.occupancy ?? 0} canManage={canManage} />
    </div>
  );
}

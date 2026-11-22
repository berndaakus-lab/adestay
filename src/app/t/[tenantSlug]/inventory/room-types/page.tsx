import type { Metadata } from "next";
import { RoomTypesPanel, type RoomTypeRow } from "@/components/staff/inventory/room-types";
import { hasPermission } from "@/lib/permissions";
import { INVENTORY_PAGE_PERMISSIONS } from "@/lib/staff-nav";
import { getPublicSupabaseEnv } from "@/lib/server/env";
import { requireStaffPage } from "@/lib/server/staff-page";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";

export const metadata: Metadata = { title: "Room types" };

export default async function RoomTypesPage({ params }: PageProps<"/t/[tenantSlug]/inventory/room-types">) {
  const { tenantSlug } = await params;
  const access = await requireStaffPage(tenantSlug, "/inventory/room-types", INVENTORY_PAGE_PERMISSIONS);
  const canSeeRooms = hasPermission(access, "inventory.read") || hasPermission(access, "inventory.manage");
  const db = await createSupabaseServerClient();
  const [types, photos, rooms] = await Promise.all([
    db
      .from("room_types")
      .select("id, name, slug, description, occupancy, gender_policy, amenities, is_published, sort_order")
      .eq("tenant_id", access.tenantId)
      .order("sort_order")
      .order("name"),
    db.from("room_type_photos").select("id, room_type_id, storage_path, alt_text, sort_order").eq("tenant_id", access.tenantId).order("sort_order"),
    // Staff without inventory.read cannot read rooms, so they simply see zero.
    canSeeRooms ? db.from("rooms").select("room_type_id").eq("tenant_id", access.tenantId).neq("status", "retired") : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [types, photos, rooms]) {
    if (result.error) throw new Error(`Could not load room types (${result.error.code})`);
  }
  const { url } = getPublicSupabaseEnv();
  const rows: RoomTypeRow[] = (types.data ?? []).map((type) => ({
    ...type,
    photos: (photos.data ?? [])
      .filter((photo) => photo.room_type_id === type.id)
      .map((photo) => ({ id: photo.id, alt_text: photo.alt_text, sort_order: photo.sort_order, url: `${url}/storage/v1/object/public/tenant-public/${photo.storage_path}` })),
    roomCount: ((rooms.data ?? []) as { room_type_id: string }[]).filter((room) => room.room_type_id === type.id).length,
  }));
  return (
    <>
      <h2 className="font-heading text-xl">Room types</h2>
      <RoomTypesPanel tenantSlug={access.slug} types={rows} canManage={hasPermission(access, "inventory.manage")} />
    </>
  );
}

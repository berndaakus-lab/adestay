import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";
import { getPublicSupabaseEnv } from "@/lib/server/env";
import { getPublicSupabaseClient } from "@/lib/server/supabase/public";
import { getPublicTenantProfile } from "./profile";
import { PUBLIC_CACHE_LIFE, publicCacheEnabled, publicSiteTag } from "./public-cache";
import type { ResolvedTenant } from "./resolve";

export type Availability = "available" | "limited" | "full";

export interface RoomOffer {
  periodId: string;
  periodName: string;
  periodKind: string;
  startsOn: string;
  endsOn: string;
  amountMinor: number;
  depositMinor: number;
  availability: Availability;
}

export interface PublicRoomType {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  occupancy: number;
  genderPolicy: "any" | "female" | "male";
  amenities: string[];
  photos: { url: string; alt: string }[];
  offers: RoomOffer[];
}

/** Public URL of a file in the tenant-public bucket. Paths are server-generated. */
export function publicAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${getPublicSupabaseEnv().url}/storage/v1/object/public/tenant-public/${path}`;
}

/**
 * Published rooms with what can be booked now. Uses the anonymous client, so RLS applies.
 * A hostel that is suspended or has not published its profile lists nothing.
 */
export const getPublicRooms = cache(async (tenant: ResolvedTenant): Promise<PublicRoomType[]> => {
  if (tenant.status !== "active" || !(await getPublicTenantProfile(tenant))) return [];
  return publicCacheEnabled() ? cachedPublicRooms(tenant.id) : loadPublicRooms(tenant.id);
});

async function cachedPublicRooms(tenantId: string) {
  "use cache";
  cacheLife(PUBLIC_CACHE_LIFE);
  cacheTag(publicSiteTag(tenantId));
  return loadPublicRooms(tenantId);
}

async function loadPublicRooms(tenantId: string): Promise<PublicRoomType[]> {
  const db = getPublicSupabaseClient();
  const [types, photos, offers] = await Promise.all([
    db
      .from("room_types")
      .select("id, name, slug, description, occupancy, gender_policy, amenities")
      .eq("tenant_id", tenantId)
      .eq("is_published", true)
      .order("sort_order")
      .order("name"),
    db.from("room_type_photos").select("room_type_id, storage_path, alt_text, sort_order").eq("tenant_id", tenantId).order("sort_order"),
    db.rpc("room_type_public_offers", { p_tenant_id: tenantId }),
  ]);
  const failed = types.error ?? photos.error ?? offers.error;
  if (failed) {
    console.error("public rooms could not be loaded", { code: failed.code });
    throw new Error("Public rooms could not be loaded");
  }

  const offerRows = (offers.data ?? []) as {
    room_type_id: string; booking_period_id: string; period_name: string; period_kind: string;
    starts_on: string; ends_on: string; amount_minor: number | string; deposit_minor: number | string; availability: Availability;
  }[];
  return (types.data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    slug: String(t.slug),
    description: t.description,
    occupancy: t.occupancy,
    genderPolicy: t.gender_policy,
    amenities: t.amenities ?? [],
    photos: (photos.data ?? [])
      .filter((p) => p.room_type_id === t.id)
      .map((p) => ({ url: publicAssetUrl(p.storage_path) as string, alt: p.alt_text })),
    offers: offerRows
      .filter((o) => o.room_type_id === t.id)
      .map((o) => ({
        periodId: o.booking_period_id,
        periodName: o.period_name,
        periodKind: o.period_kind,
        startsOn: o.starts_on,
        endsOn: o.ends_on,
        amountMinor: Number(o.amount_minor),
        depositMinor: Number(o.deposit_minor),
        availability: o.availability,
      })),
  }));
}

/** Every period with at least one bookable room, in date order. */
export function bookablePeriods(rooms: PublicRoomType[]) {
  const periods = new Map<string, RoomOffer>();
  for (const offer of rooms.flatMap((r) => r.offers)) if (!periods.has(offer.periodId)) periods.set(offer.periodId, offer);
  return [...periods.values()].sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.periodName.localeCompare(b.periodName));
}

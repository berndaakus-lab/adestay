"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { dbErrorMessage, type DbError, type DbErrorMessages } from "@/lib/db-errors";
import type { Permission } from "@/lib/permissions";
import { authorizeStaffAction } from "@/lib/server/staff-action";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";
import { refreshPublicSite } from "@/lib/server/tenant/public-cache";
import { fieldErrors } from "@/lib/validation/auth";
import {
  bedBlockSchema,
  bedCreateSchema,
  bedUpdateSchema,
  bookingPeriodSchema,
  idSchema,
  inclusiveDateRange,
  roomSchema,
  roomTypePriceSchema,
  roomTypeSchema,
} from "@/lib/validation/inventory";

/**
 * Inventory and pricing mutations (Phase 2, task 6). Bind the tenant slug in the page:
 * `createRoom.bind(null, tenantSlug)` for useActionState.
 *
 * Layouts do not protect Server Actions, so every action repeats the session + MFA, membership and
 * permission checks. tenant_id always comes from the membership, never from the form, and all
 * queries use the user's session, so row level security stays the final authority.
 */
export interface InventoryFormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type WriteResult = { data: { id: string }[] | null; error: DbError | null };
type Write<T> = (db: Supabase, tenantId: string, input: T) => PromiseLike<WriteResult>;

const NOT_FOUND = "That record no longer exists. Refresh the page.";
const NO_PERMISSION = "You do not have permission to do that.";

async function runAction<S extends z.ZodType>(
  tenantSlug: string,
  permission: Permission,
  schema: S,
  formData: FormData,
  write: Write<z.output<S>>,
  success: string,
  messages?: DbErrorMessages,
): Promise<InventoryFormState> {
  const access = await authorizeStaffAction(tenantSlug, permission);
  if (!access) return { status: "error", message: NO_PERMISSION };
  const tenantId = access.tenantId;

  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const db = await createSupabaseServerClient();
  const { data, error } = await write(db, tenantId, parsed.data);
  if (error) {
    const message = dbErrorMessage(error, messages);
    if (message) return { status: "error", message };
    const reference = randomUUID().slice(0, 8);
    // Code only: database messages can contain submitted values (T15).
    console.error("inventory action failed", { reference, code: error.code });
    return { status: "error", message: `Could not save. Try again, or quote reference ${reference}.` };
  }
  // RLS hides rows the caller may not change, so "no row" also covers other hostels' ids.
  if (!data?.length) return { status: "error", message: NOT_FOUND };

  revalidatePath(`/t/${tenantSlug}`, "layout");
  refreshPublicSite(tenantId);
  return { status: "success", message: success, id: data[0].id };
}

const insertRow = (db: Supabase, table: string, tenantId: string, row: Record<string, unknown>) =>
  db.from(table).insert({ tenant_id: tenantId, ...row }).select("id") as unknown as PromiseLike<WriteResult>;

const updateRow = (db: Supabase, table: string, tenantId: string, id: string, row: Record<string, unknown>) =>
  db.from(table).update(row).eq("tenant_id", tenantId).eq("id", id).select("id") as unknown as PromiseLike<WriteResult>;

const deleteRow = (db: Supabase, table: string, tenantId: string, id: string) =>
  db.from(table).delete().eq("tenant_id", tenantId).eq("id", id).select("id") as unknown as PromiseLike<WriteResult>;

/** Update forms carry the record id next to the fields. */
const withId = <S extends z.ZodType>(schema: S) => idSchema.and(schema);

// ---------------------------------------------------------------------------------------------
// Booking periods (inventory.manage)
// ---------------------------------------------------------------------------------------------
const periodRow = (v: z.output<typeof bookingPeriodSchema>) => ({
  name: v.name,
  kind: v.kind,
  starts_on: v.startsOn,
  ends_on: v.endsOn,
  booking_opens_at: v.bookingOpensAt,
  booking_closes_at: v.bookingClosesAt,
  status: v.status,
});
const periodMessages: DbErrorMessages = {
  duplicate: "A booking period with this name already exists.",
  linked: "This period is in use, so it cannot be removed. Archive it instead.",
};

export async function createBookingPeriod(tenantSlug: string, _prev: InventoryFormState, formData: FormData) {
  return runAction(tenantSlug, "inventory.manage", bookingPeriodSchema, formData,
    (db, tenantId, v) => insertRow(db, "booking_periods", tenantId, periodRow(v)), "Booking period added.", periodMessages);
}

export async function updateBookingPeriod(tenantSlug: string, _prev: InventoryFormState, formData: FormData) {
  return runAction(tenantSlug, "inventory.manage", withId(bookingPeriodSchema), formData,
    (db, tenantId, v) => updateRow(db, "booking_periods", tenantId, v.id, periodRow(v)), "Booking period saved.", periodMessages);
}

export async function deleteBookingPeriod(tenantSlug: string, _prev: InventoryFormState, formData: FormData) {
  return runAction(tenantSlug, "inventory.manage", idSchema, formData,
    (db, tenantId, v) => deleteRow(db, "booking_periods", tenantId, v.id), "Booking period removed.", periodMessages);
}

// ---------------------------------------------------------------------------------------------
// Room types (inventory.manage)
// ---------------------------------------------------------------------------------------------
const roomTypeRow = (v: z.output<typeof roomTypeSchema>) => ({
  name: v.name,
  slug: v.slug,
  description: v.description,
  occupancy: v.occupancy,
  gender_policy: v.genderPolicy,
  amenities: v.amenities,
  is_published: v.isPublished,
  sort_order: v.sortOrder,
});
const roomTypeMessages: DbErrorMessages = {
  duplicate: "A room type with this web address (slug) already exists.",
  linked: "This room type still has rooms. Move or remove them first.",
  rule: "A room of this type has more beds than that. Retire a bed first, or keep the higher number.",
};

export async function createRoomType(tenantSlug: string, _prev: InventoryFormState, formData: FormData) {
  return runAction(tenantSlug, "inventory.manage", roomTypeSchema, formData,
    (db, tenantId, v) => insertRow(db, "room_types", tenantId, roomTypeRow(v)), "Room type added.", roomTypeMessages);
}

export async function updateRoomType(tenantSlug: string, _prev: InventoryFormState, formData: FormData) {
  return runAction(tenantSlug, "inventory.manage", withId(roomTypeSchema), formData,
    (db, tenantId, v) => updateRow(db, "room_types", tenantId, v.id, roomTypeRow(v)), "Room type saved.", roomTypeMessages);
}

export async function deleteRoomType(tenantSlug: string, _prev: InventoryFormState, formData: FormData) {
  return runAction(tenantSlug, "inventory.manage", idSchema, formData,
    (db, tenantId, v) => deleteRow(db, "room_types", tenantId, v.id), "Room type removed.", roomTypeMessages);
}

// ---------------------------------------------------------------------------------------------
// Rooms (inventory.manage)
// ---------------------------------------------------------------------------------------------
const roomRow = (v: z.output<typeof roomSchema>) => ({
  room_type_id: v.roomTypeId,
  label: v.label,
  block: v.block,
  floor: v.floor,
  gender_policy_override: v.genderPolicyOverride,
  status: v.status,
  notes: v.notes,
});
const roomMessages: DbErrorMessages = {
  duplicate: "A room with this number already exists.",
  linked: "Choose a room type from this hostel. A room with bed block history cannot be removed; retire it instead.",
  rule: "This room has more beds than that room type allows. Retire a bed first.",
};

export async function createRoom(tenantSlug: string, _prev: InventoryFormState, formData: FormData) {
  return runAction(tenantSlug, "inventory.manage", roomSchema, formData,
    (db, tenantId, v) => insertRow(db, "rooms", tenantId, roomRow(v)), "Room added.", roomMessages);
}

export async function updateRoom(tenantSlug: string, _prev: InventoryFormState, formData: FormData) {
  return runAction(tenantSlug, "inventory.manage", withId(roomSchema), formData,
    (db, tenantId, v) => updateRow(db, "rooms", tenantId, v.id, roomRow(v)), "Room saved.", roomMessages);
}

export async function deleteRoom(tenantSlug: string, _prev: InventoryFormState, formData: FormData) {
  return runAction(tenantSlug, "inventory.manage", idSchema, formData,
    (db, tenantId, v) => deleteRow(db, "rooms", tenantId, v.id), "Room removed.", roomMessages);
}

// ---------------------------------------------------------------------------------------------
// Beds and blocks (inventory.manage)
// ---------------------------------------------------------------------------------------------
const bedMessages: DbErrorMessages = {
  duplicate: "This room already has a bed with that label.",
  linked: "Choose a room from this hostel. A bed with block history cannot be removed; retire it instead.",
  rule: "This room already has as many beds as its room type allows.",
};

export async function createBed(tenantSlug: string, _prev: InventoryFormState, formData: FormData) {
  return runAction(tenantSlug, "inventory.manage", bedCreateSchema, formData,
    (db, tenantId, v) => insertRow(db, "beds", tenantId, { room_id: v.roomId, label: v.label, status: v.status }), "Bed added.", bedMessages);
}

export async function updateBed(tenantSlug: string, _prev: InventoryFormState, formData: FormData) {
  return runAction(tenantSlug, "inventory.manage", withId(bedUpdateSchema), formData,
    (db, tenantId, v) => updateRow(db, "beds", tenantId, v.id, { label: v.label, status: v.status }), "Bed saved.", bedMessages);
}

export async function deleteBed(tenantSlug: string, _prev: InventoryFormState, formData: FormData) {
  return runAction(tenantSlug, "inventory.manage", idSchema, formData,
    (db, tenantId, v) => deleteRow(db, "beds", tenantId, v.id), "Bed removed.", bedMessages);
}

export async function createBedBlock(tenantSlug: string, _prev: InventoryFormState, formData: FormData) {
  return runAction(tenantSlug, "inventory.manage", bedBlockSchema, formData,
    (db, tenantId, v) =>
      insertRow(db, "bed_blocks", tenantId, { bed_id: v.bedId, blocked: inclusiveDateRange(v.startsOn, v.endsOn), reason: v.reason }),
    "Bed blocked.",
    { overlap: "This bed is already blocked for some of those days.", linked: "Choose a bed from this hostel." });
}

export async function releaseBedBlock(tenantSlug: string, _prev: InventoryFormState, formData: FormData) {
  return runAction(tenantSlug, "inventory.manage", idSchema, formData,
    (db, tenantId, v) =>
      db.from("bed_blocks").update({ released_at: new Date().toISOString() })
        .eq("tenant_id", tenantId).eq("id", v.id).is("released_at", null).select("id") as unknown as PromiseLike<WriteResult>,
    "Block released.");
}

// ---------------------------------------------------------------------------------------------
// Prices (pricing.manage)
// ---------------------------------------------------------------------------------------------
const priceMessages: DbErrorMessages = {
  duplicate: "A price was just saved for this room type and period. Refresh and try again.",
  linked: "Choose a room type and period from this hostel.",
};

/**
 * Update, then insert. A PostgREST upsert would also write tenant_id and the parent keys, which
 * the column grants deliberately refuse. A concurrent insert surfaces as the duplicate message.
 */
export async function setRoomTypePrice(tenantSlug: string, _prev: InventoryFormState, formData: FormData) {
  return runAction(tenantSlug, "pricing.manage", roomTypePriceSchema, formData,
    async (db, tenantId, v) => {
      const amounts = { amount_minor: v.amount, deposit_minor: v.deposit };
      const updated = (await db.from("room_type_prices").update(amounts)
        .eq("tenant_id", tenantId).eq("room_type_id", v.roomTypeId).eq("booking_period_id", v.bookingPeriodId)
        .select("id")) as unknown as WriteResult;
      if (updated.error || updated.data?.length) return updated;
      return insertRow(db, "room_type_prices", tenantId, { room_type_id: v.roomTypeId, booking_period_id: v.bookingPeriodId, ...amounts });
    },
    "Price saved.", priceMessages);
}

export async function deleteRoomTypePrice(tenantSlug: string, _prev: InventoryFormState, formData: FormData) {
  return runAction(tenantSlug, "pricing.manage", idSchema, formData,
    (db, tenantId, v) => deleteRow(db, "room_type_prices", tenantId, v.id), "Price removed.");
}

"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { dbErrorMessage, type DbError } from "@/lib/db-errors";
import type { InventoryFormState } from "@/lib/server/actions/inventory-actions";
import { authorizeStaffAction } from "@/lib/server/staff-action";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";
import { refreshPublicSite } from "@/lib/server/tenant/public-cache";
import { ImageRejectedError } from "@/lib/server/uploads/process-image";
import {
  discardUploadedImage,
  removePublicImage,
  UploadDeniedError,
  uploadPublicImage,
  type PublicImageTarget,
} from "@/lib/server/uploads/public-images";
import { fieldErrors } from "@/lib/validation/auth";
import { brandingImageSchema, idSchema, roomTypePhotoSchema, roomTypePhotoUpdateSchema } from "@/lib/validation/inventory";

/**
 * Room photos and branding images (Phase 2, task 7). The file goes through the server-only
 * pipeline in src/lib/server/uploads; the database rows are written with the user's session.
 */
const NO_PERMISSION: InventoryFormState = { status: "error", message: "You do not have permission to do that." };
const NOT_FOUND: InventoryFormState = { status: "error", message: "That record no longer exists. Refresh the page." };

function failure(error: DbError): InventoryFormState {
  const message = dbErrorMessage(error, { linked: "Choose a room type from this hostel." });
  if (message) return { status: "error", message };
  const reference = randomUUID().slice(0, 8);
  console.error("image action failed", { reference, code: error.code });
  return { status: "error", message: `Could not save. Try again, or quote reference ${reference}.` };
}

function refresh(tenantSlug: string, tenantId: string) {
  revalidatePath(`/t/${tenantSlug}`, "layout");
  revalidatePath(`/sites/${tenantSlug}`, "layout");
  refreshPublicSite(tenantId);
}

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function storeFile(
  db: Client,
  tenantId: string,
  target: PublicImageTarget,
  file: FormDataEntryValue | null,
): Promise<{ path: string } | { state: InventoryFormState }> {
  if (!(file instanceof File)) {
    return { state: { status: "error", fieldErrors: { file: "Choose an image to upload." } } };
  }
  try {
    return { path: await uploadPublicImage(db, tenantId, target, file) };
  } catch (error) {
    if (error instanceof UploadDeniedError) return { state: NO_PERMISSION };
    if (error instanceof ImageRejectedError) return { state: { status: "error", fieldErrors: { file: error.message } } };
    const reference = randomUUID().slice(0, 8);
    console.error("image upload failed", { reference });
    return { state: { status: "error", message: `Could not upload. Try again, or quote reference ${reference}.` } };
  }
}

// ---------------------------------------------------------------------------------------------
// Room type photos (inventory.manage)
// ---------------------------------------------------------------------------------------------
export async function uploadRoomTypePhoto(tenantSlug: string, _prev: InventoryFormState, formData: FormData): Promise<InventoryFormState> {
  const access = await authorizeStaffAction(tenantSlug, "inventory.manage");
  if (!access) return NO_PERMISSION;
  const parsed = roomTypePhotoSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const db = await createSupabaseServerClient();
  const stored = await storeFile(db, access.tenantId, { kind: "room-type", roomTypeId: parsed.data.roomTypeId }, formData.get("file"));
  if ("state" in stored) return stored.state;

  const { data, error } = await db
    .from("room_type_photos")
    .insert({ tenant_id: access.tenantId, room_type_id: parsed.data.roomTypeId, storage_path: stored.path, alt_text: parsed.data.altText })
    .select("id");
  if (error || !data?.length) {
    await discardUploadedImage(stored.path);
    return error ? failure(error) : NOT_FOUND;
  }
  refresh(tenantSlug, access.tenantId);
  return { status: "success", message: "Photo added.", id: data[0].id };
}

export async function updateRoomTypePhoto(tenantSlug: string, _prev: InventoryFormState, formData: FormData): Promise<InventoryFormState> {
  const access = await authorizeStaffAction(tenantSlug, "inventory.manage");
  if (!access) return NO_PERMISSION;
  const parsed = roomTypePhotoUpdateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("room_type_photos")
    .update({ alt_text: parsed.data.altText, sort_order: parsed.data.sortOrder })
    .eq("tenant_id", access.tenantId)
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return failure(error);
  if (!data?.length) return NOT_FOUND;
  refresh(tenantSlug, access.tenantId);
  return { status: "success", message: "Photo saved.", id: data[0].id };
}

export async function deleteRoomTypePhoto(tenantSlug: string, _prev: InventoryFormState, formData: FormData): Promise<InventoryFormState> {
  const access = await authorizeStaffAction(tenantSlug, "inventory.manage");
  if (!access) return NO_PERMISSION;
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("room_type_photos")
    .delete()
    .eq("tenant_id", access.tenantId)
    .eq("id", parsed.data.id)
    .select("id, storage_path");
  if (error) return failure(error);
  if (!data?.length) return NOT_FOUND;
  await removePublicImage(db, data[0].storage_path);
  refresh(tenantSlug, access.tenantId);
  return { status: "success", message: "Photo removed.", id: data[0].id };
}

// ---------------------------------------------------------------------------------------------
// Logo and main photo (settings.manage)
// ---------------------------------------------------------------------------------------------
const brandingColumn = { logo: "logo_path", hero: "hero_image_path" } as const;

async function currentBrandingPath(db: Client, tenantId: string, column: string): Promise<{ found: boolean; path: string | null; error: DbError | null }> {
  const { data, error } = await db.from("tenant_profiles").select(column).eq("tenant_id", tenantId).maybeSingle();
  const row = data as Record<string, string | null> | null;
  return { found: Boolean(row), path: row?.[column] ?? null, error };
}

export async function uploadBrandingImage(tenantSlug: string, _prev: InventoryFormState, formData: FormData): Promise<InventoryFormState> {
  const access = await authorizeStaffAction(tenantSlug, "settings.manage");
  if (!access) return NO_PERMISSION;
  const parsed = brandingImageSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const db = await createSupabaseServerClient();
  const column = brandingColumn[parsed.data.kind];
  const current = await currentBrandingPath(db, access.tenantId, column);
  if (current.error) return failure(current.error);
  if (!current.found) return NOT_FOUND;

  const stored = await storeFile(db, access.tenantId, { kind: parsed.data.kind }, formData.get("file"));
  if ("state" in stored) return stored.state;

  const { data, error } = await db
    .from("tenant_profiles")
    .update({ [column]: stored.path })
    .eq("tenant_id", access.tenantId)
    .select("tenant_id");
  if (error || !data?.length) {
    await discardUploadedImage(stored.path);
    return error ? failure(error) : NOT_FOUND;
  }
  if (current.path) await removePublicImage(db, current.path);
  refresh(tenantSlug, access.tenantId);
  return { status: "success", message: parsed.data.kind === "logo" ? "Logo updated." : "Main photo updated." };
}

export async function removeBrandingImage(tenantSlug: string, _prev: InventoryFormState, formData: FormData): Promise<InventoryFormState> {
  const access = await authorizeStaffAction(tenantSlug, "settings.manage");
  if (!access) return NO_PERMISSION;
  const parsed = brandingImageSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const db = await createSupabaseServerClient();
  const column = brandingColumn[parsed.data.kind];
  const current = await currentBrandingPath(db, access.tenantId, column);
  if (current.error) return failure(current.error);
  if (!current.found) return NOT_FOUND;

  const { data, error } = await db
    .from("tenant_profiles")
    .update({ [column]: null })
    .eq("tenant_id", access.tenantId)
    .select("tenant_id");
  if (error) return failure(error);
  if (!data?.length) return NOT_FOUND;
  if (current.path) await removePublicImage(db, current.path);
  refresh(tenantSlug, access.tenantId);
  return { status: "success", message: "Image removed." };
}

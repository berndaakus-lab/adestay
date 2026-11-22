import "server-only";
import { randomBytes } from "node:crypto";
import { getServiceRoleClient } from "@/lib/server/supabase/admin";
import type { createSupabaseServerClient } from "@/lib/server/supabase/server";
import { ImageRejectedError, MAX_UPLOAD_BYTES, processImage } from "./process-image";

/**
 * Server-only uploads to the public bucket (product owner decision, 2026-11-22). The database
 * decides whether THIS USER may write the path; only then does the service role store the
 * re-encoded file. API roles have no insert policy on the bucket.
 */
const BUCKET = "tenant-public";

export type PublicImageTarget = { kind: "logo" } | { kind: "hero" } | { kind: "room-type"; roomTypeId: string };
type UserClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export class UploadDeniedError extends Error {
  constructor() {
    super("Upload not allowed");
    this.name = "UploadDeniedError";
  }
}

const MAX_DIMENSION: Record<PublicImageTarget["kind"], number> = { logo: 800, hero: 2400, "room-type": 1920 };

/** Always server-generated: nothing from the file name or the browser reaches the path. */
export function publicImagePath(tenantId: string, target: PublicImageTarget): string {
  const id = randomBytes(12).toString("hex");
  if (target.kind === "room-type") return `${tenantId}/room-types/${target.roomTypeId}/photo-${id}.webp`;
  return `${tenantId}/branding/${target.kind}-${id}.webp`;
}

export async function uploadPublicImage(user: UserClient, tenantId: string, target: PublicImageTarget, file: File): Promise<string> {
  if (file.size === 0) throw new ImageRejectedError("Choose an image to upload.");
  if (file.size > MAX_UPLOAD_BYTES) throw new ImageRejectedError("Images can be 5 MB at most.");

  const path = publicImagePath(tenantId, target);
  const { data: allowed, error } = await user.rpc("can_upload_public_asset", { p_name: path });
  if (error || allowed !== true) throw new UploadDeniedError();

  const image = await processImage(new Uint8Array(await file.arrayBuffer()), MAX_DIMENSION[target.kind]);
  const { error: uploadError } = await getServiceRoleClient()
    .storage.from(BUCKET)
    .upload(path, image.data, { contentType: image.contentType, cacheControl: "31536000", upsert: false });
  if (uploadError) throw new Error("Image storage failed");
  return path;
}

/** Undoes an upload whose database row could not be saved. */
export async function discardUploadedImage(path: string): Promise<void> {
  const { error } = await getServiceRoleClient().storage.from(BUCKET).remove([path]);
  if (error) console.error("could not discard uploaded image");
}

/** Removes a replaced or deleted image with the user's session (storage RLS applies). */
export async function removePublicImage(user: UserClient, path: string): Promise<void> {
  const { error } = await user.storage.from(BUCKET).remove([path]);
  if (error) console.error("could not remove old image");
}

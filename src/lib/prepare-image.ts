/**
 * Browser step before an image upload. Vercel limits a request body to about 4.5 MB, below the
 * server's 5 MB file limit, so larger photos are shrunk here first. This is a convenience only:
 * the server still validates and re-encodes everything.
 */
export const DIRECT_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_SIDE = 2400;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/** Replaces `file` in the form data if needed. Returns an error message, or null when ready. */
export async function prepareImageField(formData: FormData): Promise<string | null> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return "Choose an image to upload.";
  if (!ALLOWED.includes(file.type)) return "Upload a JPEG, PNG or WebP image.";
  if (file.size <= DIRECT_UPLOAD_BYTES) return null;
  if (file.size > MAX_SOURCE_BYTES) return "This image is too large. Choose one under 25 MB.";

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return "This image could not be read. Try saving it again or choose another file.";
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // Browsers without a WebP encoder return PNG, which may still be too big, so JPEG is the fallback.
  let blob = await toBlob(canvas, "image/webp", 0.85);
  if (!blob || blob.type !== "image/webp" || blob.size > DIRECT_UPLOAD_BYTES) blob = await toBlob(canvas, "image/jpeg", 0.8);
  if (!blob || blob.size > DIRECT_UPLOAD_BYTES) return "This image is too large to upload. Try a smaller one.";
  formData.set("file", new File([blob], blob.type === "image/webp" ? "image.webp" : "image.jpg", { type: blob.type }));
  return null;
}

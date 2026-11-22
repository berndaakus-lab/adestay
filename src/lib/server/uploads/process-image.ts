import "server-only";
import sharp from "sharp";

/**
 * Turns an untrusted upload into a clean image (docs/SECURITY_THREAT_MODEL.md T11). Only decoded
 * pixels survive: EXIF/GPS, comments and any bytes hidden in or after the image are dropped.
 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Stops decompression bombs: a small file that expands to a huge bitmap. */
const MAX_INPUT_PIXELS = 40_000_000;

export type ImageType = "jpeg" | "png" | "webp";

export class ImageRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageRejectedError";
  }
}

const UNSUPPORTED = "Upload a JPEG, PNG or WebP image.";
const UNREADABLE = "This image could not be read. Try saving it again or choose another file.";

/** The type from the file's first bytes. The browser's name and MIME type are never trusted. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "png";
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  return null;
}

export interface ProcessedImage {
  data: Buffer;
  width: number;
  height: number;
  contentType: "image/webp";
  extension: "webp";
}

export async function processImage(bytes: Uint8Array, maxDimension: number): Promise<ProcessedImage> {
  if (bytes.length === 0) throw new ImageRejectedError(UNSUPPORTED);
  if (bytes.length > MAX_UPLOAD_BYTES) throw new ImageRejectedError("Images can be 5 MB at most.");
  // Before sharp sees the file: sharp would otherwise auto-detect and render SVG, PDF and others.
  const type = sniffImageType(bytes);
  if (!type) throw new ImageRejectedError(UNSUPPORTED);

  const options = { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error", animated: false } as const;
  try {
    const metadata = await sharp(bytes, options).metadata();
    if (metadata.format !== type) throw new ImageRejectedError(UNSUPPORTED);

    const { data, info } = await sharp(bytes, options)
      .rotate() // Applies the EXIF orientation before the metadata is dropped.
      .resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });

    if (data.length > MAX_UPLOAD_BYTES) throw new ImageRejectedError("This image is too large after processing.");
    return { data, width: info.width, height: info.height, contentType: "image/webp", extension: "webp" };
  } catch (error) {
    if (error instanceof ImageRejectedError) throw error;
    throw new ImageRejectedError(UNREADABLE);
  }
}

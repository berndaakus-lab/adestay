import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ImageRejectedError, MAX_UPLOAD_BYTES, processImage, sniffImageType } from "@/lib/server/uploads/process-image";

const SCRIPT = "<script>alert('stored-xss-marker')</script>";
const solid = (width = 64, height = 48) => sharp({ create: { width, height, channels: 3, background: { r: 35, g: 69, b: 54 } } });
const noise = (width: number, height: number) => {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i += 1) raw[i] = (i * 7919) % 251;
  return sharp(raw, { raw: { width, height, channels: 3 } });
};

let jpeg: Buffer;
let png: Buffer;
let webp: Buffer;
let exifJpeg: Buffer;

beforeAll(async () => {
  jpeg = await solid().jpeg().toBuffer();
  png = await solid().png().toBuffer();
  webp = await solid().webp().toBuffer();
  exifJpeg = await solid()
    .withExif({ IFD0: { Copyright: "exif-marker", ImageDescription: "exif-marker" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "5/1 36/1 0/1" } })
    .jpeg()
    .toBuffer();
});

const rejects = (bytes: Uint8Array) => expect(processImage(bytes, 1920)).rejects.toBeInstanceOf(ImageRejectedError);

describe("file type comes from the bytes", () => {
  it("recognises JPEG, PNG and WebP", () => {
    expect(sniffImageType(jpeg)).toBe("jpeg");
    expect(sniffImageType(png)).toBe("png");
    expect(sniffImageType(webp)).toBe("webp");
  });

  it.each([
    ["SVG", `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">${SCRIPT}</svg>`],
    ["SVG with an XML prolog", `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>`],
    ["HTML", `<!doctype html><html>${SCRIPT}</html>`],
    ["PDF", "%PDF-1.7\n1 0 obj\n<<>>\nendobj\n"],
    ["GIF", "GIF89a\x01\x00\x01\x00\x00\x00\x00;"],
    ["RIFF that is not WebP", "RIFF\x10\x00\x00\x00WAVEfmt "],
    ["plain text", "just some text"],
  ])("refuses %s", async (_name, content) => {
    const bytes = Buffer.from(content, "latin1");
    expect(sniffImageType(bytes)).toBeNull();
    await rejects(bytes);
  });

  it("refuses an empty file", () => rejects(new Uint8Array()));
});

describe("polyglots and damaged files", () => {
  it.each(["jpeg", "png", "webp"] as const)("drops a script appended to a %s", async (kind) => {
    const source = { jpeg, png, webp } as const;
    const result = await processImage(Buffer.concat([source[kind], Buffer.from(SCRIPT)]), 1920).catch((e: Error) => e);
    // A strict decoder may refuse the file; if it is accepted, the payload must be gone.
    if (result instanceof Error) expect(result).toBeInstanceOf(ImageRejectedError);
    else expect(result.data.includes("stored-xss-marker")).toBe(false);
  });

  it("drops a script hidden in a JPEG comment", async () => {
    const comment = Buffer.from(SCRIPT);
    const length = Buffer.alloc(2);
    length.writeUInt16BE(comment.length + 2);
    const polyglot = Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xfe]), length, comment, jpeg.subarray(2)]);
    expect(polyglot.includes("stored-xss-marker")).toBe(true);
    const result = await processImage(polyglot, 1920);
    expect(result.data.includes("stored-xss-marker")).toBe(false);
  });

  it("refuses an image signature followed by HTML", () => rejects(Buffer.concat([jpeg.subarray(0, 3), Buffer.from(SCRIPT)])));
  it("refuses a PNG signature followed by HTML", () => rejects(Buffer.concat([png.subarray(0, 8), Buffer.from(SCRIPT)])));
  it("refuses a truncated JPEG", async () => {
    const large = await noise(400, 300).jpeg().toBuffer();
    await rejects(large.subarray(0, Math.floor(large.length / 2)));
  });
});

describe("limits", () => {
  it("refuses more than 5 MB", () => rejects(Buffer.concat([jpeg, Buffer.alloc(MAX_UPLOAD_BYTES)])));

  it("refuses a decompression bomb", async () => {
    const bomb = await sharp({ create: { width: 8000, height: 8000, channels: 3, background: "#234536" } }).png({ compressionLevel: 9 }).toBuffer();
    expect(bomb.length).toBeLessThan(MAX_UPLOAD_BYTES);
    await rejects(bomb);
  }, 30_000);
});

describe("clean output", () => {
  it("strips EXIF and GPS", async () => {
    const before = await sharp(exifJpeg).metadata();
    expect(before.exif?.includes("exif-marker")).toBe(true);
    const { data } = await processImage(exifJpeg, 1920);
    const after = await sharp(data).metadata();
    expect(after.exif).toBeUndefined();
    expect(after.xmp).toBeUndefined();
    expect(after.iptc).toBeUndefined();
    expect(data.includes("exif-marker")).toBe(false);
  });

  it.each(["jpeg", "png", "webp"] as const)("re-encodes %s to WebP", async (kind) => {
    const source = { jpeg, png, webp } as const;
    const result = await processImage(source[kind], 1920);
    expect(result).toMatchObject({ contentType: "image/webp", extension: "webp", width: 64, height: 48 });
    expect((await sharp(result.data).metadata()).format).toBe("webp");
  });

  it("applies EXIF orientation before stripping it", async () => {
    const rotated = await solid(64, 48).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    expect(await processImage(rotated, 1920)).toMatchObject({ width: 48, height: 64 });
  });

  it("shrinks to the maximum and never enlarges", async () => {
    const big = await solid(2000, 1000).png().toBuffer();
    expect(await processImage(big, 800)).toMatchObject({ width: 800, height: 400 });
    expect(await processImage(png, 800)).toMatchObject({ width: 64, height: 48 });
  });

  it("keeps logo transparency", async () => {
    const logo = await sharp({ create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const { data } = await processImage(logo, 800);
    expect((await sharp(data).metadata()).hasAlpha).toBe(true);
  });
});

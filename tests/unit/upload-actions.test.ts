import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TYPE = "20000000-0000-4000-8000-0000000000a1";
const PHOTO = "60000000-0000-4000-8000-0000000000a1";

const h = vi.hoisted(() => ({
  allowed: true as unknown,
  rpcCalls: [] as { name: string; args: { p_name: string } }[],
  dbCalls: [] as { table: string; op: string; payload?: Record<string, unknown>; filters: [string, unknown][] }[],
  dbResults: [] as unknown[],
  adminUploads: [] as { bucket: string; path: string; data: Buffer; options: Record<string, unknown> }[],
  adminUploadError: null as null | { message: string },
  adminRemoved: [] as string[],
  userRemoved: [] as string[],
  access: null as null | { tenantId: string; slug: string; name: string; role: string; permissions: string[] },
  revalidate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidate, updateTag: vi.fn(), cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ requireStaffSession: async () => ({ id: "user" }) }));
vi.mock("@/lib/server/tenant/context", () => ({ getTenantContext: async () => ({ surface: "app" }) }));
vi.mock("@/lib/server/authz", async () => {
  const { hasPermission } = await import("@/lib/permissions");
  class AuthorizationError extends Error {}
  return {
    AuthorizationError,
    requireTenantMember: async () => {
      if (!h.access) throw new AuthorizationError("Not found");
      return h.access;
    },
    requirePermission: (access: never, permission: never) => {
      if (!hasPermission(access, permission)) throw new AuthorizationError("Forbidden");
    },
  };
});
vi.mock("@/lib/server/supabase/admin", () => ({
  getServiceRoleClient: () => ({
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, data: Buffer, options: Record<string, unknown>) => {
          h.adminUploads.push({ bucket, path, data, options });
          return { error: h.adminUploadError };
        },
        remove: async (paths: string[]) => {
          h.adminRemoved.push(...paths);
          return { error: null };
        },
      }),
    },
  }),
}));
vi.mock("@/lib/server/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: async (name: string, args: { p_name: string }) => {
      h.rpcCalls.push({ name, args });
      return { data: h.allowed, error: null };
    },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          h.userRemoved.push(...paths);
          return { error: null };
        },
      }),
    },
    from(table: string) {
      const call: (typeof h.dbCalls)[number] = { table, op: "select", filters: [] };
      h.dbCalls.push(call);
      const query = {
        insert(payload: Record<string, unknown>) { call.op = "insert"; call.payload = payload; return query; },
        update(payload: Record<string, unknown>) { call.op = "update"; call.payload = payload; return query; },
        delete() { call.op = "delete"; return query; },
        eq(column: string, value: unknown) { call.filters.push([column, value]); return query; },
        select() { return query; },
        maybeSingle() { return query; },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(h.dbResults.shift() ?? { data: [{ id: "new-id", tenant_id: TENANT }], error: null }).then(resolve);
        },
      };
      return query;
    },
  }),
}));

import {
  deleteRoomTypePhoto,
  removeBrandingImage,
  uploadBrandingImage,
  uploadRoomTypePhoto,
} from "@/lib/server/actions/upload-actions";

const idle = { status: "idle" as const };
const member = (permissions: string[]) => ({ tenantId: TENANT, slug: "hostel-a", name: "Hostel A", role: "staff", permissions });
let jpeg: Buffer;

const photoForm = (file: File | string | null, extra: Record<string, string> = {}) => {
  const data = new FormData();
  data.set("roomTypeId", TYPE);
  data.set("altText", "Two beds by a window");
  if (file !== null) data.set("file", file);
  for (const [key, value] of Object.entries(extra)) data.set(key, value);
  return data;
};
const brandingForm = (kind: string, file: File | null) => {
  const data = new FormData();
  data.set("kind", kind);
  if (file) data.set("file", file);
  return data;
};
const imageFile = (name = "holiday photo.jpg", type = "image/jpeg") => new File([new Uint8Array(jpeg)], name, { type });

beforeAll(async () => {
  jpeg = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#234536" } })
    .withExif({ IFD0: { Copyright: "exif-marker" } })
    .jpeg()
    .toBuffer();
});

beforeEach(() => {
  h.allowed = true;
  h.rpcCalls.length = 0;
  h.dbCalls.length = 0;
  h.dbResults.length = 0;
  h.adminUploads.length = 0;
  h.adminUploadError = null;
  h.adminRemoved.length = 0;
  h.userRemoved.length = 0;
  h.access = member(["inventory.manage", "settings.manage"]);
  h.revalidate.mockClear();
});

describe("uploadRoomTypePhoto", () => {
  it("stores a clean WebP under a server-generated path, then saves the row", async () => {
    const result = await uploadRoomTypePhoto("hostel-a", idle, photoForm(imageFile("../../evil.svg", "image/svg+xml"), { tenant_id: OTHER, storagePath: "x" }));
    expect(result).toMatchObject({ status: "success", id: "new-id" });

    const [upload] = h.adminUploads;
    expect(upload.bucket).toBe("tenant-public");
    expect(upload.path).toMatch(new RegExp(`^${TENANT}/room-types/${TYPE}/photo-[0-9a-f]{24}\\.webp$`));
    expect(upload.options).toMatchObject({ contentType: "image/webp", upsert: false });
    expect(upload.data.includes("exif-marker")).toBe(false);
    expect((await sharp(upload.data).metadata()).format).toBe("webp");

    expect(h.rpcCalls).toEqual([{ name: "can_upload_public_asset", args: { p_name: upload.path } }]);
    expect(h.dbCalls[0].payload).toMatchObject({ tenant_id: TENANT, room_type_id: TYPE, storage_path: upload.path });
  });

  it("needs inventory.manage", async () => {
    h.access = member(["inventory.read", "settings.manage"]);
    expect((await uploadRoomTypePhoto("hostel-a", idle, photoForm(imageFile()))).message).toMatch(/permission/);
    expect(h.rpcCalls).toEqual([]);
    expect(h.adminUploads).toEqual([]);
  });

  it("stores nothing when the database refuses this user", async () => {
    h.allowed = false;
    expect((await uploadRoomTypePhoto("hostel-a", idle, photoForm(imageFile()))).message).toMatch(/permission/);
    expect(h.adminUploads).toEqual([]);
    expect(h.dbCalls).toEqual([]);
  });

  it("treats anything but true from the check as a refusal", async () => {
    h.allowed = null;
    expect((await uploadRoomTypePhoto("hostel-a", idle, photoForm(imageFile()))).status).toBe("error");
    expect(h.adminUploads).toEqual([]);
  });

  it("refuses an SVG labelled as a JPEG", async () => {
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>'], "photo.jpg", { type: "image/jpeg" });
    const result = await uploadRoomTypePhoto("hostel-a", idle, photoForm(svg));
    expect(result.fieldErrors?.file).toMatch(/JPEG, PNG or WebP/);
    expect(h.adminUploads).toEqual([]);
  });

  it("refuses a file over 5 MB before reading it", async () => {
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" });
    expect((await uploadRoomTypePhoto("hostel-a", idle, photoForm(big))).fieldErrors?.file).toMatch(/5 MB/);
    expect(h.rpcCalls).toEqual([]);
  });

  it("needs a file and a description", async () => {
    expect((await uploadRoomTypePhoto("hostel-a", idle, photoForm("not a file"))).fieldErrors).toHaveProperty("file");
    expect((await uploadRoomTypePhoto("hostel-a", idle, photoForm(imageFile(), { altText: "" }))).fieldErrors).toHaveProperty("altText");
    expect(h.adminUploads).toEqual([]);
  });

  it("removes the file when the row cannot be saved", async () => {
    h.dbResults.push({ data: null, error: { code: "23503" } });
    const result = await uploadRoomTypePhoto("hostel-a", idle, photoForm(imageFile()));
    expect(result.status).toBe("error");
    expect(h.adminRemoved).toEqual([h.adminUploads[0].path]);
  });

  it("reports a storage failure without raw detail", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    h.adminUploadError = { message: "secret bucket detail" };
    const result = await uploadRoomTypePhoto("hostel-a", idle, photoForm(imageFile()));
    expect(result.message).toMatch(/reference [0-9a-f]{8}/);
    expect(result.message).not.toContain("secret");
    expect(h.dbCalls).toEqual([]);
    log.mockRestore();
  });
});

describe("deleteRoomTypePhoto", () => {
  it("removes the row, then the file with the user's session", async () => {
    const path = `${TENANT}/room-types/${TYPE}/photo-aaaaaaaaaaaa.webp`;
    h.dbResults.push({ data: [{ id: PHOTO, storage_path: path }], error: null });
    const data = new FormData();
    data.set("id", PHOTO);
    expect((await deleteRoomTypePhoto("hostel-a", idle, data)).status).toBe("success");
    expect(h.dbCalls[0].filters).toEqual([["tenant_id", TENANT], ["id", PHOTO]]);
    expect(h.userRemoved).toEqual([path]);
    expect(h.adminRemoved).toEqual([]);
  });

  it("removes no file for a row RLS hides", async () => {
    h.dbResults.push({ data: [], error: null });
    const data = new FormData();
    data.set("id", PHOTO);
    expect((await deleteRoomTypePhoto("hostel-a", idle, data)).message).toMatch(/no longer exists/);
    expect(h.userRemoved).toEqual([]);
  });
});

describe("branding images", () => {
  const old = `${TENANT}/branding/logo-oldoldoldold.webp`;

  it("replaces the logo and removes the old file", async () => {
    h.dbResults.push({ data: { logo_path: old }, error: null }, { data: [{ tenant_id: TENANT }], error: null });
    expect((await uploadBrandingImage("hostel-a", idle, brandingForm("logo", imageFile()))).status).toBe("success");
    const path = h.adminUploads[0].path;
    expect(path).toMatch(new RegExp(`^${TENANT}/branding/logo-[0-9a-f]{24}\\.webp$`));
    expect(h.dbCalls[1].payload).toEqual({ logo_path: path });
    expect(h.userRemoved).toEqual([old]);
  });

  it("keeps the old file when saving the new path fails", async () => {
    h.dbResults.push({ data: { logo_path: old }, error: null }, { data: null, error: { code: "23514" } });
    expect((await uploadBrandingImage("hostel-a", idle, brandingForm("logo", imageFile()))).status).toBe("error");
    expect(h.userRemoved).toEqual([]);
    expect(h.adminRemoved).toEqual([h.adminUploads[0].path]);
  });

  it("needs settings.manage", async () => {
    h.access = member(["inventory.manage"]);
    expect((await uploadBrandingImage("hostel-a", idle, brandingForm("logo", imageFile()))).message).toMatch(/permission/);
    expect(h.dbCalls).toEqual([]);
    expect(h.adminUploads).toEqual([]);
  });

  it("refuses an unknown image kind", async () => {
    expect((await uploadBrandingImage("hostel-a", idle, brandingForm("payments", imageFile()))).fieldErrors).toHaveProperty("kind");
    expect(h.adminUploads).toEqual([]);
  });

  it("clears the main photo", async () => {
    const hero = `${TENANT}/branding/hero-oldoldoldold.webp`;
    h.dbResults.push({ data: { hero_image_path: hero }, error: null }, { data: [{ tenant_id: TENANT }], error: null });
    expect((await removeBrandingImage("hostel-a", idle, brandingForm("hero", null))).status).toBe("success");
    expect(h.dbCalls[1].payload).toEqual({ hero_image_path: null });
    expect(h.userRemoved).toEqual([hero]);
  });
});

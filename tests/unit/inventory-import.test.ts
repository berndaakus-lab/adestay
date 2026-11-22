import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_IMPORT_ROWS, parseBeds, parseCsvLine, parseInventoryCsv } from "@/lib/validation/inventory-csv";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const HEADER = "room_type,room,block,floor,beds";

const h = vi.hoisted(() => ({
  rpc: [] as { name: string; args: Record<string, unknown> }[],
  result: null as null | { data: unknown; error: { code: string } | null },
  access: null as null | { tenantId: string; slug: string; name: string; role: string; permissions: string[] },
  revalidate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidate }));
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
vi.mock("@/lib/server/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      h.rpc.push({ name, args });
      return h.result ?? { data: { ok: true, rooms: 1, beds: 2, by_type: [{ room_type: "Double", rooms: 1, beds: 2 }], error_count: 0, errors: [] }, error: null };
    },
  }),
}));

import { commitInventoryImport, previewInventoryImport } from "@/lib/server/actions/import-actions";

const idle = { status: "idle" as const };
const upload = (content: BlobPart, extra: Record<string, string> = {}) => {
  const data = new FormData();
  data.set("file", new File([content], "rooms.csv", { type: "text/csv" }));
  for (const [key, value] of Object.entries(extra)) data.set(key, value);
  return data;
};

describe("parseCsvLine", () => {
  it.each([
    ["a,b,c", ["a", "b", "c"]],
    [" a , b ", ["a", "b"]],
    ['"a,b",c', ["a,b", "c"]],
    ['"say ""hi""",x', ['say "hi"', "x"]],
    ["a,,c", ["a", "", "c"]],
    ["a,b,", ["a", "b", ""]],
    ['"",b', ["", "b"]],
  ])("%s", (line, expected) => expect(parseCsvLine(line)).toEqual(expected));

  it.each(['"open', 'a"b,c', '"a"b,c', 'a,"b'])("refuses bad quoting: %s", (line) => expect(typeof parseCsvLine(line)).toBe("string"));
});

describe("parseBeds", () => {
  it("expands a count to letters", () => expect(parseBeds("4")).toEqual(["A", "B", "C", "D"]));
  it("reads labels", () => {
    expect(parseBeds("Left; Right")).toEqual(["Left", "Right"]);
    expect(parseBeds("1|2")).toEqual(["1", "2"]);
    expect(parseBeds("Window")).toEqual(["Window"]);
  });
  it.each(["", "0", "13", "A;;B", ";", Array.from({ length: 13 }, (_, i) => `b${i}`).join(";")])("refuses %s", (v) => expect(parseBeds(v)).toBeNull());
});

describe("parseInventoryCsv", () => {
  it("parses a spreadsheet export: BOM, CRLF, blank rows, any column order and header case", () => {
    const { rows, errors } = parseInventoryCsv(`﻿Room Type,Beds,Room\r\nDouble,2,C-214\r\n,,\r\n\r\n"Quad, shared",4,C-215\r\n`);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 2, room_type: "Double", room: "C-214", block: "", floor: "", beds: ["A", "B"] },
      { line: 5, room_type: "Quad, shared", room: "C-215", block: "", floor: "", beds: ["A", "B", "C", "D"] },
    ]);
  });

  it.each([
    ["an empty file", ""],
    ["no rooms", `${HEADER}\n`],
    ["a missing column", "room_type,room\nDouble,C-1"],
    ["an unknown column", `${HEADER},price\nDouble,C-1,,,2,100`],
    ["a repeated column", "room_type,room,room,beds\nDouble,C-1,C-2,2"],
    ["binary content", `${HEADER}\nDouble,C-1,\u0000,,2`],
  ])("refuses %s", (_name, text) => {
    const { rows, errors } = parseInventoryCsv(text);
    expect(rows).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("reports each bad row with its line and continues", () => {
    const { errors } = parseInventoryCsv(`${HEADER}\nDouble,C-1,,,2\nDouble,C-2,,2\nDouble,"C-3,,,2\nDouble,C-4,,,99`);
    expect(errors.map((e) => [e.line, e.field])).toEqual([[3, "row"], [4, "row"], [5, "beds"]]);
  });

  it("does not let a quoted value span lines", () => {
    expect(parseInventoryCsv(`${HEADER}\nDouble,"C-1\n2",,,2`).errors.length).toBeGreaterThan(0);
  });

  it("accepts the maximum and refuses one more", () => {
    const make = (n: number) => [HEADER, ...Array.from({ length: n }, (_, i) => `Double,R-${i},,,2`)].join("\n");
    expect(parseInventoryCsv(make(MAX_IMPORT_ROWS)).rows).toHaveLength(MAX_IMPORT_ROWS);
    const over = parseInventoryCsv(make(MAX_IMPORT_ROWS + 1));
    expect(over.rows).toEqual([]);
    expect(over.errors[0].message).toMatch(/at most 500/);
  });
});

describe("import actions", () => {
  beforeEach(() => {
    h.rpc.length = 0;
    h.result = null;
    h.access = { tenantId: TENANT, slug: "hostel-a", name: "Hostel A", role: "staff", permissions: ["inventory.manage"] };
    h.revalidate.mockClear();
  });

  it("previews as a dry run for the member's hostel, ignoring the form", async () => {
    const result = await previewInventoryImport("hostel-a", idle, upload(`${HEADER}\nDouble,C-1,,,2`, { tenantId: OTHER }));
    expect(result).toMatchObject({ status: "preview", rooms: 1, beds: 2 });
    expect(h.rpc[0]).toMatchObject({ name: "import_inventory", args: { p_tenant_id: TENANT, p_dry_run: true } });
    expect(h.revalidate).not.toHaveBeenCalled();
  });

  it("commits for real and refreshes", async () => {
    expect((await commitInventoryImport("hostel-a", idle, upload(`${HEADER}\nDouble,C-1,,,2`))).status).toBe("imported");
    expect(h.rpc[0].args.p_dry_run).toBe(false);
    expect(h.revalidate).toHaveBeenCalledWith("/t/hostel-a", "layout");
  });

  it("needs inventory.manage", async () => {
    h.access = { ...h.access!, permissions: ["inventory.read"] };
    expect((await commitInventoryImport("hostel-a", idle, upload(`${HEADER}\nDouble,C-1,,,2`))).message).toMatch(/permission/);
    expect(h.rpc).toEqual([]);
  });

  it("does not call the database for a malformed file", async () => {
    const result = await commitInventoryImport("hostel-a", idle, upload(`${HEADER}\nDouble,C-1`));
    expect(result).toMatchObject({ status: "error", errorCount: 1 });
    expect(h.rpc).toEqual([]);
  });

  it("refuses a missing, oversized or non-UTF-8 file", async () => {
    expect((await previewInventoryImport("hostel-a", idle, new FormData())).message).toMatch(/Choose/);
    expect((await previewInventoryImport("hostel-a", idle, upload("x".repeat(200 * 1024 + 1)))).message).toMatch(/too large/);
    expect((await previewInventoryImport("hostel-a", idle, upload(new Uint8Array([0x72, 0xff, 0xfe, 0x6d])))).message).toMatch(/UTF-8/);
    expect(h.rpc).toEqual([]);
  });

  it("shows row errors from the database", async () => {
    h.result = { data: { ok: false, rooms: 0, beds: 0, by_type: [], error_count: 1, errors: [{ line: 2, field: "room", message: "This room already exists." }] }, error: null };
    const result = await commitInventoryImport("hostel-a", idle, upload(`${HEADER}\nDouble,C-1,,,2`));
    expect(result).toMatchObject({ status: "error", errorCount: 1, errors: [{ line: 2, field: "room" }] });
    expect(h.revalidate).not.toHaveBeenCalled();
  });

  it("maps a concurrent duplicate", async () => {
    h.result = { data: null, error: { code: "23505" } };
    expect((await commitInventoryImport("hostel-a", idle, upload(`${HEADER}\nDouble,C-1,,,2`))).message).toMatch(/Nothing was imported/);
  });
});

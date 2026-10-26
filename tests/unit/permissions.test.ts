import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hasPermission, PERMISSIONS, type TenantAccess } from "@/lib/permissions";

// The TypeScript catalog must equal app.permission_catalog() in the migrations.
function sqlCatalog(): string[] {
  const dir = path.resolve(__dirname, "../../supabase/migrations");
  const sql = readdirSync(dir)
    .sort()
    .map((f) => readFileSync(path.join(dir, f), "utf8"))
    .join("\n");
  const body = sql.match(/create function app\.permission_catalog\(\)[\s\S]*?\$\$([\s\S]*?)\$\$/)?.[1] ?? "";
  return [...body.matchAll(/'([a-z_]+\.[a-z_]+)'/g)].map((m) => m[1]);
}

const staff = (permissions: string[]): TenantAccess => ({
  tenantId: "t1",
  slug: "hostel-a",
  name: "Hostel A",
  role: "staff",
  permissions,
});

describe("permission catalog", () => {
  it("matches app.permission_catalog() in the SQL migrations exactly", () => {
    expect([...PERMISSIONS].sort()).toEqual(sqlCatalog().sort());
  });

  it("has 28 permissions with no duplicates", () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
    expect(PERMISSIONS.length).toBe(28);
  });
});

describe("hasPermission", () => {
  it("grants everything to hostel admins", () => {
    expect(hasPermission({ ...staff([]), role: "hostel_admin" }, "payments.configure")).toBe(true);
  });

  it("grants staff only what their permission set lists", () => {
    expect(hasPermission(staff(["checkin.manage"]), "checkin.manage")).toBe(true);
    expect(hasPermission(staff(["checkin.manage"]), "bookings.review")).toBe(false);
  });

  it("denies when there is no membership", () => {
    expect(hasPermission(null, "bookings.read")).toBe(false);
    expect(hasPermission(undefined, "bookings.read")).toBe(false);
  });
});

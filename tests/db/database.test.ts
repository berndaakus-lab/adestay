import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createMigratedDatabase, pgtapFiles, runPgtapFile, supabaseDir } from "./pglite";

describe("migrations", () => {
  it("apply cleanly to an empty database, in order", async () => {
    const db = await createMigratedDatabase();
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from pg_tables where schemaname = 'public'",
    );
    expect(rows[0].n).toBeGreaterThan(0);
    await db.close();
  });

  it("accept the development seed data", async () => {
    const db = await createMigratedDatabase();
    await db.exec(readFileSync(path.join(supabaseDir, "seed.sql"), "utf8"));
    const tenants = await db.query<{ slug: string }>("select slug::text from public.tenants order by slug");
    expect(tenants.rows.map((r) => r.slug)).toEqual(["alder-house", "cedar-court"]);
    const domains = await db.query<{ n: number }>(
      "select count(*)::int as n from public.tenant_domains where status = 'verified' and is_primary",
    );
    expect(domains.rows[0].n).toBe(2);
    await db.close();
  });
});

describe("pgTAP", () => {
  for (const file of pgtapFiles()) {
    it(path.basename(file), async () => {
      const db = await createMigratedDatabase();
      const result = await runPgtapFile(db, file);
      await db.close();

      expect(result.failed, result.output.join("\n")).toEqual([]);
      expect(result.planned, "missing plan()").not.toBeNull();
      expect(result.passed.length, result.output.join("\n")).toBe(result.planned);
    });
  }
});

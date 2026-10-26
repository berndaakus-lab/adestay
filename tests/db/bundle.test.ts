import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { expect, it } from "vitest";
import { supabaseDir } from "./pglite";

// The single-file bundle pasted into the Supabase SQL Editor must apply in one go.
it("the SQL Editor bundle (migrations + seed) applies to an empty database", async () => {
  const root = path.resolve(supabaseDir, "..");
  execFileSync(process.execPath, [path.join(root, "scripts", "bundle-migrations.mjs")], { cwd: root });
  const db = await PGlite.create({ extensions: { btree_gist, citext, pgcrypto } });
  await db.exec(readFileSync(path.join(supabaseDir, "tests", "support", "supabase_shim.sql"), "utf8"));
  await db.exec(readFileSync(path.join(supabaseDir, ".temp", "apply-all.sql"), "utf8"));
  const { rows } = await db.query<{ n: number }>("select count(*)::int as n from public.tenants");
  expect(rows[0].n).toBe(2);
  await db.close();
});

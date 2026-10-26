import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { pgtap } from "@electric-sql/pglite-pgtap";

const root = path.resolve(__dirname, "../..");
export const supabaseDir = path.join(root, "supabase");

const read = (file: string) => readFileSync(file, "utf8");

export function migrationFiles(): string[] {
  const dir = path.join(supabaseDir, "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join(dir, f));
}

export function pgtapFiles(): string[] {
  const dir = path.join(supabaseDir, "tests", "database");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".test.sql"))
    .sort()
    .map((f) => path.join(dir, f));
}

/**
 * A fresh in-memory Postgres with Supabase's platform pieces stubbed (supabase/tests/support)
 * and every migration applied in order, exactly as `supabase db push` would apply them.
 */
export async function createMigratedDatabase(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { btree_gist, citext, pgcrypto, pgtap } });
  await db.exec(read(path.join(supabaseDir, "tests", "support", "supabase_shim.sql")));
  await db.exec("create extension if not exists pgtap with schema extensions;");
  await db.exec("set search_path to public, extensions;");
  for (const file of migrationFiles()) {
    try {
      await db.exec(read(file));
    } catch (error) {
      throw new Error(`Migration failed: ${path.basename(file)}\n${(error as Error).message}`);
    }
  }
  return db;
}

export interface TapResult {
  planned: number | null;
  passed: string[];
  failed: string[];
  output: string[];
}

/** Runs one pgTAP file and parses its TAP output. */
export async function runPgtapFile(db: PGlite, file: string): Promise<TapResult> {
  const results = await db.exec(read(file));
  const output = results
    .flatMap((r) => r.rows)
    .map((row) => Object.values(row as Record<string, unknown>)[0])
    .filter((v): v is string => typeof v === "string");

  const lines = output.flatMap((o) => o.split("\n"));
  const planLine = lines.find((l) => /^1\.\.\d+$/.test(l));
  return {
    planned: planLine ? Number(planLine.slice(3)) : null,
    passed: lines.filter((l) => /^ok \d+/.test(l)),
    failed: lines.filter((l) => /^not ok \d+/.test(l)),
    output: lines,
  };
}

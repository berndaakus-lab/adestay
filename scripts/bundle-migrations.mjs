// Bundles every migration (in order) and optionally the dev seed into one SQL file
// for pasting into the Supabase dashboard SQL Editor (no CLI or database password needed).
//
//   npm run db:bundle            -> supabase/.temp/apply-all.sql (migrations + seed)
//   npm run db:bundle -- --no-seed
//   npm run db:bundle -- --since 20261027000000 --no-seed   -> only migrations newer than that timestamp
//
// Output goes to supabase/.temp/, which is gitignored.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const migrationsDir = path.join(root, "supabase", "migrations");
const includeSeed = !process.argv.includes("--no-seed");
const sinceIndex = process.argv.indexOf("--since");
const since = sinceIndex > -1 ? process.argv[sinceIndex + 1] : null;
if (sinceIndex > -1 && !/^\d{14}$/.test(since ?? "")) throw new Error("--since needs a 14-digit migration timestamp");

const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql") && (!since || f.slice(0, 14) > since)).sort();
const parts = [
  "-- AdeStay: all migrations bundled for the Supabase SQL Editor.",
  `-- Generated ${new Date().toISOString()} from supabase/migrations (${files.length} files).`,
  "-- Run once on an EMPTY dev database. Do not edit here; change the migration files instead.",
  "",
];

for (const file of files) {
  parts.push(`-- ============ ${file} ============`, readFileSync(path.join(migrationsDir, file), "utf8"), "");
}

if (includeSeed) {
  parts.push("-- ============ seed.sql (development data only) ============", readFileSync(path.join(root, "supabase", "seed.sql"), "utf8"));
}

const outDir = path.join(root, "supabase", ".temp");
mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "apply-all.sql");
writeFileSync(out, parts.join("\n"));
console.log(`Wrote ${path.relative(root, out)} (${files.length} migrations${includeSeed ? " + seed" : ""}).`);

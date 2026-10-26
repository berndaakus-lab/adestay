import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SERVICE_ROLE_ALLOWLIST } from "../../eslint.config.mjs";

// Independent of ESLint: scans the source tree for service-role usage (SECURITY_THREAT_MODEL T10).
const root = path.resolve(__dirname, "../..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|js|jsx|mjs)$/.test(name) ? [full] : [];
  });
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped.replace(/\u0000/g, ".*")}$`);
}

const allowed = SERVICE_ROLE_ALLOWLIST.map(globToRegExp);
const isAllowed = (file: string) => allowed.some((re) => re.test(file));
const files = sourceFiles(path.join(root, "src")).map((f) => ({
  rel: path.relative(root, f).split(path.sep).join("/"),
  text: readFileSync(f, "utf8"),
}));

describe("service role allow-list", () => {
  it("scans a non-trivial source tree", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("imports the service-role client only from allow-listed modules", () => {
    const offenders = files
      .filter((f) => /from\s+["'][^"']*supabase\/admin["']|import\(\s*["'][^"']*supabase\/admin["']\s*\)/.test(f.text))
      .map((f) => f.rel)
      .filter((rel) => !isAllowed(rel));
    expect(offenders).toEqual([]);
  });

  it("reads SUPABASE_SERVICE_ROLE_KEY only in the admin client module", () => {
    const readers = files.filter((f) => f.text.includes("SUPABASE_SERVICE_ROLE_KEY")).map((f) => f.rel);
    expect(readers).toEqual(["src/lib/server/supabase/admin.ts"]);
  });

  it("never exposes the service role key through a NEXT_PUBLIC_ variable", () => {
    const leaks = files.filter((f) => /NEXT_PUBLIC_[A-Z_]*SERVICE_ROLE/.test(f.text)).map((f) => f.rel);
    expect(leaks).toEqual([]);
  });

  it("marks the admin client server-only", () => {
    const admin = files.find((f) => f.rel === "src/lib/server/supabase/admin.ts");
    expect(admin?.text).toMatch(/^import "server-only";/);
  });
});

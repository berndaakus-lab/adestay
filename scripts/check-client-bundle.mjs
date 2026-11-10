// Phase 1 acceptance criterion 7: the client bundle contains no service-role key.
// Run after `next build`. Scans every file sent to browsers (.next/static) for:
//  - the service-role environment variable name,
//  - Supabase secret API keys (sb_secret_...),
//  - any JWT whose decoded payload says role "service_role",
//  - the actual key value, when SUPABASE_SERVICE_ROLE_KEY is set in the environment (CI secrets).
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const staticDir = path.join(root, ".next", "static");

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

let all;
try {
  all = files(staticDir).filter((f) => /\.(js|css|html|json|txt|map)$/.test(f));
} catch {
  console.error("No .next/static directory: run `npm run build` first.");
  process.exit(2);
}

// Any JWT-shaped token whose decoded payload has role "service_role".
const JWT = /eyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g;
function hasServiceRoleJwt(text) {
  for (const token of text.match(JWT) ?? []) {
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
      if (payload?.role === "service_role") return true;
    } catch {
      // not a JWT after all
    }
  }
  return false;
}

const patterns = [
  { name: "service-role env var name", test: (t) => t.includes("SUPABASE_SERVICE_ROLE_KEY") },
  { name: "Supabase secret key (sb_secret_)", test: (t) => /sb_secret_[A-Za-z0-9_-]{10,}/.test(t) },
  { name: "service_role JWT", test: hasServiceRoleJwt },
];
const realKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (realKey && realKey.length >= 20) patterns.push({ name: "actual service-role key value", test: (t) => t.includes(realKey) });

const findings = [];
for (const file of all) {
  const text = readFileSync(file, "utf8");
  for (const p of patterns) if (p.test(text)) findings.push(`${path.relative(root, file)}: ${p.name}`);
}

if (findings.length) {
  console.error(`Service-role material found in the client bundle:\n  ${findings.join("\n  ")}`);
  process.exit(1);
}
console.log(`Client bundle clean: ${all.length} files scanned, ${patterns.length} checks${realKey ? " (including the real key)" : ""}.`);

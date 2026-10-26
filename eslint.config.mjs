import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * The only places allowed to use the Supabase SERVICE ROLE (bypasses row level security).
 * docs/SYSTEM_ARCHITECTURE.md §4 rule 3. Extending this list needs product-owner review.
 * tests/unit/service-role-allowlist.test.ts enforces the same list independently of ESLint.
 */
export const SERVICE_ROLE_ALLOWLIST = [
  "src/lib/server/supabase/admin.ts",
  "src/app/api/webhooks/**",
  "src/app/api/cron/**",
  "src/lib/server/booking-lookup/**",
  "src/lib/server/provisioning/**",
];

const serviceRoleMessage =
  "The service-role client bypasses row level security. Only modules in SERVICE_ROLE_ALLOWLIST (eslint.config.mjs) may use it.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx,js,jsx,mjs}"],
    ignores: SERVICE_ROLE_ALLOWLIST,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "@/lib/server/supabase/admin", message: serviceRoleMessage }],
          patterns: [{ group: ["**/supabase/admin", "**/supabase/admin.ts"], message: serviceRoleMessage }],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[property.name='SUPABASE_SERVICE_ROLE_KEY']",
          message: serviceRoleMessage,
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Read-only Figma Make export, not part of the app
    "design-reference/**",
  ]),
]);

export default eslintConfig;

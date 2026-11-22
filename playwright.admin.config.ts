import { defineConfig, devices } from "@playwright/test";

/**
 * Staff and platform screens with signed-in data, against tests/e2e-admin/fake-supabase.mjs.
 * Needs no keys. Runs the production build (`npm run build` first). One worker, because the
 * tests share the fake API's in-memory state.
 */
const APP_PORT = 3100;
const API_PORT = 54399;

export default defineConfig({
  testDir: "tests/e2e-admin",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${APP_PORT}`, trace: "retain-on-failure", actionTimeout: 30_000 },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "phone-360", use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 780 } } },
  ],
  webServer: [
    {
      command: "node tests/e2e-admin/fake-supabase.mjs",
      url: `http://127.0.0.1:${API_PORT}/__health`,
      reuseExistingServer: false,
      env: { FAKE_SUPABASE_PORT: String(API_PORT) },
    },
    {
      command: `npm run start -- -p ${APP_PORT}`,
      url: `http://localhost:${APP_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      // Not real credentials: they only reach the local fake API.
      env: {
        NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${API_PORT}`,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "fake-anon-key-for-local-e2e-only",
        SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-for-local-e2e-only",
        VERCEL_API_TOKEN: "",
        NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN: "",
      },
    },
  ],
});

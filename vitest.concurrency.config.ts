import { defineConfig } from "vitest/config";

// Booking race tests on a real multi-connection PostgreSQL 17 (embedded-postgres, dev only).
// Run manually with `npm run test:db:parallel`. Not part of `npm test` or CI.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/concurrency/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});

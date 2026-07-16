import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Minimal, explicit Vitest setup for the P0 regression suite (see
 * docs/testing/ARGUS_TESTING_BASELINE.md). Deliberately does NOT include the
 * pre-existing `src/**\/__tests__/*.test.ts` files — those use a mix of a
 * manual `runXTest()` convention and unimported Jest-style globals, neither
 * of which this config wires up, so they are inert here by design rather
 * than by accident. See the baseline doc for their migration status.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", ".next", "dist", "build"],
    // No global test APIs — every test file imports describe/it/expect/vi
    // explicitly from "vitest". This avoids touching tsconfig's ambient
    // types (and therefore avoids any interaction with the pre-existing
    // __tests__ files' own unresolved describe/it globals).
    globals: false,
    setupFiles: ["./tests/setup.ts"],
    // No .env/.env.local is loaded by this config (Vitest's `loadEnv` is
    // never called here) — process.env starts as whatever the invoking
    // shell already has, and every test that cares about specific env vars
    // sets/restores them explicitly via tests/helpers/withEnv.ts. Nothing
    // in this suite depends on a real DATABASE_URL/AUTH_SECRET/etc.
    env: {},
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});

import { afterEach, beforeEach, vi } from "vitest";

/**
 * Global network guard for the whole suite (see docs/testing/
 * ARGUS_TESTING_BASELINE.md, "Aislamiento de red"). Any code path that
 * reaches an unmocked `fetch()` during a test fails loudly and immediately
 * instead of silently hitting a real external service (Overpass, Supabase
 * REST, NASA FIRMS, etc.). Tests that legitimately need to exercise a
 * fetch-calling function must mock that function's module directly (as the
 * P0 suite does for `syncCriticalPoisForBbox`, `knowledgePersistenceService`,
 * etc.) rather than relying on a stubbed `fetch` return value.
 */
function blockedFetch(): never {
  throw new Error(
    "Network call blocked in tests: global fetch() was invoked without an explicit mock. " +
      "Mock the calling module directly instead of relying on network access."
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(blockedFetch));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

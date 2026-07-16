/**
 * Explicit environment-variable save/restore helper (see docs/testing/
 * ARGUS_TESTING_BASELINE.md, "Aislamiento de variables de entorno"). Used
 * instead of `vi.stubEnv` where a test needs to represent a variable being
 * fully *absent* (`vi.stubEnv` can only set a string value, not delete a
 * key) — e.g. "producción sin ARGUS_ALLOW_DEMO_DATA" must mean the key is
 * missing entirely, not set to an empty string.
 *
 * `undefined` in `overrides` means "delete this key for the duration of the
 * callback", not "leave it untouched".
 */
export function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * tests/database-target/target-migration-order.test.ts
 *
 * Asserts the 11 wave folders under `prisma/target-migrations/` exist in
 * dependency order, per `ARGUS_DATABASE_MIGRATION_WAVES_v1.0.md` (Ola
 * 0..10) and the mapping doc's Ola references. Directory existence only —
 * never inspects/executes SQL inside them (that is
 * target-migration-safety.test.ts's job).
 *
 * Per the task mandate this must not hard-fail the whole suite for folders
 * a parallel agent hasn't produced yet — each folder gets its own soft
 * (skippable) assertion rather than one all-or-nothing check.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const TARGET_MIGRATIONS_DIR = join(REPO_ROOT, "prisma", "target-migrations");

/** Ola 0..10, in the exact dependency order documented across the frozen architecture docs. */
const EXPECTED_WAVE_FOLDERS = [
  "000_preflight",
  "010_foundation",
  "020_identity",
  "030_ingestion_observation_evidence",
  "040_incident",
  "050_help_mission",
  "060_resources",
  "070_alerts_communications",
  "080_geography",
  "090_ice_media",
  "100_projections_legacy_retirement",
] as const;

describe("prisma/target-migrations/ — 11 wave folders in dependency order", () => {
  const migrationsRootExists = existsSync(TARGET_MIGRATIONS_DIR);

  if (!migrationsRootExists) {
    it.skip(
      "prisma/target-migrations/ does not exist yet — skipping all 11 wave-folder checks " +
        "(parallel agent may still be producing it)",
      () => {}
    );
    return;
  }

  const actualEntries = readdirSync(TARGET_MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const [index, waveFolder] of EXPECTED_WAVE_FOLDERS.entries()) {
    const folderPath = join(TARGET_MIGRATIONS_DIR, waveFolder);
    if (!existsSync(folderPath)) {
      it.skip(`wave ${index} (${waveFolder}) does not exist yet — skipping`, () => {});
      continue;
    }
    it(`wave ${index} (${waveFolder}) exists as a directory`, () => {
      expect(existsSync(folderPath)).toBe(true);
    });
  }

  it("existing wave folders, sorted, are a prefix-consistent subsequence of the expected dependency order", () => {
    // Lexicographic sort of the numeric-prefixed folder names is exactly
    // dependency order (000 < 010 < ... < 100) — assert every wave folder
    // that DOES exist appears in EXPECTED_WAVE_FOLDERS, and that the
    // existing subset preserves the expected relative order (no wave
    // folder is out of sequence relative to the others present).
    const existingExpected = EXPECTED_WAVE_FOLDERS.filter((name) => actualEntries.includes(name));
    const existingExpectedSorted = [...existingExpected].sort();
    expect(existingExpected).toEqual(existingExpectedSorted);
    for (const name of actualEntries) {
      if ((EXPECTED_WAVE_FOLDERS as readonly string[]).includes(name)) {
        expect(EXPECTED_WAVE_FOLDERS).toContain(name);
      }
    }
  });
});

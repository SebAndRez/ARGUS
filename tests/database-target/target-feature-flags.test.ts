import { describe, expect, it } from "vitest";
import {
  TARGET_MIGRATION_FLAG_DEFAULTS,
  assertCutoverAllowed,
  getTargetMigrationFlags,
  isTargetMigrationFlagEnabled,
  resolveCutoverFlag,
} from "../../src/lib/database-target/flags/targetMigrationFlags";

describe("targetMigrationFlags defaults", () => {
  it("all 4 flags default to false with an empty env", () => {
    expect(getTargetMigrationFlags({})).toEqual(TARGET_MIGRATION_FLAG_DEFAULTS);
  });

  it("all 4 flags default to false", () => {
    expect(TARGET_MIGRATION_FLAG_DEFAULTS).toEqual({
      targetDatabaseRead: false,
      targetDatabaseShadowWrite: false,
      targetDatabaseDualRead: false,
      targetDatabaseCutover: false,
    });
  });

  it("only the exact string 'true' enables a flag — fails closed on typos", () => {
    const env = {
      ARGUS_TARGET_DB_READ_ENABLED: "1",
      ARGUS_TARGET_DB_SHADOW_WRITE_ENABLED: "TRUE",
      ARGUS_TARGET_DB_DUAL_READ_ENABLED: "yes",
    };
    expect(getTargetMigrationFlags(env)).toEqual(TARGET_MIGRATION_FLAG_DEFAULTS);
  });

  it("enables a flag when its env var is exactly 'true'", () => {
    const flags = getTargetMigrationFlags({ ARGUS_TARGET_DB_READ_ENABLED: "true" });
    expect(flags.targetDatabaseRead).toBe(true);
    expect(flags.targetDatabaseShadowWrite).toBe(false);
  });

  it("isTargetMigrationFlagEnabled reads a single flag", () => {
    expect(isTargetMigrationFlagEnabled("targetDatabaseDualRead", { ARGUS_TARGET_DB_DUAL_READ_ENABLED: "true" })).toBe(
      true
    );
    expect(isTargetMigrationFlagEnabled("targetDatabaseDualRead", {})).toBe(false);
  });
});

describe("assertCutoverAllowed", () => {
  it("blocks when evidence is undefined, naming all 5 reasons", () => {
    const result = assertCutoverAllowed(undefined);
    expect(result.allowed).toBe(false);
    expect(result.blockingReasons).toHaveLength(5);
  });

  it("blocks when drift 13/15 is not reconciled even if everything else is satisfied", () => {
    const result = assertCutoverAllowed({
      drift13Vs15Reconciled: false,
      rehearsalCiApproved: true,
      backfillComplete: true,
      rowCountsMatch: true,
      rollbackAvailable: true,
    });
    expect(result.allowed).toBe(false);
    expect(result.blockingReasons).toEqual(["drift 13/15 not reconciled"]);
  });

  it("blocks when any single precondition is missing", () => {
    const full = {
      drift13Vs15Reconciled: true,
      rehearsalCiApproved: true,
      backfillComplete: true,
      rowCountsMatch: true,
      rollbackAvailable: true,
    };
    for (const key of Object.keys(full) as (keyof typeof full)[]) {
      const result = assertCutoverAllowed({ ...full, [key]: false });
      expect(result.allowed).toBe(false);
      expect(result.blockingReasons.length).toBeGreaterThan(0);
    }
  });

  it("allows only when all 5 preconditions are satisfied", () => {
    const result = assertCutoverAllowed({
      drift13Vs15Reconciled: true,
      rehearsalCiApproved: true,
      backfillComplete: true,
      rowCountsMatch: true,
      rollbackAvailable: true,
    });
    expect(result).toEqual({ allowed: true, blockingReasons: [] });
  });
});

describe("resolveCutoverFlag", () => {
  const fullEvidence = {
    drift13Vs15Reconciled: true,
    rehearsalCiApproved: true,
    backfillComplete: true,
    rowCountsMatch: true,
    rollbackAvailable: true,
  };

  it("stays false when the env var is unset, regardless of evidence", () => {
    expect(resolveCutoverFlag(fullEvidence, {})).toBe(false);
  });

  it("stays false when the env var is true but evidence is incomplete", () => {
    expect(
      resolveCutoverFlag(
        { ...fullEvidence, rollbackAvailable: false },
        { ARGUS_TARGET_DB_CUTOVER_ENABLED: "true" }
      )
    ).toBe(false);
  });

  it("is true only when the env var is true AND evidence is fully satisfied", () => {
    expect(resolveCutoverFlag(fullEvidence, { ARGUS_TARGET_DB_CUTOVER_ENABLED: "true" })).toBe(true);
  });
});

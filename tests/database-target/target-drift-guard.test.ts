import { describe, expect, it } from "vitest";
import {
  DRIFT_GUARD_CONSTANTS,
  evaluateDriftReconciliation,
} from "../../scripts/database-target/lib/driftGuard.mjs";

const validEvidence = () => ({
  localMigrationFolderCount: 13,
  productionMigrationRowCount: 15,
  unidentifiedRowMigrationNames: ["20260601000000_mystery_one", "20260601000001_mystery_two"],
  reconciliationApprovedBy: "ops-lead@example.com",
  reconciliationApprovedAt: "2026-07-20T00:00:00Z",
});

describe("evaluateDriftReconciliation", () => {
  it("fails closed with no evidence at all", () => {
    const result = evaluateDriftReconciliation(undefined);
    expect(result.ready).toBe(false);
    expect(result.blockingReasons.length).toBeGreaterThan(0);
  });

  it("fails closed with an empty object", () => {
    const result = evaluateDriftReconciliation({});
    expect(result.ready).toBe(false);
  });

  it("passes with complete, correctly-shaped evidence", () => {
    const result = evaluateDriftReconciliation(validEvidence());
    expect(result).toEqual({ ready: true, blockingReasons: [] });
  });

  it("knows the exact known counts (13 folders, 15 rows, 2 unidentified)", () => {
    expect(DRIFT_GUARD_CONSTANTS.KNOWN_LOCAL_FOLDER_COUNT).toBe(13);
    expect(DRIFT_GUARD_CONSTANTS.KNOWN_PRODUCTION_ROW_COUNT).toBe(15);
    expect(DRIFT_GUARD_CONSTANTS.KNOWN_UNIDENTIFIED_ROW_COUNT).toBe(2);
  });

  it("rejects a mismatched localMigrationFolderCount", () => {
    const result = evaluateDriftReconciliation({ ...validEvidence(), localMigrationFolderCount: 14 });
    expect(result.ready).toBe(false);
  });

  it("rejects a mismatched productionMigrationRowCount", () => {
    const result = evaluateDriftReconciliation({ ...validEvidence(), productionMigrationRowCount: 16 });
    expect(result.ready).toBe(false);
  });

  it("rejects when unidentifiedRowMigrationNames is empty (the 2 rows were never identified)", () => {
    const result = evaluateDriftReconciliation({ ...validEvidence(), unidentifiedRowMigrationNames: [] });
    expect(result.ready).toBe(false);
  });

  it("rejects when unidentifiedRowMigrationNames has the wrong count", () => {
    const result = evaluateDriftReconciliation({
      ...validEvidence(),
      unidentifiedRowMigrationNames: ["only_one"],
    });
    expect(result.ready).toBe(false);
  });

  it("rejects a blank entry in unidentifiedRowMigrationNames", () => {
    const result = evaluateDriftReconciliation({
      ...validEvidence(),
      unidentifiedRowMigrationNames: ["real_name", "   "],
    });
    expect(result.ready).toBe(false);
  });

  it("rejects a missing reconciliationApprovedBy", () => {
    const evidence = validEvidence() as Record<string, unknown>;
    delete evidence.reconciliationApprovedBy;
    const result = evaluateDriftReconciliation(evidence);
    expect(result.ready).toBe(false);
  });

  it("rejects an invalid reconciliationApprovedAt", () => {
    const result = evaluateDriftReconciliation({ ...validEvidence(), reconciliationApprovedAt: "not-a-date" });
    expect(result.ready).toBe(false);
  });
});

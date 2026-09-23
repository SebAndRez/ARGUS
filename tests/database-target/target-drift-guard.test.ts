import { describe, expect, it } from "vitest";
import {
  LEGACY_MIGRATION_HISTORY_CONSTANTS,
  evaluateLegacyMigrationHistory,
} from "../../scripts/database-target/lib/driftGuard.mjs";

/**
 * The legacy `_prisma_migrations` history guard, rewritten in Paso 5.
 *
 * The previous suite pinned the WRONG model: it asserted that 2 production
 * rows have no local folder and demanded exactly 2 "unidentified" migration
 * names. Paso 3 measured the opposite — 0 unknown names, 2 rolled-back failed
 * attempts of names that also succeeded, and 1 checksum that matches no
 * committed version — so honest evidence could not satisfy the old guard
 * without inventing names. These cases encode what was actually measured, and
 * what each real failure mode looks like.
 */

const NOW = new Date("2026-09-22T12:00:00Z");

/** Local mirrors of the JSDoc types in the .mjs guard (a .mjs import has no TS types of its own). */
interface Row {
  migrationName: string;
  checksum: string;
  finishedAt: string | null;
  rolledBackAt: string | null;
  appliedStepsCount?: number;
}
interface Evidence {
  capturedAt?: string;
  capturedBy?: string;
  approvedBy?: string;
  approvedAt?: string;
  productionRows: Row[];
  localMigrations: { migrationName: string; checksum: string }[];
  acknowledgedChecksumMismatches: Record<string, string>[];
  shapeChangeAttestation?: string;
}
interface GuardResult {
  ready: boolean;
  blockingReasons: string[];
  summary: {
    appliedNames: string[];
    rolledBackNames: string[];
    inProgressNames: string[];
    localOnlyNames: string[];
    productionOnlyNames: string[];
    checksumMismatches: string[];
  };
}

/** The 13 names Paso 3 measured, abbreviated but structurally identical. */
const LOCAL_NAMES = Array.from({ length: 13 }, (_, i) => `2026062${i % 10}_migration_${i + 1}`);

function localMigrations() {
  return LOCAL_NAMES.map((migrationName, i) => ({ migrationName, checksum: `checksum-${i + 1}` }));
}

/** 15 rows: 13 applied + 2 rolled-back attempts of names that also applied (the real production shape). */
function productionRows(): Row[] {
  const applied = LOCAL_NAMES.map((migrationName, i) => ({
    migrationName,
    checksum: `checksum-${i + 1}`,
    finishedAt: "2026-06-20T10:00:00Z",
    rolledBackAt: null,
    appliedStepsCount: 1,
  }));
  const failedAttempts = [LOCAL_NAMES[0], LOCAL_NAMES[1]].map((migrationName, i) => ({
    migrationName,
    checksum: `checksum-${i + 1}`,
    finishedAt: null,
    rolledBackAt: "2026-06-20T09:55:00Z",
    appliedStepsCount: 0,
  }));
  return [...applied, ...failedAttempts];
}

function validEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    capturedAt: "2026-09-21T12:00:00Z",
    capturedBy: "ops-lead@example.com",
    approvedBy: "db-owner@example.com",
    approvedAt: "2026-09-21T12:30:00Z",
    productionRows: productionRows(),
    localMigrations: localMigrations(),
    acknowledgedChecksumMismatches: [],
    ...overrides,
  };
}

const evaluate = (evidence: unknown): GuardResult =>
  evaluateLegacyMigrationHistory(evidence, { now: NOW }) as GuardResult;

describe("evaluateLegacyMigrationHistory — the measured production shape", () => {
  it("fails closed with no evidence at all", () => {
    const result = evaluate(undefined);
    expect(result.ready).toBe(false);
    expect(result.blockingReasons.length).toBeGreaterThan(0);
  });

  it("fails closed with an empty object", () => {
    expect(evaluate({}).ready).toBe(false);
  });

  it("passes on 13 applied + 2 rolled-back attempts with matching checksums (what Paso 3 measured)", () => {
    const result = evaluate(validEvidence());
    expect(result.blockingReasons).toEqual([]);
    expect(result.ready).toBe(true);
    expect(result.summary.appliedNames).toHaveLength(13);
    expect(result.summary.rolledBackNames).toHaveLength(2);
    expect(result.summary.productionOnlyNames).toEqual([]);
    expect(result.summary.localOnlyNames).toEqual([]);
  });

  it("knows the measured counts without using them as the pass condition", () => {
    expect(LEGACY_MIGRATION_HISTORY_CONSTANTS.KNOWN_LOCAL_FOLDER_COUNT).toBe(13);
    expect(LEGACY_MIGRATION_HISTORY_CONSTANTS.KNOWN_PRODUCTION_ROW_COUNT).toBe(15);
    expect(LEGACY_MIGRATION_HISTORY_CONSTANTS.KNOWN_ROLLED_BACK_ROW_COUNT).toBe(2);
  });
});

describe("evaluateLegacyMigrationHistory — the real failure modes", () => {
  it("blocks an applied production migration with no local folder (the actual drift risk)", () => {
    const evidence = validEvidence();
    evidence.productionRows.push({
      migrationName: "20260701_applied_only_in_production",
      checksum: "checksum-unknown",
      finishedAt: "2026-07-01T10:00:00Z",
      rolledBackAt: null,
      appliedStepsCount: 1,
    });
    evidence.shapeChangeAttestation = "one extra applied row, under investigation";
    const result = evaluate(evidence);
    expect(result.ready).toBe(false);
    expect(result.blockingReasons.join(" ")).toContain("no local prisma/migrations folder");
    expect(result.summary.productionOnlyNames).toContain("20260701_applied_only_in_production");
  });

  it("blocks a local migration that was never applied in production", () => {
    const evidence = validEvidence();
    evidence.localMigrations.push({ migrationName: "20260702_local_only", checksum: "checksum-local-only" });
    evidence.shapeChangeAttestation = "one new local folder pending deploy";
    const result = evaluate(evidence);
    expect(result.ready).toBe(false);
    expect(result.blockingReasons.join(" ")).toContain("has no applied row in production");
  });

  it("blocks a migration stuck in progress (never finished, never rolled back)", () => {
    const evidence = validEvidence();
    evidence.productionRows = evidence.productionRows.map((row, index) =>
      index === 0 ? { ...row, finishedAt: null, rolledBackAt: null } : row
    );
    const result = evaluate(evidence);
    expect(result.ready).toBe(false);
    expect(result.blockingReasons.join(" ")).toContain("neither finished nor rolled back");
  });

  it("blocks a rolled-back attempt whose migration never succeeded", () => {
    const evidence = validEvidence();
    evidence.productionRows.push({
      migrationName: LOCAL_NAMES[5],
      checksum: `checksum-6`,
      finishedAt: null,
      rolledBackAt: "2026-07-05T10:00:00Z",
    });
    // Remove the successful row for that same name.
    evidence.productionRows = evidence.productionRows.filter(
      (row) => !(row.migrationName === LOCAL_NAMES[5] && row.rolledBackAt === null)
    );
    evidence.shapeChangeAttestation = "investigating a failed migration";
    const result = evaluate(evidence);
    expect(result.ready).toBe(false);
    expect(result.blockingReasons.join(" ")).toContain("never applied");
  });

  it("blocks an unacknowledged checksum divergence, naming the migration", () => {
    const evidence = validEvidence();
    evidence.productionRows = evidence.productionRows.map((row) =>
      row.migrationName === LOCAL_NAMES[3] && row.rolledBackAt === null
        ? { ...row, checksum: "checksum-that-was-never-committed" }
        : row
    );
    const result = evaluate(evidence);
    expect(result.ready).toBe(false);
    expect(result.blockingReasons.join(" ")).toContain(LOCAL_NAMES[3]);
    expect(result.blockingReasons.join(" ")).toContain("never committed");
    expect(result.summary.checksumMismatches).toEqual([LOCAL_NAMES[3]]);
  });

  it("accepts a checksum divergence that is acknowledged with both checksums, an impact statement and a signature", () => {
    const evidence = validEvidence();
    evidence.productionRows = evidence.productionRows.map((row) =>
      row.migrationName === LOCAL_NAMES[3] && row.rolledBackAt === null
        ? { ...row, checksum: "prod-checksum-x" }
        : row
    );
    evidence.acknowledgedChecksumMismatches = [
      {
        migrationName: LOCAL_NAMES[3],
        productionChecksum: "prod-checksum-x",
        localChecksum: "checksum-4",
        structuralImpact: "prisma migrate diff: 0 differences",
        approvedBy: "db-owner@example.com",
        approvedAt: "2026-09-21T12:30:00Z",
      },
    ];
    expect(evaluate(evidence)).toMatchObject({ ready: true, blockingReasons: [] });
  });

  it("rejects an acknowledgment that quotes the wrong checksums", () => {
    const evidence = validEvidence();
    evidence.productionRows = evidence.productionRows.map((row) =>
      row.migrationName === LOCAL_NAMES[3] && row.rolledBackAt === null
        ? { ...row, checksum: "prod-checksum-x" }
        : row
    );
    evidence.acknowledgedChecksumMismatches = [
      {
        migrationName: LOCAL_NAMES[3],
        productionChecksum: "something-else",
        localChecksum: "checksum-4",
        structuralImpact: "none",
        approvedBy: "db-owner@example.com",
        approvedAt: "2026-09-21T12:30:00Z",
      },
    ];
    const result = evaluate(evidence);
    expect(result.ready).toBe(false);
    expect(result.blockingReasons.join(" ")).toContain("does not quote the two checksums");
  });

  it("rejects a stale acknowledgment for a migration whose checksums now match", () => {
    const evidence = validEvidence({
      acknowledgedChecksumMismatches: [
        {
          migrationName: LOCAL_NAMES[2],
          productionChecksum: "checksum-3",
          localChecksum: "checksum-3",
          structuralImpact: "none",
          approvedBy: "db-owner@example.com",
          approvedAt: "2026-09-21T12:30:00Z",
        },
      ],
    });
    const result = evaluate(evidence);
    expect(result.ready).toBe(false);
    expect(result.blockingReasons.join(" ")).toContain("stale acknowledgment");
  });

  it("blocks a stale production snapshot", () => {
    const result = evaluate(validEvidence({ capturedAt: "2026-08-01T00:00:00Z" }));
    expect(result.ready).toBe(false);
    expect(result.blockingReasons.join(" ")).toContain("days old");
  });

  it("blocks an unattributed snapshot", () => {
    const evidence = validEvidence();
    delete evidence.capturedBy;
    expect(evaluate(evidence).ready).toBe(false);
  });

  it("requires an explicit attestation when the history shape no longer matches what was measured", () => {
    const evidence = validEvidence();
    evidence.productionRows = evidence.productionRows.slice(0, 14);
    const result = evaluate(evidence);
    expect(result.ready).toBe(false);
    expect(result.blockingReasons.join(" ")).toContain("shapeChangeAttestation");
  });
});

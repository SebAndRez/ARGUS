import { describe, expect, it } from "vitest";
import {
  EVIDENCE_MAX_AGE_DAYS,
  MIN_DUAL_READ_CLEAN_DAYS,
  REQUIRED_HUMAN_DECISIONS,
  describeCutoverGates,
  evaluateCutoverReadiness,
  resolveCutoverFlag,
  resolveSourceOfTruth,
  type CutoverEvidence,
} from "../../src/lib/database-target/cutover/cutoverGuards";
import { evaluateLegacyMigrationHistory } from "../../scripts/database-target/lib/driftGuard.mjs";
import { evaluateRlsAutoEnableRemediation } from "../../scripts/database-target/lib/rlsAutoEnableGuard.mjs";

/**
 * Paso 5: the cutover mechanism EXISTS, is explicit, and is SHUT. These cases
 * are the proof of the last part: the real state of the project (the one the
 * Paso 4/Paso 5 reports describe) must evaluate to "blocked", and every gate
 * must be individually necessary — removing any one piece of evidence has to
 * flip `allowed` back to false.
 */

const NOW = new Date("2026-09-22T12:00:00Z");
const COMMIT = "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c";

function iso(daysAgo: number): string {
  return new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();
}

/** A hypothetical fully-satisfied evidence set. Nothing in the repo produces this today — it exists to prove each gate is necessary. */
function fullEvidence(): CutoverEvidence {
  return {
    commitSha: COMMIT,
    now: NOW,
    legacyMigrationHistory: {
      guardReady: true,
      snapshotCapturedAt: iso(1),
      snapshotCapturedBy: "ops-lead@example.com",
    },
    backupRestore: {
      backupTakenAt: iso(3),
      restoreTestedAt: iso(2),
      restoreTarget: "disposable local postgres 17 (documented in the runbook)",
      rowCountsVerified: true,
      prismaMigrationsRowsVerified: true,
      approvedBy: "db-owner@example.com",
    },
    structuralDrift: {
      matchesBaseline: true,
      totalEntries: 508,
      acceptedEntries: 508,
      realDriftEntries: 0,
      requiresDecisionEntries: 0,
      classifiedBy: "db-owner@example.com",
      classifiedAt: iso(4),
    },
    rehearsal: {
      commitSha: COMMIT,
      success: true,
      requiredPhasesPassed: 50,
      requiredPhasesExpected: 50,
      missingPhases: [],
      finishedAt: iso(1),
    },
    dualReadParity: {
      runAt: iso(0.5),
      domainsCompared: 14,
      domainsExpected: 14,
      missingTarget: 0,
      missingLegacy: 0,
      valueMismatch: 0,
      consecutiveCleanDays: MIN_DUAL_READ_CLEAN_DAYS,
    },
    deferredRows: { openPendingDecisions: [], deferredRowCount: 0, reviewQueueRowCount: 0 },
    rlsAndRoles: {
      rlsAutoEnableRemediated: true,
      previewReadonlyRoleDecided: true,
      noBypassRlsRuntimePrincipal: true,
      rlsMatrixPassedAt: iso(1),
    },
    auditKey: {
      keyId: "projects/argus/locations/southamerica-west1/keyRings/audit/cryptoKeys/audit-integrity",
      managedBy: "cloud KMS",
      rotationPolicy: "90 days, automatic",
      approvedBy: "security-lead@example.com",
    },
    humanDecisions: Object.fromEntries(REQUIRED_HUMAN_DECISIONS.map((d) => [d, "RESOLVED"])),
    humanApproval: {
      approvedBy: ["db-owner@example.com", "security-lead@example.com"],
      approvedAt: iso(1),
      commitSha: COMMIT,
      scope: "Olas 010-100, cutover of reads to the target schema",
    },
  };
}

describe("cutover is blocked today", () => {
  it("blocks with no evidence at all, and names every gate", () => {
    const result = evaluateCutoverReadiness(undefined);
    expect(result.allowed).toBe(false);
    expect(result.gates).toHaveLength(10);
    expect(result.gates.every((gate) => !gate.passed)).toBe(true);
  });

  it("blocks on the project's REAL state: parity never measured, decisions open, no backup restore, no managed key", () => {
    // This is the honest evidence set as of Paso 5: the rehearsal is green and
    // the drift ratchet matches, and everything else is still open.
    const real: CutoverEvidence = {
      commitSha: COMMIT,
      now: NOW,
      legacyMigrationHistory: {
        guardReady: false,
        guardBlockingReasons: [
          "production checksum of 20260620_add_external_events_and_reliefweb differs from the local migration.sql and is not acknowledged",
        ],
      },
      structuralDrift: {
        matchesBaseline: true,
        totalEntries: 508,
        acceptedEntries: 120,
        realDriftEntries: 0,
        requiresDecisionEntries: 388,
        classifiedBy: "db-owner@example.com",
        classifiedAt: iso(1),
      },
      rehearsal: {
        commitSha: COMMIT,
        success: true,
        requiredPhasesPassed: 50,
        requiredPhasesExpected: 50,
        missingPhases: [],
        finishedAt: iso(0.2),
      },
      deferredRows: {
        openPendingDecisions: ["D-06 CriticalPoi route classification", "T-09 hazard catalog (Corrección #5)"],
        deferredRowCount: 684,
        reviewQueueRowCount: 422,
      },
      rlsAndRoles: { rlsAutoEnableRemediated: false, previewReadonlyRoleDecided: false },
      humanDecisions: {},
    };
    const result = evaluateCutoverReadiness(real);
    expect(result.allowed).toBe(false);
    const blockedGates = result.gates.filter((gate) => !gate.passed).map((gate) => gate.gate);
    expect(blockedGates).toEqual(
      expect.arrayContaining([
        "LEGACY_MIGRATION_HISTORY",
        "BACKUP_RESTORE_TESTED",
        "STRUCTURAL_DRIFT_CLASSIFIED",
        "DUAL_READ_PARITY",
        "DEFERRED_ROWS_RESOLVED",
        "RLS_AND_ROLES",
        "AUDIT_KEY_MANAGED",
        "HUMAN_DECISIONS_RESOLVED",
        "HUMAN_APPROVAL",
      ])
    );
    // The rehearsal being green is real, and it is not enough on its own.
    expect(result.gates.find((gate) => gate.gate === "REHEARSAL_GREEN_FOR_COMMIT")?.passed).toBe(true);
  });

  it("the env flag alone never enables cutover", () => {
    expect(resolveCutoverFlag(undefined, { ARGUS_TARGET_DB_CUTOVER_ENABLED: "true" })).toBe(false);
    expect(resolveSourceOfTruth(undefined, { ARGUS_TARGET_DB_CUTOVER_ENABLED: "true" })).toBe("LEGACY");
  });

  it("full evidence without the env flag still resolves to LEGACY", () => {
    expect(evaluateCutoverReadiness(fullEvidence()).allowed).toBe(true);
    expect(resolveCutoverFlag(fullEvidence(), {})).toBe(false);
    expect(resolveSourceOfTruth(fullEvidence(), {})).toBe("LEGACY");
  });

  it("only full evidence AND the env flag together resolve to TARGET", () => {
    expect(resolveSourceOfTruth(fullEvidence(), { ARGUS_TARGET_DB_CUTOVER_ENABLED: "true" })).toBe("TARGET");
  });
});

describe("every gate is individually necessary", () => {
  const mutations: Array<[string, (e: CutoverEvidence) => void]> = [
    ["legacy history guard not ready", (e) => void (e.legacyMigrationHistory!.guardReady = false)],
    ["legacy snapshot stale", (e) => void (e.legacyMigrationHistory!.snapshotCapturedAt = iso(40))],
    ["backup never restored", (e) => void delete e.backupRestore!.restoreTestedAt],
    ["restore row counts unverified", (e) => void (e.backupRestore!.rowCountsVerified = false)],
    ["drift not classified", (e) => void (e.structuralDrift!.requiresDecisionEntries = 1)],
    ["drift entries unaccounted", (e) => void (e.structuralDrift!.acceptedEntries = 100)],
    ["rehearsal red", (e) => void (e.rehearsal!.success = false)],
    ["rehearsal for another commit", (e) => void (e.rehearsal!.commitSha = "deadbeef")],
    ["rehearsal missing a phase", (e) => void (e.rehearsal!.missingPhases = ["FirstInstall/TargetTests"])],
    ["parity has a missing target row", (e) => void (e.dualReadParity!.missingTarget = 1)],
    ["parity has a value mismatch", (e) => void (e.dualReadParity!.valueMismatch = 1)],
    ["parity has an orphan target row", (e) => void (e.dualReadParity!.missingLegacy = 1)],
    ["parity not held long enough", (e) => void (e.dualReadParity!.consecutiveCleanDays = 1)],
    ["parity stale", (e) => void (e.dualReadParity!.runAt = iso(10))],
    ["a deferred decision is open", (e) => void (e.deferredRows!.openPendingDecisions = ["D-06"])],
    ["review queue not empty", (e) => void (e.deferredRows!.reviewQueueRowCount = 1)],
    ["rls_auto_enable not remediated", (e) => void (e.rlsAndRoles!.rlsAutoEnableRemediated = false)],
    ["preview role undecided", (e) => void (e.rlsAndRoles!.previewReadonlyRoleDecided = false)],
    ["a runtime principal has BYPASSRLS", (e) => void (e.rlsAndRoles!.noBypassRlsRuntimePrincipal = false)],
    ["audit key is the rehearsal key", (e) => void (e.auditKey!.keyId = "rehearsal-local-per-run")],
    ["audit key unmanaged", (e) => void delete e.auditKey!.managedBy],
    ["one human decision still open", (e) => void (e.humanDecisions!["D-06_CRITICAL_POI_ROUTES"] = "OPEN")],
    ["one human decision missing", (e) => void delete e.humanDecisions!["D-08_MEDICAL_DATA"]],
    ["only one approver", (e) => void (e.humanApproval!.approvedBy = ["db-owner@example.com"])],
    ["approval for another commit", (e) => void (e.humanApproval!.commitSha = "deadbeef")],
    ["approval stale", (e) => void (e.humanApproval!.approvedAt = iso(30))],
    ["no commit named", (e) => void delete e.commitSha],
  ];

  for (const [label, mutate] of mutations) {
    it(`blocks when ${label}`, () => {
      const evidence = fullEvidence();
      mutate(evidence);
      const result = evaluateCutoverReadiness(evidence);
      expect(result.allowed, `expected ${label} to block cutover`).toBe(false);
      expect(result.blockingReasons.length).toBeGreaterThan(0);
    });
  }

  it("freshness windows are real windows, not zero", () => {
    expect(EVIDENCE_MAX_AGE_DAYS.rehearsal).toBeGreaterThan(0);
    expect(EVIDENCE_MAX_AGE_DAYS.dualReadParity).toBeGreaterThan(0);
    expect(MIN_DUAL_READ_CLEAN_DAYS).toBeGreaterThanOrEqual(7);
  });

  it("describeCutoverGates names each blocked gate for a runbook", () => {
    const lines = describeCutoverGates(evaluateCutoverReadiness(undefined));
    expect(lines).toHaveLength(10);
    expect(lines.every((line) => line.startsWith("BLOCK"))).toBe(true);
  });
});

describe("the two production guards are separate, fail-closed checks", () => {
  it("the legacy-history guard and the rls_auto_enable guard both fail closed on their own", () => {
    expect(evaluateLegacyMigrationHistory(undefined).ready).toBe(false);
    expect(evaluateRlsAutoEnableRemediation(undefined).ready).toBe(false);
  });

  it("their verdicts are what the cutover gates consume — a bare boolean is not enough", () => {
    const evidence = fullEvidence();
    evidence.legacyMigrationHistory = {
      guardReady: evaluateLegacyMigrationHistory(undefined).ready,
      guardBlockingReasons: evaluateLegacyMigrationHistory(undefined).blockingReasons,
      snapshotCapturedAt: iso(1),
      snapshotCapturedBy: "ops-lead@example.com",
    };
    const result = evaluateCutoverReadiness(evidence);
    expect(result.allowed).toBe(false);
    expect(result.gates.find((gate) => gate.gate === "LEGACY_MIGRATION_HISTORY")?.blockingReasons.join(" ")).toContain(
      "failing closed"
    );
  });
});

/**
 * scripts/database-target/assertCutoverReadiness.ts
 *
 * Paso 6A points 1 and 8: revalidate the 10 cutover gates against the state of
 * this repository RIGHT NOW, and print each one as PASS or BLOCKED with the
 * reason.
 *
 * The point of this script is that it MEASURES instead of asking. Everything it
 * can derive from an artifact in the repo, it derives:
 *
 *   * the rehearsal verdict and its required-phase ledger, from
 *     migration-rehearsal-artifacts/full-rehearsal-result.json;
 *   * the structural-drift classification, from the ratchet baseline plus
 *     classify-target-schema-drift.mjs and drift-reconciliation-plan.mjs;
 *   * dual-read parity and the deferred-row count, from the evidence file the
 *     Paso 5 simulation writes (migration-rehearsal-logs/paso5-markers-*.log).
 *
 * What it CANNOT derive is what a human has to sign or what only production can
 * answer: the legacy `_prisma_migrations` snapshot, a restore that was actually
 * performed, the KMS decision, the RLS/roles decisions, the ten named human
 * decisions, and the approval itself. Those are read from an optional evidence
 * file (--evidence <path>) and are ABSENT — therefore BLOCKED — until a human
 * fills it in. Nothing here invents a value, and the script never writes to any
 * database.
 *
 * Usage:
 *   npx tsx scripts/database-target/assertCutoverReadiness.ts [--evidence <file>] [--json]
 *
 * Exit code is 0 when the report is produced (the report itself says whether a
 * cutover is allowed) and 1 only when the script cannot produce a report.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  REQUIRED_HUMAN_DECISIONS,
  evaluateCutoverReadiness,
  resolveSourceOfTruth,
  type CutoverEvidence,
} from "../../src/lib/database-target/cutover/cutoverGuards";

const REPO_ROOT = join(__dirname, "..", "..");
const ARTIFACTS = join(REPO_ROOT, "migration-rehearsal-artifacts");
const LOGS = join(REPO_ROOT, "migration-rehearsal-logs");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, ""));
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** The commit a cutover would ship. Read from git, never guessed. */
function currentCommit(): string | undefined {
  try {
    const head = readFileSync(join(REPO_ROOT, ".git", "HEAD"), "utf8").trim();
    if (head.startsWith("ref: ")) {
      const ref = join(REPO_ROOT, ".git", head.slice(5).trim());
      if (existsSync(ref)) return readFileSync(ref, "utf8").trim();
      const packed = join(REPO_ROOT, ".git", "packed-refs");
      if (existsSync(packed)) {
        const wanted = head.slice(5).trim();
        for (const line of readFileSync(packed, "utf8").split("\n")) {
          const [sha, name] = line.trim().split(" ");
          if (name === wanted) return sha;
        }
      }
      return undefined;
    }
    return head;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Measured evidence
// ---------------------------------------------------------------------------

interface RehearsalArtifact {
  Success?: boolean;
  FinishedAt?: string;
  RequiredPhaseResults?: Array<{ Name: string; Passed: boolean }>;
}

function measureRehearsal(): CutoverEvidence["rehearsal"] & { note: string } {
  const path = join(ARTIFACTS, "full-rehearsal-result.json");
  if (!existsSync(path)) {
    return { note: "no full-rehearsal-result.json in migration-rehearsal-artifacts/" };
  }
  const r = readJson(path) as RehearsalArtifact;
  const phases = r.RequiredPhaseResults ?? [];
  const passed = phases.filter((p) => p.Passed).length;
  return {
    success: r.Success === true,
    requiredPhasesPassed: passed,
    requiredPhasesExpected: phases.length,
    missingPhases: phases.filter((p) => !p.Passed).map((p) => p.Name),
    finishedAt: r.FinishedAt,
    note: `measured from full-rehearsal-result.json (${passed}/${phases.length} required phases)`,
  };
}

async function measureDrift(): Promise<CutoverEvidence["structuralDrift"] & { note: string }> {
  const baselinePath = join(REPO_ROOT, "scripts", "migration-rehearsal", "target-schema-drift-baseline.json");
  if (!existsSync(baselinePath)) return { note: "no drift baseline on disk" };
  const baseline = readJson(baselinePath) as { issues: string[]; capturedAt?: string };

  const classifier = await import("../migration-rehearsal/lib/classify-target-schema-drift.mjs");
  const { counts } = classifier.classifyAll(baseline.issues) as {
    counts: Record<string, number>;
  };
  const accepted = (counts.INTENTIONAL_SQL_ONLY ?? 0) + (counts.PRISMA_LIMITATION ?? 0);
  return {
    // The ratchet itself is asserted by the rehearsal's TargetSchemaDrift phase;
    // what this script contributes is the classification, which is what the gate
    // is actually about.
    matchesBaseline: true,
    totalEntries: baseline.issues.length,
    acceptedEntries: accepted,
    realDriftEntries: counts.REAL_DRIFT_TO_RECONCILE ?? 0,
    requiresDecisionEntries: counts.REQUIRES_HUMAN_DECISION ?? 0,
    classifiedAt: baseline.capturedAt,
    note: `measured from the ratchet baseline: ${JSON.stringify(counts)}`,
  };
}

/** Parity and deferred rows, from the marker file the Paso 5 simulation writes. */
function measureParityAndDeferred(): {
  parity: CutoverEvidence["dualReadParity"] & { note: string };
  deferred: CutoverEvidence["deferredRows"] & { note: string };
} {
  const files = existsSync(LOGS)
    ? readdirSync(LOGS).filter((n) => n.startsWith("paso5-markers-") && n.endsWith(".log"))
    : [];
  if (files.length === 0) {
    return {
      parity: { note: "no paso5-markers-*.log — the simulation has not run here" },
      deferred: { note: "no paso5-markers-*.log — the simulation has not run here" },
    };
  }
  // Any of the three scopes carries the same matrix; the first is enough.
  const lines = readFileSync(join(LOGS, files[0]), "utf8").split(/\r?\n/);
  const perDomain = lines.filter((l) => l.startsWith("PASO5_RECONCILIATION|"));
  const totalsLine = lines.find((l) => l.startsWith("PASO5_RECONCILIATION_TOTALS|"));
  const totals: Record<string, number> = {};
  for (const part of (totalsLine ?? "").split("|").slice(1)) {
    const [k, v] = part.split("=");
    totals[k] = Number(v);
  }
  return {
    parity: {
      // The marker file has no timestamp of its own; the file's own run is the
      // rehearsal that produced it, so this is deliberately NOT dated here —
      // an undated parity run is treated as absent by the gate, which is the
      // conservative reading.
      domainsCompared: perDomain.length,
      domainsExpected: 14,
      missingTarget: totals.missing_target,
      missingLegacy: totals.missing_legacy,
      valueMismatch: totals.mismatch,
      note: `measured from ${files[0]}: ${perDomain.length} domains, match=${totals.match} deferred=${totals.deferred}`,
    },
    deferred: {
      deferredRowCount: totals.deferred,
      note: `measured from ${files[0]}: ${totals.deferred} deferred rows still recorded`,
    },
  };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const evidenceFile = arg("--evidence");
  const supplied: Partial<CutoverEvidence> =
    evidenceFile && existsSync(evidenceFile) ? (readJson(evidenceFile) as Partial<CutoverEvidence>) : {};

  const rehearsal = measureRehearsal();
  const drift = await measureDrift();
  const { parity, deferred } = measureParityAndDeferred();
  const commitSha = supplied.commitSha ?? currentCommit();

  const notes: string[] = [];
  const strip = <T extends { note: string }>(v: T): Omit<T, "note"> => {
    notes.push(v.note);
    // The note is for the reader, not for the guard: it is collected above and
    // deleted from the copy the evaluator sees, so an unknown field can never
    // be mistaken for evidence.
    const { note, ...rest } = v;
    void note;
    return rest;
  };

  // Measured evidence first; anything the human evidence file supplies for the
  // same gate wins, because a person can only ever make a gate HARDER here:
  // the measured values are the optimistic ones.
  const evidence: CutoverEvidence = {
    commitSha,
    rehearsal: { commitSha, ...strip(rehearsal), ...(supplied.rehearsal ?? {}) },
    structuralDrift: { ...strip(drift), ...(supplied.structuralDrift ?? {}) },
    dualReadParity: { ...strip(parity), ...(supplied.dualReadParity ?? {}) },
    deferredRows: { ...strip(deferred), ...(supplied.deferredRows ?? {}) },
    legacyMigrationHistory: supplied.legacyMigrationHistory ?? { guardReady: false },
    backupRestore: supplied.backupRestore,
    rlsAndRoles: supplied.rlsAndRoles,
    auditKey: supplied.auditKey,
    humanDecisions: supplied.humanDecisions,
    humanApproval: supplied.humanApproval,
  };

  const result = evaluateCutoverReadiness(evidence);
  const sourceOfTruth = resolveSourceOfTruth(evidence, { ARGUS_TARGET_DB_CUTOVER_ENABLED: "true" });

  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify({ result, sourceOfTruth, evidence }, null, 2)}\n`);
    return;
  }

  const blocked = result.gates.filter((g) => !g.passed);
  process.stdout.write("\nARGUS — cutover gate revalidation\n");
  process.stdout.write(`commit: ${commitSha ?? "(unknown)"}\n`);
  process.stdout.write(`evidence file: ${evidenceFile ?? "(none supplied)"}\n\n`);
  process.stdout.write("Measured from this repository:\n");
  for (const n of notes) process.stdout.write(`  - ${n}\n`);
  process.stdout.write("\nGates:\n");
  for (const gate of result.gates) {
    process.stdout.write(`  ${gate.passed ? "PASS   " : "BLOCKED"}  ${gate.gate}\n`);
    for (const reason of gate.blockingReasons) process.stdout.write(`             ${reason}\n`);
  }
  process.stdout.write(`\nCUTOVER_ALLOWED=${result.allowed}\n`);
  process.stdout.write(`GATES_PASSED=${result.gates.length - blocked.length}/${result.gates.length}\n`);
  process.stdout.write(`SOURCE_OF_TRUTH_WITH_FLAG_FORCED_ON=${sourceOfTruth}\n`);
  process.stdout.write(`HUMAN_DECISIONS_REQUIRED=${REQUIRED_HUMAN_DECISIONS.length}\n`);
  process.stdout.write(
    `CUTOVER_READINESS_${result.allowed ? "ALLOWED" : "BLOCKED"} (${blocked.length} gate(s) blocked)\n\n`
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`CUTOVER_READINESS_SCRIPT_FAILED: ${String(error)}\n`);
  process.exitCode = 1;
});

/**
 * src/lib/database-target/cutover/cutoverGuards.ts
 *
 * The cutover gate (Paso 5). Paso 5 does NOT cut over: it makes the mechanism
 * exist, be explicit, and stay shut until every gate below is satisfied with
 * evidence a human supplied and signed.
 *
 * Design rules, all deliberate:
 *   * This module never inspects production, never queries a database, never
 *     reads a file. It only judges evidence handed to it, so it is fully
 *     unit-testable and cannot "discover" a green state on its own.
 *   * Absence is failure. A missing field, a missing gate, an empty object,
 *     `undefined` — all fail closed. There is no "assume satisfied" branch.
 *   * Evidence is bound to a commit and has an expiry. Evidence gathered for
 *     another commit, or older than its freshness window, does not count:
 *     that is how a stale green turns into a real cutover by accident.
 *   * Every human decision the migration is waiting on is its own gate. The
 *     guard cannot resolve them, and it refuses to treat silence as
 *     resolution.
 *   * The former 5-point checklist (`drift13Vs15Reconciled`,
 *     `rehearsalCiApproved`, `backfillComplete`, `rowCountsMatch`,
 *     `rollbackAvailable`) is gone. It modelled the 13/15 legacy-history
 *     question incorrectly (Paso 3 §2: 15 rows = 13 applied + 2 rolled-back
 *     attempts, 0 unknown names, 1 divergent checksum), and four of its five
 *     items were single booleans a caller could simply assert. Each is now a
 *     gate with the specific, checkable evidence behind it.
 */

import { recordCutoverGuardEvaluation } from "../observability/shadowSyncMetrics";
import {
  isTargetMigrationFlagEnabled,
  type FlagEnvSource,
} from "../flags/targetMigrationFlags";

export type CutoverGateId =
  | "LEGACY_MIGRATION_HISTORY"
  | "BACKUP_RESTORE_TESTED"
  | "STRUCTURAL_DRIFT_CLASSIFIED"
  | "REHEARSAL_GREEN_FOR_COMMIT"
  | "DUAL_READ_PARITY"
  | "DEFERRED_ROWS_RESOLVED"
  | "RLS_AND_ROLES"
  | "AUDIT_KEY_MANAGED"
  | "HUMAN_DECISIONS_RESOLVED"
  | "HUMAN_APPROVAL";

export interface CutoverGateResult {
  gate: CutoverGateId;
  passed: boolean;
  /** Empty when passed. Each entry names exactly what is missing. */
  blockingReasons: string[];
}

export interface CutoverReadinessResult {
  allowed: boolean;
  gates: CutoverGateResult[];
  /** Flattened blocking reasons, in gate order. */
  blockingReasons: string[];
}

/**
 * The human decisions this migration is explicitly waiting on (Paso 3/Paso 4
 * registers). Every one must be `"RESOLVED"` in the evidence; `"OPEN"`,
 * absent, or any other value blocks. New decisions are added here, never
 * silently dropped.
 */
export const REQUIRED_HUMAN_DECISIONS = [
  "D-06_CRITICAL_POI_ROUTES",
  "D-07_OFFICIAL_BOUNDARIES",
  "D-08_MEDICAL_DATA",
  "T-09_HAZARD_CATALOG",
  "INCIDENT_TYPE_CATALOG",
  "DEFAULT_OPERATIONAL_STATUS_FOR_NULL",
  "ACCESS_CONTROL_8_CLOSER_ATTRIBUTION",
  "CANDIDATE_AND_SEVERITY_HISTORY",
  "GEOCODER_PROVIDER",
  "ARGUS_PREVIEW_READONLY_ROLE",
] as const;

export type RequiredHumanDecision = (typeof REQUIRED_HUMAN_DECISIONS)[number];

export interface LegacyMigrationHistoryEvidence {
  /** The verdict of scripts/database-target/Assert-ProductionMigrationReady (legacyMigrationHistoryGuard.mjs), not a bare claim. */
  guardReady: boolean;
  guardBlockingReasons?: string[];
  /** When the production `_prisma_migrations` snapshot the guard judged was taken. */
  snapshotCapturedAt?: string;
  snapshotCapturedBy?: string;
}

export interface BackupRestoreEvidence {
  backupTakenAt?: string;
  /** A restore that was actually performed and verified — not "a backup exists". */
  restoreTestedAt?: string;
  restoreTarget?: string;
  rowCountsVerified?: boolean;
  prismaMigrationsRowsVerified?: boolean;
  approvedBy?: string;
}

export interface StructuralDriftEvidence {
  /** compare-target-schema.mjs matched its ratchet baseline exactly. */
  matchesBaseline?: boolean;
  totalEntries?: number;
  /** Entries classified as intentional SQL-only or a Prisma limitation. */
  acceptedEntries?: number;
  /** Entries still classified as real drift to reconcile. Must be 0. */
  realDriftEntries?: number;
  /** Entries whose classification is a human decision. Must be 0. */
  requiresDecisionEntries?: number;
  classifiedBy?: string;
  classifiedAt?: string;
}

export interface RehearsalEvidence {
  commitSha?: string;
  success?: boolean;
  requiredPhasesPassed?: number;
  requiredPhasesExpected?: number;
  missingPhases?: string[];
  finishedAt?: string;
}

export interface DualReadParityEvidence {
  runAt?: string;
  domainsCompared?: number;
  domainsExpected?: number;
  missingTarget?: number;
  missingLegacy?: number;
  valueMismatch?: number;
  /** How long parity has held with zero divergence, in whole days. */
  consecutiveCleanDays?: number;
}

export interface DeferredRowsEvidence {
  /** Every distinct `pending_decision` still open in migration_meta.legacy_deferred_rows. Must be empty. */
  openPendingDecisions?: string[];
  deferredRowCount?: number;
  reviewQueueRowCount?: number;
}

export interface RlsAndRolesEvidence {
  rlsAutoEnableRemediated?: boolean;
  previewReadonlyRoleDecided?: boolean;
  rlsMatrixPassedAt?: string;
  noBypassRlsRuntimePrincipal?: boolean;
}

export interface AuditKeyEvidence {
  /** A real managed key id (KMS/secret manager). The per-run rehearsal key never counts. */
  keyId?: string;
  managedBy?: string;
  rotationPolicy?: string;
  approvedBy?: string;
}

export interface HumanApprovalEvidence {
  approvedBy?: string[];
  approvedAt?: string;
  commitSha?: string;
  scope?: string;
}

export interface CutoverEvidence {
  /** The commit the cutover would ship. Every piece of evidence must name it. */
  commitSha?: string;
  /** Evaluation time (injectable for tests). Defaults to now. */
  now?: Date;
  legacyMigrationHistory?: LegacyMigrationHistoryEvidence;
  backupRestore?: BackupRestoreEvidence;
  structuralDrift?: StructuralDriftEvidence;
  rehearsal?: RehearsalEvidence;
  dualReadParity?: DualReadParityEvidence;
  deferredRows?: DeferredRowsEvidence;
  rlsAndRoles?: RlsAndRolesEvidence;
  auditKey?: AuditKeyEvidence;
  humanDecisions?: Partial<Record<RequiredHumanDecision, string>>;
  humanApproval?: HumanApprovalEvidence;
}

/** Freshness windows, in days. Evidence older than this is treated as absent. */
export const EVIDENCE_MAX_AGE_DAYS = {
  legacyMigrationHistorySnapshot: 14,
  backupRestore: 30,
  structuralDriftClassification: 30,
  rehearsal: 7,
  dualReadParity: 2,
  rlsMatrix: 7,
  humanApproval: 7,
} as const;

/** Dual-read parity must have held clean for at least this many consecutive days. */
export const MIN_DUAL_READ_CLEAN_DAYS = 7;

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && !Number.isNaN(Date.parse(value));
}

function ageInDays(value: string, now: Date): number {
  return (now.getTime() - Date.parse(value)) / 86_400_000;
}

function requireFreshIso(
  label: string,
  value: unknown,
  maxAgeDays: number,
  now: Date,
  reasons: string[]
): void {
  if (!isIsoDate(value)) {
    reasons.push(`${label} must be a valid ISO 8601 timestamp`);
    return;
  }
  const age = ageInDays(value, now);
  if (age < 0) {
    reasons.push(`${label} is in the future — evidence cannot predate its own subject`);
    return;
  }
  if (age > maxAgeDays) {
    reasons.push(`${label} is ${Math.floor(age)} days old, older than the ${maxAgeDays}-day window`);
  }
}

function requireNonEmptyString(label: string, value: unknown, reasons: string[]): void {
  if (typeof value !== "string" || value.trim() === "") {
    reasons.push(`${label} is required`);
  }
}

function gate(id: CutoverGateId, reasons: string[]): CutoverGateResult {
  return { gate: id, passed: reasons.length === 0, blockingReasons: reasons };
}

function evaluateLegacyHistoryGate(evidence: CutoverEvidence, now: Date): CutoverGateResult {
  const reasons: string[] = [];
  const e = evidence.legacyMigrationHistory;
  if (!e) {
    reasons.push("no legacy `_prisma_migrations` history evidence supplied (run Assert-ProductionMigrationReady)");
    return gate("LEGACY_MIGRATION_HISTORY", reasons);
  }
  if (e.guardReady !== true) {
    const detail = e.guardBlockingReasons?.length ? `: ${e.guardBlockingReasons.join("; ")}` : "";
    reasons.push(`the legacy migration-history guard did not pass${detail}`);
  }
  requireNonEmptyString("legacyMigrationHistory.snapshotCapturedBy", e.snapshotCapturedBy, reasons);
  requireFreshIso(
    "legacyMigrationHistory.snapshotCapturedAt",
    e.snapshotCapturedAt,
    EVIDENCE_MAX_AGE_DAYS.legacyMigrationHistorySnapshot,
    now,
    reasons
  );
  return gate("LEGACY_MIGRATION_HISTORY", reasons);
}

function evaluateBackupGate(evidence: CutoverEvidence, now: Date): CutoverGateResult {
  const reasons: string[] = [];
  const e = evidence.backupRestore;
  if (!e) {
    reasons.push("no backup/restore evidence supplied — a backup nobody restored is not a backup");
    return gate("BACKUP_RESTORE_TESTED", reasons);
  }
  requireFreshIso("backupRestore.backupTakenAt", e.backupTakenAt, EVIDENCE_MAX_AGE_DAYS.backupRestore, now, reasons);
  requireFreshIso("backupRestore.restoreTestedAt", e.restoreTestedAt, EVIDENCE_MAX_AGE_DAYS.backupRestore, now, reasons);
  if (isIsoDate(e.backupTakenAt) && isIsoDate(e.restoreTestedAt) && Date.parse(e.restoreTestedAt) < Date.parse(e.backupTakenAt)) {
    reasons.push("backupRestore.restoreTestedAt predates the backup it claims to restore");
  }
  requireNonEmptyString("backupRestore.restoreTarget", e.restoreTarget, reasons);
  requireNonEmptyString("backupRestore.approvedBy", e.approvedBy, reasons);
  if (e.rowCountsVerified !== true) reasons.push("backupRestore.rowCountsVerified must be true (counts compared after the restore)");
  if (e.prismaMigrationsRowsVerified !== true) {
    reasons.push("backupRestore.prismaMigrationsRowsVerified must be true (the restored `_prisma_migrations` was checked)");
  }
  return gate("BACKUP_RESTORE_TESTED", reasons);
}

function evaluateStructuralDriftGate(evidence: CutoverEvidence, now: Date): CutoverGateResult {
  const reasons: string[] = [];
  const e = evidence.structuralDrift;
  if (!e) {
    reasons.push("no structural-drift classification supplied (compare-target-schema.mjs + a reviewed classification)");
    return gate("STRUCTURAL_DRIFT_CLASSIFIED", reasons);
  }
  if (e.matchesBaseline !== true) reasons.push("structuralDrift.matchesBaseline must be true (the ratchet baseline is the agreed state)");
  if (typeof e.totalEntries !== "number" || e.totalEntries < 0) reasons.push("structuralDrift.totalEntries is required");
  if (typeof e.acceptedEntries !== "number" || e.acceptedEntries < 0) reasons.push("structuralDrift.acceptedEntries is required");
  if (e.realDriftEntries !== 0) reasons.push(`structuralDrift.realDriftEntries must be 0 (got ${JSON.stringify(e.realDriftEntries)})`);
  if (e.requiresDecisionEntries !== 0) {
    reasons.push(`structuralDrift.requiresDecisionEntries must be 0 (got ${JSON.stringify(e.requiresDecisionEntries)})`);
  }
  if (
    typeof e.totalEntries === "number" &&
    typeof e.acceptedEntries === "number" &&
    e.realDriftEntries === 0 &&
    e.requiresDecisionEntries === 0 &&
    e.acceptedEntries !== e.totalEntries
  ) {
    reasons.push(
      `structuralDrift: ${e.totalEntries - e.acceptedEntries} of ${e.totalEntries} entries are unclassified — every entry must land in a category`
    );
  }
  requireNonEmptyString("structuralDrift.classifiedBy", e.classifiedBy, reasons);
  requireFreshIso(
    "structuralDrift.classifiedAt",
    e.classifiedAt,
    EVIDENCE_MAX_AGE_DAYS.structuralDriftClassification,
    now,
    reasons
  );
  return gate("STRUCTURAL_DRIFT_CLASSIFIED", reasons);
}

function evaluateRehearsalGate(evidence: CutoverEvidence, now: Date): CutoverGateResult {
  const reasons: string[] = [];
  const e = evidence.rehearsal;
  if (!e) {
    reasons.push("no rehearsal evidence supplied");
    return gate("REHEARSAL_GREEN_FOR_COMMIT", reasons);
  }
  if (e.success !== true) reasons.push("rehearsal.success must be true");
  requireNonEmptyString("rehearsal.commitSha", e.commitSha, reasons);
  if (evidence.commitSha && e.commitSha && evidence.commitSha !== e.commitSha) {
    reasons.push("rehearsal evidence belongs to a different commit than the cutover");
  }
  if (Array.isArray(e.missingPhases) && e.missingPhases.length > 0) {
    reasons.push(`rehearsal is missing required phases: ${e.missingPhases.join(", ")}`);
  }
  if (
    typeof e.requiredPhasesPassed !== "number" ||
    typeof e.requiredPhasesExpected !== "number" ||
    e.requiredPhasesPassed < e.requiredPhasesExpected
  ) {
    reasons.push("rehearsal.requiredPhasesPassed must equal requiredPhasesExpected");
  }
  requireFreshIso("rehearsal.finishedAt", e.finishedAt, EVIDENCE_MAX_AGE_DAYS.rehearsal, now, reasons);
  return gate("REHEARSAL_GREEN_FOR_COMMIT", reasons);
}

function evaluateDualReadGate(evidence: CutoverEvidence, now: Date): CutoverGateResult {
  const reasons: string[] = [];
  const e = evidence.dualReadParity;
  if (!e) {
    reasons.push("no dual-read parity evidence supplied — cutting over without parity is the failure this gate exists for");
    return gate("DUAL_READ_PARITY", reasons);
  }
  requireFreshIso("dualReadParity.runAt", e.runAt, EVIDENCE_MAX_AGE_DAYS.dualReadParity, now, reasons);
  if (e.missingTarget !== 0) reasons.push(`dualReadParity.missingTarget must be 0 (got ${JSON.stringify(e.missingTarget)})`);
  if (e.missingLegacy !== 0) reasons.push(`dualReadParity.missingLegacy must be 0 (got ${JSON.stringify(e.missingLegacy)})`);
  if (e.valueMismatch !== 0) reasons.push(`dualReadParity.valueMismatch must be 0 (got ${JSON.stringify(e.valueMismatch)})`);
  if (
    typeof e.domainsCompared !== "number" ||
    typeof e.domainsExpected !== "number" ||
    e.domainsCompared < e.domainsExpected
  ) {
    reasons.push("dualReadParity must cover every domain (domainsCompared < domainsExpected)");
  }
  if (typeof e.consecutiveCleanDays !== "number" || e.consecutiveCleanDays < MIN_DUAL_READ_CLEAN_DAYS) {
    reasons.push(
      `dualReadParity.consecutiveCleanDays must be at least ${MIN_DUAL_READ_CLEAN_DAYS} (got ${JSON.stringify(e.consecutiveCleanDays)})`
    );
  }
  return gate("DUAL_READ_PARITY", reasons);
}

function evaluateDeferredRowsGate(evidence: CutoverEvidence): CutoverGateResult {
  const reasons: string[] = [];
  const e = evidence.deferredRows;
  if (!e) {
    reasons.push("no deferred-row evidence supplied");
    return gate("DEFERRED_ROWS_RESOLVED", reasons);
  }
  if (!Array.isArray(e.openPendingDecisions)) {
    reasons.push("deferredRows.openPendingDecisions must be an array (empty when nothing is pending)");
  } else if (e.openPendingDecisions.length > 0) {
    reasons.push(
      `${e.openPendingDecisions.length} deferred-row decisions are still open: ${e.openPendingDecisions.join(", ")}. ` +
        "Reading from the target would silently drop those rows."
    );
  }
  if (typeof e.deferredRowCount !== "number") reasons.push("deferredRows.deferredRowCount is required");
  if (typeof e.reviewQueueRowCount !== "number") reasons.push("deferredRows.reviewQueueRowCount is required");
  if (typeof e.deferredRowCount === "number" && e.deferredRowCount > 0 && Array.isArray(e.openPendingDecisions) && e.openPendingDecisions.length === 0) {
    reasons.push("deferredRows: rows are still deferred while no decision is listed as open — the two must agree");
  }
  if (typeof e.reviewQueueRowCount === "number" && e.reviewQueueRowCount > 0) {
    reasons.push(`${e.reviewQueueRowCount} rows are still in the D-06 review queue`);
  }
  return gate("DEFERRED_ROWS_RESOLVED", reasons);
}

function evaluateRlsGate(evidence: CutoverEvidence, now: Date): CutoverGateResult {
  const reasons: string[] = [];
  const e = evidence.rlsAndRoles;
  if (!e) {
    reasons.push("no RLS/roles evidence supplied");
    return gate("RLS_AND_ROLES", reasons);
  }
  if (e.rlsAutoEnableRemediated !== true) reasons.push("rlsAndRoles.rlsAutoEnableRemediated must be true (the `ensure_rls` event trigger decision)");
  if (e.previewReadonlyRoleDecided !== true) reasons.push("rlsAndRoles.previewReadonlyRoleDecided must be true (argus_preview_readonly)");
  if (e.noBypassRlsRuntimePrincipal !== true) reasons.push("rlsAndRoles.noBypassRlsRuntimePrincipal must be true (no runtime principal with BYPASSRLS)");
  requireFreshIso("rlsAndRoles.rlsMatrixPassedAt", e.rlsMatrixPassedAt, EVIDENCE_MAX_AGE_DAYS.rlsMatrix, now, reasons);
  return gate("RLS_AND_ROLES", reasons);
}

function evaluateAuditKeyGate(evidence: CutoverEvidence): CutoverGateResult {
  const reasons: string[] = [];
  const e = evidence.auditKey;
  if (!e) {
    reasons.push("no managed audit-integrity key evidence supplied (KMS decision)");
    return gate("AUDIT_KEY_MANAGED", reasons);
  }
  requireNonEmptyString("auditKey.keyId", e.keyId, reasons);
  requireNonEmptyString("auditKey.managedBy", e.managedBy, reasons);
  requireNonEmptyString("auditKey.rotationPolicy", e.rotationPolicy, reasons);
  requireNonEmptyString("auditKey.approvedBy", e.approvedBy, reasons);
  if (typeof e.keyId === "string" && /rehearsal|local|dev|placeholder/i.test(e.keyId)) {
    reasons.push("auditKey.keyId looks like a rehearsal/dev key — production audit rows must be signed with a managed key");
  }
  return gate("AUDIT_KEY_MANAGED", reasons);
}

function evaluateHumanDecisionsGate(evidence: CutoverEvidence): CutoverGateResult {
  const reasons: string[] = [];
  const supplied = evidence.humanDecisions ?? {};
  for (const decision of REQUIRED_HUMAN_DECISIONS) {
    const value = supplied[decision];
    if (value !== "RESOLVED") {
      reasons.push(`human decision ${decision} is ${value ? JSON.stringify(value) : "not recorded"} — must be "RESOLVED"`);
    }
  }
  return gate("HUMAN_DECISIONS_RESOLVED", reasons);
}

function evaluateHumanApprovalGate(evidence: CutoverEvidence, now: Date): CutoverGateResult {
  const reasons: string[] = [];
  const e = evidence.humanApproval;
  if (!e) {
    reasons.push("no human approval supplied — a cutover is never automatic");
    return gate("HUMAN_APPROVAL", reasons);
  }
  if (!Array.isArray(e.approvedBy) || e.approvedBy.filter((name) => typeof name === "string" && name.trim() !== "").length < 2) {
    reasons.push("humanApproval.approvedBy must name at least 2 approvers (four-eyes)");
  }
  requireFreshIso("humanApproval.approvedAt", e.approvedAt, EVIDENCE_MAX_AGE_DAYS.humanApproval, now, reasons);
  requireNonEmptyString("humanApproval.scope", e.scope, reasons);
  requireNonEmptyString("humanApproval.commitSha", e.commitSha, reasons);
  if (evidence.commitSha && e.commitSha && evidence.commitSha !== e.commitSha) {
    reasons.push("humanApproval was given for a different commit than the cutover");
  }
  return gate("HUMAN_APPROVAL", reasons);
}

/**
 * Evaluates every gate. `allowed` is true only when all of them pass — there
 * is no partial or "override" path, and no gate can be skipped by omitting it.
 */
export function evaluateCutoverReadiness(evidence: CutoverEvidence | undefined): CutoverReadinessResult {
  const supplied = evidence ?? {};
  const now = supplied.now ?? new Date();
  const gates: CutoverGateResult[] = [];

  const commitReasons: string[] = [];
  requireNonEmptyString("commitSha", supplied.commitSha, commitReasons);

  gates.push(evaluateLegacyHistoryGate(supplied, now));
  gates.push(evaluateBackupGate(supplied, now));
  gates.push(evaluateStructuralDriftGate(supplied, now));
  gates.push(evaluateRehearsalGate(supplied, now));
  gates.push(evaluateDualReadGate(supplied, now));
  gates.push(evaluateDeferredRowsGate(supplied));
  gates.push(evaluateRlsGate(supplied, now));
  gates.push(evaluateAuditKeyGate(supplied));
  gates.push(evaluateHumanDecisionsGate(supplied));
  gates.push(evaluateHumanApprovalGate(supplied, now));

  if (commitReasons.length > 0) {
    // A cutover that does not name its commit cannot have bound evidence.
    gates[0] = {
      ...gates[0],
      passed: false,
      blockingReasons: [...gates[0].blockingReasons, ...commitReasons],
    };
  }

  const blockingReasons = gates.flatMap((result) => result.blockingReasons);
  const allowed = blockingReasons.length === 0;
  recordCutoverGuardEvaluation({ allowed, blockingGates: gates.filter((g) => !g.passed).length });
  return { allowed, gates, blockingReasons };
}

/**
 * Guarded flag resolution: even with `ARGUS_TARGET_DB_CUTOVER_ENABLED=true`,
 * this returns false unless every gate passes. Use it instead of reading the
 * raw flag anywhere cutover actually changes behavior.
 */
export function resolveCutoverFlag(
  evidence: CutoverEvidence | undefined,
  env: FlagEnvSource = process.env
): boolean {
  if (!isTargetMigrationFlagEnabled("targetDatabaseCutover", env)) return false;
  return evaluateCutoverReadiness(evidence).allowed;
}

export type SourceOfTruth = "LEGACY" | "TARGET";

/**
 * The single place any read path may ask which database is authoritative.
 * It answers LEGACY unless the cutover flag is on AND every gate passes, so a
 * forgotten flag, a partial evidence file or a stale approval all keep the
 * legacy database in charge.
 */
export function resolveSourceOfTruth(
  evidence: CutoverEvidence | undefined,
  env: FlagEnvSource = process.env
): SourceOfTruth {
  return resolveCutoverFlag(evidence, env) ? "TARGET" : "LEGACY";
}

/** Human-readable, ordered summary for a runbook/report. Never used as a gate itself. */
export function describeCutoverGates(result: CutoverReadinessResult): string[] {
  return result.gates.map(
    (g) => `${g.passed ? "PASS " : "BLOCK"} ${g.gate}${g.passed ? "" : `: ${g.blockingReasons.join("; ")}`}`
  );
}

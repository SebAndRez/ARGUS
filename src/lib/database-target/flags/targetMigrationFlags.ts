/**
 * src/lib/database-target/flags/targetMigrationFlags.ts
 *
 * The 4 application-level feature flags that gate every runtime interaction
 * with the target database migration (Executable Migration Plan, Fase 5).
 * There is no pre-existing feature-flag system in this repo (checked: no
 * `featureFlag`/`FeatureFlag` symbol anywhere under `src/`) — this is the
 * first and only one; do not add a second parallel mechanism.
 *
 * All 4 flags default to `false`. In current production, all 4 MUST remain
 * `false` — nothing here is wired into any request path yet.
 */

export type TargetMigrationFlagName =
  | "targetDatabaseRead"
  | "targetDatabaseShadowWrite"
  | "targetDatabaseDualRead"
  | "targetDatabaseCutover";

export type TargetMigrationFlags = Record<TargetMigrationFlagName, boolean>;

const ENV_VAR_BY_FLAG: Record<TargetMigrationFlagName, string> = {
  targetDatabaseRead: "ARGUS_TARGET_DB_READ_ENABLED",
  targetDatabaseShadowWrite: "ARGUS_TARGET_DB_SHADOW_WRITE_ENABLED",
  targetDatabaseDualRead: "ARGUS_TARGET_DB_DUAL_READ_ENABLED",
  targetDatabaseCutover: "ARGUS_TARGET_DB_CUTOVER_ENABLED",
};

export const TARGET_MIGRATION_FLAG_DEFAULTS: TargetMigrationFlags = {
  targetDatabaseRead: false,
  targetDatabaseShadowWrite: false,
  targetDatabaseDualRead: false,
  targetDatabaseCutover: false,
};

/** Loose env shape (not `NodeJS.ProcessEnv`, which this Next.js project's global types require `NODE_ENV` on) — any string-keyed lookup works, including a bare `{}` in tests. */
export type FlagEnvSource = Record<string, string | undefined>;

function readBooleanEnv(varName: string, env: FlagEnvSource): boolean {
  return env[varName] === "true";
}

/**
 * Resolves the 4 flags from `env` (defaults to `process.env`). Any value
 * other than the exact string `"true"` resolves to `false` — never throws,
 * never silently reinterprets `"1"`/`"TRUE"`/etc. as enabled, so a typo in
 * an env file fails closed rather than silently enabling a migration path.
 */
export function getTargetMigrationFlags(env: FlagEnvSource = process.env): TargetMigrationFlags {
  return {
    targetDatabaseRead: readBooleanEnv(ENV_VAR_BY_FLAG.targetDatabaseRead, env),
    targetDatabaseShadowWrite: readBooleanEnv(ENV_VAR_BY_FLAG.targetDatabaseShadowWrite, env),
    targetDatabaseDualRead: readBooleanEnv(ENV_VAR_BY_FLAG.targetDatabaseDualRead, env),
    targetDatabaseCutover: readBooleanEnv(ENV_VAR_BY_FLAG.targetDatabaseCutover, env),
  };
}

export function isTargetMigrationFlagEnabled(
  flag: TargetMigrationFlagName,
  env: FlagEnvSource = process.env
): boolean {
  return getTargetMigrationFlags(env)[flag];
}

/**
 * The 5 preconditions the Executable Migration Plan (Fase 5) requires before
 * `targetDatabaseCutover` may ever be set to `true`. This is evidence
 * SUPPLIED BY THE CALLER — this module never inspects production, never
 * queries a database, never guesses. Absence of a field is treated as "not
 * satisfied" (fail closed), never as "assume satisfied".
 */
export interface CutoverReadinessEvidence {
  /** The Drift 13/15 gap (13 local target-migration folders vs. 15 known-production rows) has an approved reconciliation. */
  drift13Vs15Reconciled: boolean;
  /** The full 11-wave rehearsal CI workflow's most recent run on this branch/commit is green. */
  rehearsalCiApproved: boolean;
  /** No backfill for any wave is left partially applied. */
  backfillComplete: boolean;
  /** Row-count parity between every legacy source and its target destination has been confirmed, with zero unexplained divergence. */
  rowCountsMatch: boolean;
  /** A tested, reviewed rollback path (full 11-wave rollback, per the Rollback Runbook) is available and current. */
  rollbackAvailable: boolean;
}

export interface CutoverGuardResult {
  allowed: boolean;
  /** Empty when `allowed` is true. Each entry names exactly which precondition failed. */
  blockingReasons: string[];
}

const EMPTY_EVIDENCE: CutoverReadinessEvidence = {
  drift13Vs15Reconciled: false,
  rehearsalCiApproved: false,
  backfillComplete: false,
  rowCountsMatch: false,
  rollbackAvailable: false,
};

/**
 * Evaluates whether `targetDatabaseCutover` may be enabled. Called
 * explicitly wherever a caller is about to flip the flag — this function
 * does not read env vars itself, it only judges the evidence handed to it,
 * so it can be unit-tested without any process/env coupling.
 */
export function assertCutoverAllowed(
  evidence: Partial<CutoverReadinessEvidence> | undefined
): CutoverGuardResult {
  const merged: CutoverReadinessEvidence = { ...EMPTY_EVIDENCE, ...(evidence ?? {}) };
  const blockingReasons: string[] = [];

  if (!merged.drift13Vs15Reconciled) {
    blockingReasons.push("drift 13/15 not reconciled");
  }
  if (!merged.rehearsalCiApproved) {
    blockingReasons.push("rehearsal CI not approved");
  }
  if (!merged.backfillComplete) {
    blockingReasons.push("backfill incomplete");
  }
  if (!merged.rowCountsMatch) {
    blockingReasons.push("row count divergence present");
  }
  if (!merged.rollbackAvailable) {
    blockingReasons.push("rollback not available");
  }

  return { allowed: blockingReasons.length === 0, blockingReasons };
}

/**
 * Guarded flag resolution: even if `ARGUS_TARGET_DB_CUTOVER_ENABLED=true` is
 * set in the environment, this returns `false` unless `evidence` also
 * satisfies every precondition. Use this instead of raw
 * `getTargetMigrationFlags().targetDatabaseCutover` anywhere the cutover
 * flag actually gates behavior.
 */
export function resolveCutoverFlag(
  evidence: Partial<CutoverReadinessEvidence> | undefined,
  env: FlagEnvSource = process.env
): boolean {
  const envEnabled = isTargetMigrationFlagEnabled("targetDatabaseCutover", env);
  if (!envEnabled) return false;
  return assertCutoverAllowed(evidence).allowed;
}

/**
 * src/lib/database-target/adapters/types.ts
 *
 * Shared contract every domain adapter under `src/lib/database-target/
 * adapters/*.ts` implements (Compatibility Layer Plan §2, Executable
 * Migration Plan Fase 6). None of this is wired into the application
 * runtime — these are pure functions/types, imported only by
 * `src/lib/database-target/shadow-write/*` (itself disabled by default)
 * and by tests.
 *
 * Central rule (Fase 6): an adapter must NEVER fabricate a success result
 * when it did not actually persist anything. Every write-shaped function
 * returns exactly one of:
 *   - `AdapterPersisted<T>` — genuinely constructed/would-construct the
 *     target row, carrying its migration-confidence/review-status/legacy-id
 *     provenance.
 *   - `AdapterBlocked` — an explicit `NOT_ENABLED` / `MIGRATION_BLOCKED` /
 *     `REQUIRES_REVIEW` outcome, with a human-readable reason.
 */

import type { LegacyProvenance } from "../shared";

export type MigrationConfidence = NonNullable<LegacyProvenance["migrationConfidence"]>;
export type ReviewStatus = NonNullable<LegacyProvenance["migrationReviewStatus"]>;

/** The 3 explicit non-success outcomes Fase 6 mandates — never a silent/fake success. */
export type AdapterBlockedKind = "NOT_ENABLED" | "MIGRATION_BLOCKED" | "REQUIRES_REVIEW";

export interface AdapterBlocked {
  kind: AdapterBlockedKind;
  /** Human-readable — always names the specific precondition/flag that is missing. */
  reason: string;
}

export interface AdapterPersisted<TTarget> {
  kind: "PERSISTED";
  target: TTarget;
  legacyId: string;
  migrationConfidence: MigrationConfidence;
  reviewStatus: ReviewStatus;
}

export type AdapterOutcome<TTarget> = AdapterPersisted<TTarget> | AdapterBlocked;

export function isPersisted<T>(outcome: AdapterOutcome<T>): outcome is AdapterPersisted<T> {
  return outcome.kind === "PERSISTED";
}

export function notEnabled(reason: string): AdapterBlocked {
  return { kind: "NOT_ENABLED", reason };
}

export function migrationBlocked(reason: string): AdapterBlocked {
  return { kind: "MIGRATION_BLOCKED", reason };
}

export function requiresReview(reason: string): AdapterBlocked {
  return { kind: "REQUIRES_REVIEW", reason };
}

/** Reported whenever a dual-read/shadow-write comparison finds the transform itself failed or produced an inconsistency — distinct from a `MIGRATION_GAP` (dual-read/compare.ts), which is about two already-persisted rows disagreeing. */
export type ReconciliationErrorCode =
  | "TRANSFORM_FAILED"
  | "VALIDATION_FAILED"
  | "TARGET_UNAVAILABLE"
  | "AMBIGUOUS_CLASSIFICATION";

export interface ReconciliationError {
  domain: string;
  legacyId: string | null;
  targetId: string | null;
  code: ReconciliationErrorCode;
  message: string;
  occurredAt: string;
}

export function makeReconciliationError(
  domain: string,
  code: ReconciliationErrorCode,
  message: string,
  ids: { legacyId?: string | null; targetId?: string | null } = {}
): ReconciliationError {
  return {
    domain,
    legacyId: ids.legacyId ?? null,
    targetId: ids.targetId ?? null,
    code,
    message,
    occurredAt: new Date().toISOString(),
  };
}

/**
 * Shared shape for "is the shadow-write path for this domain currently
 * enabled" — adapters take this instead of reading env vars themselves, so
 * they stay pure and testable without process/env coupling (mirrors
 * `assertCutoverAllowed` in `flags/targetMigrationFlags.ts`).
 */
export interface AdapterWriteContext {
  shadowWriteEnabled: boolean;
}

/**
 * src/lib/database-target/shadow-write/reconciliationOutcome.ts
 *
 * The shadow-write reconciliation result vocabulary Fase 10 of the wave-3
 * mandate requires — distinct from `dual-read/compare.ts`'s comparison
 * vocabulary (which judges two ALREADY-PERSISTED rows against each other).
 * This vocabulary judges the OUTCOME of a single shadow-write attempt.
 *
 * Never carries: free-text content, names, emails, exact coordinates,
 * evidence, or medical data — only opaque ids, enum-like codes, and
 * timestamps (Fase 10's no-PII discipline, same as `observability/metrics.ts`).
 */

import type { MigrationConfidence, ReviewStatus } from "../adapters/types";

export type ReconciliationOutcomeCode =
  | "MATCH"
  | "CREATED"
  | "ALREADY_EXISTS"
  | "EXPECTED_DIFFERENCE"
  | "MIGRATION_GAP"
  | "TARGET_MISSING"
  | "LEGACY_MISSING"
  | "REQUIRES_REVIEW"
  | "TARGET_WRITE_FAILED";

export interface ReconciliationOutcome {
  code: ReconciliationOutcomeCode;
  domain: string;
  legacyId: string;
  targetId: string | null;
  idempotencyKey: string;
  retryable: boolean;
  migrationConfidence: MigrationConfidence | null;
  reviewStatus: ReviewStatus | null;
  /** A safe, enum-like error code (e.g. "TARGET_UNAVAILABLE", "CONSTRAINT_VIOLATION") — never a raw exception message that might embed content. */
  errorCode: string | null;
  timestamp: string;
  correlationId: string;
}

const RETRYABLE_CODES = new Set<ReconciliationOutcomeCode>(["MIGRATION_GAP", "REQUIRES_REVIEW", "TARGET_WRITE_FAILED"]);

export function buildReconciliationOutcome(input: {
  code: ReconciliationOutcomeCode;
  domain: string;
  legacyId: string;
  targetId?: string | null;
  idempotencyKey: string;
  migrationConfidence?: MigrationConfidence | null;
  reviewStatus?: ReviewStatus | null;
  errorCode?: string | null;
  correlationId: string;
}): ReconciliationOutcome {
  return {
    code: input.code,
    domain: input.domain,
    legacyId: input.legacyId,
    targetId: input.targetId ?? null,
    idempotencyKey: input.idempotencyKey,
    retryable: RETRYABLE_CODES.has(input.code),
    migrationConfidence: input.migrationConfidence ?? null,
    reviewStatus: input.reviewStatus ?? null,
    errorCode: input.errorCode ?? null,
    timestamp: new Date().toISOString(),
    correlationId: input.correlationId,
  };
}

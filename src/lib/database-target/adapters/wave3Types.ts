/**
 * src/lib/database-target/adapters/wave3Types.ts
 *
 * The richer transformer-result contract Fase 6 of the wave-3 mandate
 * requires — distinct from `./types.ts`'s `AdapterOutcome` (used by the
 * domain adapters' `shadowWrite*` functions). Every wave-3 transformer
 * (`wave3Transformers.ts`) returns exactly one `Wave3TransformResult`,
 * never a bare target value and never a fabricated success.
 */

import type { MigrationConfidence, ReviewStatus } from "./types";

export type Wave3TransformStatus =
  | "READY"
  | "REQUIRES_REVIEW"
  | "NOT_RECONSTRUCTABLE"
  | "NOT_ENABLED"
  | "MIGRATION_BLOCKED";

export interface LegacyReference {
  table: string;
  id: string;
}

export interface Wave3TransformResult<TTarget> {
  status: Wave3TransformStatus;
  /** Non-null for READY and REQUIRES_REVIEW (a partial-but-real value); null otherwise — never a placeholder object. */
  value: TTarget | null;
  migrationConfidence: MigrationConfidence | null;
  reviewStatus: ReviewStatus | null;
  warnings: string[];
  missingFields: string[];
  legacyReference: LegacyReference;
  idempotencyKey: string;
}

export function readyResult<TTarget>(input: {
  value: TTarget;
  migrationConfidence: MigrationConfidence;
  reviewStatus: ReviewStatus;
  warnings?: string[];
  missingFields?: string[];
  legacyReference: LegacyReference;
  idempotencyKey: string;
}): Wave3TransformResult<TTarget> {
  return {
    status: "READY",
    value: input.value,
    migrationConfidence: input.migrationConfidence,
    reviewStatus: input.reviewStatus,
    warnings: input.warnings ?? [],
    missingFields: input.missingFields ?? [],
    legacyReference: input.legacyReference,
    idempotencyKey: input.idempotencyKey,
  };
}

export function requiresReviewResult<TTarget>(input: {
  value: TTarget;
  warnings?: string[];
  missingFields: string[];
  legacyReference: LegacyReference;
  idempotencyKey: string;
}): Wave3TransformResult<TTarget> {
  return {
    status: "REQUIRES_REVIEW",
    value: input.value,
    migrationConfidence: "LOW",
    reviewStatus: "REQUIRES_REVIEW",
    warnings: input.warnings ?? [],
    missingFields: input.missingFields,
    legacyReference: input.legacyReference,
    idempotencyKey: input.idempotencyKey,
  };
}

export function notReconstructableResult<TTarget>(input: {
  reason: string;
  legacyReference: LegacyReference;
  idempotencyKey: string;
}): Wave3TransformResult<TTarget> {
  return {
    status: "NOT_RECONSTRUCTABLE",
    value: null,
    migrationConfidence: null,
    reviewStatus: null,
    warnings: [input.reason],
    missingFields: [],
    legacyReference: input.legacyReference,
    idempotencyKey: input.idempotencyKey,
  };
}

export function notEnabledResult<TTarget>(input: {
  reason: string;
  legacyReference: LegacyReference;
  idempotencyKey: string;
}): Wave3TransformResult<TTarget> {
  return {
    status: "NOT_ENABLED",
    value: null,
    migrationConfidence: null,
    reviewStatus: null,
    warnings: [input.reason],
    missingFields: [],
    legacyReference: input.legacyReference,
    idempotencyKey: input.idempotencyKey,
  };
}

export function migrationBlockedResult<TTarget>(input: {
  reason: string;
  legacyReference: LegacyReference;
  idempotencyKey: string;
}): Wave3TransformResult<TTarget> {
  return {
    status: "MIGRATION_BLOCKED",
    value: null,
    migrationConfidence: null,
    reviewStatus: null,
    warnings: [input.reason],
    missingFields: [],
    legacyReference: input.legacyReference,
    idempotencyKey: input.idempotencyKey,
  };
}

export function isReady<T>(result: Wave3TransformResult<T>): result is Wave3TransformResult<T> & { value: T } {
  return result.status === "READY" && result.value !== null;
}

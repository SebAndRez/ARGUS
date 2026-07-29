/**
 * src/lib/database-target/shadow-write/shadowWriteRunner.ts
 *
 * Generic shadow-write engine (Executable Migration Plan Fase 8). Not
 * wired into any real endpoint — isolated, tested standalone, gated by
 * `AdapterWriteContext.shadowWriteEnabled` (itself sourced from
 * `targetDatabaseShadowWrite`, default `false`).
 *
 * Contract (Fase 8, verbatim requirements):
 *   1. Executes the canonical/legacy write FIRST.
 *   2. Captures the legacy result.
 *   3. Only attempts the target transform when the flag is on.
 *   4. Uses an idempotency key (never re-persists the same target row twice).
 *   5. Records the legacy id.
 *   6. Records the outcome.
 *   7. Never alters the response the caller gets back (`legacyResult` is
 *      returned untouched — the shadow outcome is a separate field).
 *   8. Never breaks the main flow if the target side throws.
 *   9. Produces an auditable discrepancy (`ReconciliationError`) on failure.
 *   10. Supports retry (`retryShadowWrite`).
 *   11. Never hides errors (`onOutcome` always fires, even on failure).
 */

import {
  type AdapterOutcome,
  type AdapterWriteContext,
  type ReconciliationError,
  makeReconciliationError,
  notEnabled,
} from "../adapters/types";

export interface ShadowWriteErrorOutcome {
  kind: "ERROR";
  error: ReconciliationError;
}

export type ShadowWriteResultOutcome<TTarget> = AdapterOutcome<TTarget> | ShadowWriteErrorOutcome;

export interface ShadowWriteRecord<TTarget> {
  domain: string;
  legacyId: string;
  idempotencyKey: string;
  outcome: ShadowWriteResultOutcome<TTarget>;
  /** Whether calling `retryShadowWrite` again for this same record is meaningful. `false` once genuinely `PERSISTED` or `NOT_ENABLED` (retrying won't change anything by itself). */
  retryable: boolean;
  attemptedAt: string;
}

/** Tracks which idempotency keys have already been successfully persisted to the target — prevents a retry from double-writing. Injectable so tests never depend on a real store. */
export interface IdempotencyStore {
  hasSucceeded(idempotencyKey: string): boolean;
  markSucceeded(idempotencyKey: string): void;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly succeeded = new Set<string>();

  hasSucceeded(idempotencyKey: string): boolean {
    return this.succeeded.has(idempotencyKey);
  }

  markSucceeded(idempotencyKey: string): void {
    this.succeeded.add(idempotencyKey);
  }
}

export interface ShadowWriteRunOptions<TLegacyResult, TTarget> {
  domain: string;
  legacyId: (result: TLegacyResult) => string;
  idempotencyKey: (result: TLegacyResult) => string;
  targetTransform: (result: TLegacyResult) => AdapterOutcome<TTarget>;
  ctx: AdapterWriteContext;
  idempotencyStore?: IdempotencyStore;
  /** Fires for every attempt, success or failure — never suppressed (requirement 11). */
  onOutcome?: (record: ShadowWriteRecord<TTarget>) => void;
}

function attemptTargetTransform<TLegacyResult, TTarget>(
  legacyResult: TLegacyResult,
  domain: string,
  legacyId: string,
  targetTransform: (result: TLegacyResult) => AdapterOutcome<TTarget>
): ShadowWriteResultOutcome<TTarget> {
  try {
    return targetTransform(legacyResult);
  } catch (err) {
    return {
      kind: "ERROR",
      error: makeReconciliationError(
        domain,
        "TRANSFORM_FAILED",
        err instanceof Error ? err.message : String(err),
        { legacyId }
      ),
    };
  }
}

function isRetryable(outcome: ShadowWriteResultOutcome<unknown>): boolean {
  return (
    outcome.kind === "ERROR" ||
    outcome.kind === "MIGRATION_BLOCKED" ||
    outcome.kind === "REQUIRES_REVIEW"
  );
}

/**
 * Runs a shadow write around an already-executed legacy write. `legacyResult`
 * must be the result of the canonical write the caller performed BEFORE
 * calling this function (requirement 1/2) — this function never performs
 * the legacy write itself, so a target-side failure can never affect it
 * (requirement 8).
 */
export function runShadowWrite<TLegacyResult, TTarget>(
  legacyResult: TLegacyResult,
  options: ShadowWriteRunOptions<TLegacyResult, TTarget>
): ShadowWriteRecord<TTarget> {
  const legacyId = options.legacyId(legacyResult);
  const idempotencyKey = options.idempotencyKey(legacyResult);
  const store = options.idempotencyStore;

  let outcome: ShadowWriteResultOutcome<TTarget>;
  if (!options.ctx.shadowWriteEnabled) {
    outcome = notEnabled(`targetDatabaseShadowWrite is disabled — ${options.domain} shadow write not attempted`);
  } else if (store?.hasSucceeded(idempotencyKey)) {
    outcome = notEnabled(
      `idempotency key ${idempotencyKey} already persisted for ${options.domain} — skipping duplicate shadow write`
    );
  } else {
    outcome = attemptTargetTransform(legacyResult, options.domain, legacyId, options.targetTransform);
    if (outcome.kind === "PERSISTED") {
      store?.markSucceeded(idempotencyKey);
    }
  }

  const record: ShadowWriteRecord<TTarget> = {
    domain: options.domain,
    legacyId,
    idempotencyKey,
    outcome,
    retryable: isRetryable(outcome),
    attemptedAt: new Date().toISOString(),
  };

  options.onOutcome?.(record);
  return record;
}

/**
 * Re-attempts a previously blocked/failed shadow write (requirement 10).
 * Never re-runs the legacy write — only the target-side transform, against
 * the same `legacyResult` the caller re-supplies (e.g. re-fetched from the
 * legacy table, unchanged).
 */
export function retryShadowWrite<TLegacyResult, TTarget>(
  previous: ShadowWriteRecord<TTarget>,
  legacyResult: TLegacyResult,
  options: ShadowWriteRunOptions<TLegacyResult, TTarget>
): ShadowWriteRecord<TTarget> {
  if (!previous.retryable) {
    return previous;
  }
  return runShadowWrite(legacyResult, options);
}

/**
 * src/lib/database-target/shadow-write/wave3ShadowWriteRunner.ts
 *
 * The Ola 3 shadow-write sequencing Fase 8 of the wave-3 mandate mandates,
 * built on top of the wave-3 transformer contract (`wave3Types.ts`) and the
 * observability/reconciliation modules. Distinct from (and does not
 * replace) `shadowWriteRunner.ts` (Ola 1-era, generic `AdapterOutcome`
 * engine, still used by `shadow-write/domains.ts`) — this runner is the
 * one wave-3 callers use, because it actually invokes a real target
 * persistence step (`persist`) and reports the richer
 * `ReconciliationOutcome` vocabulary Fase 10 requires.
 *
 * Order, exactly as specified (Fase 8):
 *   1. The legacy/canonical write already happened — this function only
 *      ever receives its ALREADY-PRODUCED result, never performs it.
 *   2. That result is `legacyResult`.
 *   3. `ctx.shadowWriteEnabled` is checked first.
 *   4. Off: no client opened, no target write attempted, only a safe
 *      `SKIPPED`/`NOT_ENABLED` metric is recorded.
 *   5. On: transform, compute idempotency key (the transformer already
 *      does both), persist, record links (via `persist`'s own return),
 *      record reconciliation, keep the legacy id.
 *   6. Target failure: legacy is UNAFFECTED (it already succeeded before
 *      this function was ever called); a structured, PII-free error is
 *      recorded; the reconciliation outcome is retryable; nothing here
 *      ever throws back to the caller.
 *   7. Never promotes an `IncidentCandidate` to `Incident` — this runner
 *      has no code path that constructs an `Incident`.
 */

import {
  recordIdempotencyHit,
  recordIncidentCandidateCreated,
  recordIncidentCandidateDuplicate,
  recordReconciliationReview,
  recordShadowWriteAttempt,
  recordShadowWriteFailure,
  recordShadowWriteSkipped,
  recordShadowWriteSuccess,
  recordTargetLatencyMs,
} from "../observability/wave3Metrics";
import type { AdapterWriteContext } from "../adapters/types";
import type { Wave3TransformResult } from "../adapters/wave3Types";
import { buildReconciliationOutcome, type ReconciliationOutcome } from "./reconciliationOutcome";

export interface Wave3PersistResult<TTargetId> {
  targetId: TTargetId;
  /** `true` when this call actually inserted a new row; `false` when an existing row for the same idempotency key was found (idempotent hit). */
  created: boolean;
}

export interface Wave3ShadowWriteOptions<TLegacy, TTarget, TTargetId> {
  domain: string;
  ctx: AdapterWriteContext;
  legacyId: (legacy: TLegacy) => string;
  transform: (legacy: TLegacy) => Wave3TransformResult<TTarget>;
  /** The real target repository call (or a test double) — always required; this runner never persists on its own. */
  persist: (target: TTarget, idempotencyKey: string) => Promise<Wave3PersistResult<TTargetId>>;
  correlationId?: string;
}

export type Wave3ShadowWriteResult =
  | { kind: "SKIPPED" }
  | { kind: "ATTEMPTED"; reconciliation: ReconciliationOutcome };

function safeErrorCode(err: unknown): string {
  if (err instanceof Error) return err.name || "UNKNOWN_ERROR";
  return "UNKNOWN_ERROR";
}

function defaultCorrelationId(): string {
  return `wave3-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function runWave3ShadowWrite<TLegacy, TTarget, TTargetId>(
  legacyResult: TLegacy,
  options: Wave3ShadowWriteOptions<TLegacy, TTarget, TTargetId>
): Promise<Wave3ShadowWriteResult> {
  const legacyId = options.legacyId(legacyResult);
  const correlationId = options.correlationId ?? defaultCorrelationId();

  if (!options.ctx.shadowWriteEnabled) {
    recordShadowWriteSkipped({ domain: options.domain, legacyId });
    return { kind: "SKIPPED" };
  }

  recordShadowWriteAttempt({ domain: options.domain, legacyId });

  const transformResult = options.transform(legacyResult);

  if (transformResult.status === "MIGRATION_BLOCKED" || transformResult.status === "NOT_RECONSTRUCTABLE" || !transformResult.value) {
    const reconciliation = buildReconciliationOutcome({
      code: "MIGRATION_GAP",
      domain: options.domain,
      legacyId,
      idempotencyKey: transformResult.idempotencyKey,
      errorCode: transformResult.status,
      correlationId,
    });
    return { kind: "ATTEMPTED", reconciliation };
  }

  if (transformResult.status === "REQUIRES_REVIEW") {
    recordReconciliationReview({ domain: options.domain, legacyId });
  }

  const startedAt = Date.now();
  try {
    const { targetId, created } = await options.persist(transformResult.value, transformResult.idempotencyKey);
    recordTargetLatencyMs({ domain: options.domain, durationMs: Date.now() - startedAt });
    recordShadowWriteSuccess({ domain: options.domain, legacyId });

    if (created) {
      if (options.domain === "IncidentCandidate") recordIncidentCandidateCreated({ legacyId });
    } else {
      recordIdempotencyHit({ domain: options.domain, legacyId, idempotencyKey: transformResult.idempotencyKey });
      if (options.domain === "IncidentCandidate") recordIncidentCandidateDuplicate({ legacyId });
    }

    const reconciliation = buildReconciliationOutcome({
      code: created ? "CREATED" : "ALREADY_EXISTS",
      domain: options.domain,
      legacyId,
      targetId: String(targetId),
      idempotencyKey: transformResult.idempotencyKey,
      migrationConfidence: transformResult.migrationConfidence,
      reviewStatus: transformResult.reviewStatus,
      correlationId,
    });
    return { kind: "ATTEMPTED", reconciliation };
  } catch (err) {
    recordTargetLatencyMs({ domain: options.domain, durationMs: Date.now() - startedAt });
    const errorCode = safeErrorCode(err);
    recordShadowWriteFailure({ domain: options.domain, legacyId, errorCode });
    const reconciliation = buildReconciliationOutcome({
      code: "TARGET_WRITE_FAILED",
      domain: options.domain,
      legacyId,
      idempotencyKey: transformResult.idempotencyKey,
      migrationConfidence: transformResult.migrationConfidence,
      reviewStatus: transformResult.reviewStatus,
      errorCode,
      correlationId,
    });
    return { kind: "ATTEMPTED", reconciliation };
  }
}

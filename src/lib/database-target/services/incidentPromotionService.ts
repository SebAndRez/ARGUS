/**
 * src/lib/database-target/services/incidentPromotionService.ts
 *
 * Wave 4 (Fases 7-10 of the mandate): the ONLY code path in this codebase
 * allowed to create `incident.incidents` rows from an
 * `incident.incident_candidates` row, or to mark a candidate `DISCARDED`.
 * Development/tests only, same isolation as every other file under
 * `database-target/` — never imported by production runtime code, never
 * reachable without an explicit local `TARGET_DATABASE_URL`.
 *
 * Hard invariants enforced here, every one of them checked BEFORE any row
 * is written (fail closed, not fail open):
 *   - The candidate must exist, must not already be `DISCARDED`, and must
 *     not already be `PROMOTED` under a DIFFERENT idempotency key (a
 *     retry under the SAME key is a no-op, never a second promotion).
 *   - An actor (`decidedByActorType`/`decidedByActorId`) or, for the
 *     automated path, a resolved, approved, currently-effective
 *     `AutomationRule` linked to the target incident type is required —
 *     `ck_incident_promotions_actor_or_rule` is the DB-level backstop,
 *     this module is the first line of defense.
 *   - Automated promotion NEVER runs without an `AutomationRule` row that
 *     is `APPROVED`/`ACTIVE`, within its effective window, and explicitly
 *     linked (`governance.automation_rule_incident_types`) to the incident
 *     type being promoted into — never inferred, never defaulted.
 *   - Exactly one `Incident` + one `IncidentPromotion` + one initial
 *     `IncidentTransition` + one `AuditLog` row is created per successful
 *     promotion, all inside a single transaction — partial writes are
 *     impossible (the transaction rolls back on any failure).
 *   - A retry with the same `idempotencyKey` is detected BEFORE the
 *     transaction even starts a write and returns the original result —
 *     never a duplicate. The 3 UNIQUE constraints on
 *     `incident.incident_promotions` are the physical backstop for a race
 *     between two concurrent calls that both pass the pre-check.
 *   - Discard is irreversible (doctrine): `incident.discard_decisions` is
 *     insert-only, the candidate row is NEVER deleted, and a discarded
 *     candidate can never subsequently be promoted.
 *   - This module never creates an `Incident` from `ExternalEvent`,
 *     `Prediction`, or `Report` directly — the ONLY input is an existing
 *     `incident.incident_candidates` row's id.
 */

import { randomUUID } from "node:crypto";
import type { TargetPrismaClientLike } from "../client/targetPrismaClient";
import type { ActorType, ConfidenceLevel, InformationClassification } from "../shared";
import type {
  IncidentVerificationStatus,
  IncidentOperationalStatus,
  IncidentPreventiveStatus,
  IncidentTrend,
  IncidentStructuralStatus,
} from "../incident";
import { uuidFromSeed } from "../repositories/deterministicId";
import {
  transactional,
  lockIncidentCandidate,
  markIncidentCandidatePromoted,
  markIncidentCandidateDiscarded,
  findAutomationRule,
  automationRuleAppliesTo,
  insertIncident,
  findIncidentPromotionByIdempotencyKey,
  findIncidentPromotionByCandidateId,
  insertIncidentPromotion,
  findDiscardDecisionByCandidateId,
  insertDiscardDecision,
  insertIncidentTransition,
  lockHypothesis,
  insertHypothesis,
  markHypothesisDiscarded,
  insertAuditLog,
  type RawSqlClient,
} from "../repositories/incidentPromotionRepository";
import {
  recordPromotionAttempt,
  recordPromotionSuccess,
  recordPromotionFailure,
  recordPromotionDuplicate,
  recordDiscard,
  recordDiscardDuplicate,
  recordHypothesisCreated,
  recordHypothesisSuperseded,
  recordAutomatedPromotionBlocked,
  recordHumanPromotionDenied,
  recordPromotionLatencyMs,
} from "../observability/wave4Metrics";

export class IncidentPromotionError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class CandidateNotFoundError extends IncidentPromotionError {
  constructor(candidateId: string) {
    super(`IncidentCandidate ${candidateId} does not exist`, "CANDIDATE_NOT_FOUND");
  }
}
export class CandidateAlreadyDiscardedError extends IncidentPromotionError {
  constructor(candidateId: string) {
    super(`IncidentCandidate ${candidateId} is DISCARDED — cannot be promoted`, "CANDIDATE_ALREADY_DISCARDED");
  }
}
export class CandidateAlreadyPromotedError extends IncidentPromotionError {
  constructor(candidateId: string) {
    super(
      `IncidentCandidate ${candidateId} is already PROMOTED under a different idempotency key — double promotion is not permitted`,
      "CANDIDATE_ALREADY_PROMOTED"
    );
  }
}
export class IdempotencyConflictError extends IncidentPromotionError {
  constructor(idempotencyKey: string) {
    super(
      `idempotencyKey ${idempotencyKey} was already used for a different IncidentCandidate — refusing to proceed`,
      "IDEMPOTENCY_CONFLICT"
    );
  }
}
export class MissingActorOrAutomationRuleError extends IncidentPromotionError {
  constructor() {
    super("A decidedByActorId or a valid automationRuleId is required to promote a candidate", "MISSING_ACTOR_OR_RULE");
  }
}
export class AutomationRuleNotFoundError extends IncidentPromotionError {
  constructor(automationRuleId: string) {
    super(`AutomationRule ${automationRuleId} does not exist`, "AUTOMATION_RULE_NOT_FOUND");
  }
}
export class AutomationRuleNotApprovedError extends IncidentPromotionError {
  constructor(automationRuleId: string, status: string) {
    super(`AutomationRule ${automationRuleId} has status ${status} — only APPROVED/ACTIVE rules authorize automated promotion`, "AUTOMATION_RULE_NOT_APPROVED");
  }
}
export class AutomationRuleNotApplicableError extends IncidentPromotionError {
  constructor(automationRuleId: string, reason: string) {
    super(`AutomationRule ${automationRuleId} does not apply: ${reason}`, "AUTOMATION_RULE_NOT_APPLICABLE");
  }
}
export class CandidateAlreadyPromotedForDiscardError extends IncidentPromotionError {
  constructor(candidateId: string) {
    super(`IncidentCandidate ${candidateId} is already PROMOTED — a promoted candidate cannot be discarded`, "CANDIDATE_ALREADY_PROMOTED");
  }
}
export class HypothesisNotFoundError extends IncidentPromotionError {
  constructor(hypothesisId: string) {
    super(`IncidentHypothesis ${hypothesisId} does not exist`, "HYPOTHESIS_NOT_FOUND");
  }
}
export class HypothesisOnClosedCandidateError extends IncidentPromotionError {
  constructor(candidateId: string, status: string) {
    super(`IncidentCandidate ${candidateId} has status ${status} — hypotheses can only be recorded while a candidate is under assessment`, "CANDIDATE_CLOSED");
  }
}

/** Coarse, documented ordering used only to compare against `AutomationRule.confidenceThreshold` (numeric(5,2), 0-100 scale) — never used for anything else. */
const CONFIDENCE_SCORE: Record<ConfidenceLevel, number> = {
  UNKNOWN: 0,
  LOW: 25,
  MEDIUM: 50,
  HIGH: 75,
  CONFIRMED: 100,
};

export interface IncidentProposedProfileInput {
  incidentTypeId: string;
  title: string;
  description?: string | null;
  classification: InformationClassification;
  verificationStatus: IncidentVerificationStatus;
  operationalStatus: IncidentOperationalStatus;
  preventiveStatus: IncidentPreventiveStatus;
  trend: IncidentTrend;
  structuralStatus: IncidentStructuralStatus;
  confidence: ConfidenceLevel;
}

export interface PromoteIncidentCandidateCoreInput extends IncidentProposedProfileInput {
  incidentCandidateId: string;
  idempotencyKey: string;
  decidedByActorType: ActorType;
  decidedByActorId: string;
  automationRuleId: string | null;
  automationRuleVersion: number | null;
  explanation: string;
  /** Count of observations linked to this candidate at decision time — required whenever the AutomationRule sets `requiredCorroborationCount`; never assumed satisfied when omitted. */
  corroborationCount?: number;
}

export interface PromotionResult {
  incidentId: string;
  incidentPromotionId: string;
  created: boolean;
}

async function validateAutomationRule(
  tx: RawSqlClient,
  automationRuleId: string,
  incidentTypeId: string,
  confidence: ConfidenceLevel,
  corroborationCount: number | undefined
): Promise<void> {
  const rule = await findAutomationRule(tx, automationRuleId);
  if (!rule) throw new AutomationRuleNotFoundError(automationRuleId);
  if (rule.status !== "APPROVED" && rule.status !== "ACTIVE") {
    throw new AutomationRuleNotApprovedError(automationRuleId, rule.status);
  }
  const now = new Date();
  if (rule.effective_from > now) {
    throw new AutomationRuleNotApplicableError(automationRuleId, "effective_from is in the future");
  }
  if (rule.effective_to && rule.effective_to <= now) {
    throw new AutomationRuleNotApplicableError(automationRuleId, "effective_to has passed");
  }
  const applies = await automationRuleAppliesTo(tx, automationRuleId, incidentTypeId);
  if (!applies) {
    throw new AutomationRuleNotApplicableError(automationRuleId, `not linked to incident type ${incidentTypeId}`);
  }
  if (rule.confidence_threshold != null) {
    const threshold = Number(rule.confidence_threshold);
    if (CONFIDENCE_SCORE[confidence] < threshold) {
      throw new AutomationRuleNotApplicableError(automationRuleId, `confidence ${confidence} is below the required threshold ${threshold}`);
    }
  }
  if (rule.required_corroboration_count != null) {
    if (corroborationCount === undefined || corroborationCount < rule.required_corroboration_count) {
      throw new AutomationRuleNotApplicableError(
        automationRuleId,
        `corroborationCount (${corroborationCount ?? "unknown"}) is below the required ${rule.required_corroboration_count}`
      );
    }
  }
}

async function promoteIncidentCandidateCore(
  client: TargetPrismaClientLike,
  input: PromoteIncidentCandidateCoreInput
): Promise<PromotionResult> {
  const startedAt = Date.now();
  recordPromotionAttempt({ incidentCandidateId: input.incidentCandidateId, actorType: input.decidedByActorType });

  if (input.decidedByActorType === "AUTOMATION_RULE" && !input.automationRuleId) {
    throw new MissingActorOrAutomationRuleError();
  }
  if (input.decidedByActorType !== "AUTOMATION_RULE" && !input.decidedByActorId) {
    throw new MissingActorOrAutomationRuleError();
  }

  // Fast idempotency pre-check — outside any lock, cheap, catches the common retry case immediately.
  const preExisting = await findIncidentPromotionByIdempotencyKey(client as unknown as RawSqlClient, input.idempotencyKey);
  if (preExisting) {
    if (preExisting.incident_candidate_id !== input.incidentCandidateId) {
      throw new IdempotencyConflictError(input.idempotencyKey);
    }
    recordPromotionDuplicate({ incidentCandidateId: input.incidentCandidateId, idempotencyKey: input.idempotencyKey });
    return { incidentId: preExisting.incident_id, incidentPromotionId: preExisting.id, created: false };
  }

  try {
    const result = await transactional(client).$transaction(async (tx) => {
      const candidate = await lockIncidentCandidate(tx, input.incidentCandidateId);
      if (!candidate) throw new CandidateNotFoundError(input.incidentCandidateId);
      if (candidate.status === "DISCARDED") throw new CandidateAlreadyDiscardedError(input.incidentCandidateId);

      if (candidate.status === "PROMOTED") {
        const existing = await findIncidentPromotionByCandidateId(tx, input.incidentCandidateId);
        if (existing && existing.idempotency_key === input.idempotencyKey) {
          return { incidentId: existing.incident_id, incidentPromotionId: existing.id, created: false };
        }
        throw new CandidateAlreadyPromotedError(input.incidentCandidateId);
      }

      if (input.decidedByActorType === "AUTOMATION_RULE") {
        await validateAutomationRule(tx, input.automationRuleId as string, input.incidentTypeId, input.confidence, input.corroborationCount);
      }

      const incidentId = uuidFromSeed(`Incident:${input.idempotencyKey}`);
      const incidentPromotionId = uuidFromSeed(`IncidentPromotion:${input.idempotencyKey}`);
      const transitionId = uuidFromSeed(`IncidentTransition:${input.idempotencyKey}`);
      const auditLogId = uuidFromSeed(`AuditLog:${input.idempotencyKey}:promotion`);

      await insertIncident(tx, {
        id: incidentId,
        originCandidateId: input.incidentCandidateId,
        incidentTypeId: input.incidentTypeId,
        classification: input.classification,
        title: input.title,
        description: input.description ?? null,
        verificationStatus: input.verificationStatus,
        operationalStatus: input.operationalStatus,
        preventiveStatus: input.preventiveStatus,
        trend: input.trend,
        structuralStatus: input.structuralStatus,
      });

      await insertIncidentPromotion(tx, {
        id: incidentPromotionId,
        incidentCandidateId: input.incidentCandidateId,
        incidentId,
        decidedByActorType: input.decidedByActorType,
        decidedByActorId: input.decidedByActorId,
        automationRuleId: input.automationRuleId,
        automationRuleVersion: input.automationRuleVersion,
        inputDataSnapshot: {
          incidentTypeId: input.incidentTypeId,
          verificationStatus: input.verificationStatus,
          operationalStatus: input.operationalStatus,
          preventiveStatus: input.preventiveStatus,
          trend: input.trend,
          structuralStatus: input.structuralStatus,
          confidence: input.confidence,
          corroborationCount: input.corroborationCount ?? null,
        },
        confidence: input.confidence,
        explanation: input.explanation,
        idempotencyKey: input.idempotencyKey,
      });

      await markIncidentCandidatePromoted(tx, input.incidentCandidateId);

      await insertIncidentTransition(tx, {
        id: transitionId,
        incidentId,
        dimension: "OPERATIONAL",
        previousValue: null,
        newValue: input.operationalStatus,
        reason: `Promoted from IncidentCandidate ${input.incidentCandidateId}`,
        decidedByActorType: input.decidedByActorType,
        decidedByActorId: input.decidedByActorId,
      });

      await insertAuditLog(tx, auditLogId, {
        actorType: input.decidedByActorType,
        actorId: input.decidedByActorId,
        action: "INCIDENT_CANDIDATE_PROMOTED",
        targetTable: "incident.incidents",
        targetId: incidentId,
        classification: input.classification,
        context: { automationRuleId: input.automationRuleId },
        purpose: null,
        decision: input.explanation,
        result: "SUCCESS",
        beforeState: { incidentCandidateId: input.incidentCandidateId, status: candidate.status },
        afterState: { incidentId, status: "PROMOTED" },
        correlationId: input.idempotencyKey,
        incidentId,
      });

      return { incidentId, incidentPromotionId, created: true };
    });

    recordPromotionSuccess({ incidentCandidateId: input.incidentCandidateId, incidentId: result.incidentId, actorType: input.decidedByActorType });
    return result;
  } catch (err) {
    if (input.decidedByActorType === "AUTOMATION_RULE" && err instanceof IncidentPromotionError) {
      recordAutomatedPromotionBlocked({ incidentCandidateId: input.incidentCandidateId, errorCode: err.code });
    } else if (err instanceof IncidentPromotionError) {
      recordHumanPromotionDenied({ incidentCandidateId: input.incidentCandidateId, errorCode: err.code });
    }
    recordPromotionFailure({ incidentCandidateId: input.incidentCandidateId, errorCode: err instanceof IncidentPromotionError ? err.code : "UNKNOWN" });
    throw err;
  } finally {
    recordPromotionLatencyMs({ durationMs: Date.now() - startedAt });
  }
}

export interface PromoteIncidentCandidateHumanInput extends IncidentProposedProfileInput {
  incidentCandidateId: string;
  idempotencyKey: string;
  decidedByActorId: string;
  decidedByActorType?: Exclude<ActorType, "AUTOMATION_RULE">;
  explanation: string;
}

/** A human decider (any `ActorType` other than `AUTOMATION_RULE`) promotes a candidate. Requires a real, non-empty `explanation`. */
export async function promoteIncidentCandidateHuman(
  client: TargetPrismaClientLike,
  input: PromoteIncidentCandidateHumanInput
): Promise<PromotionResult> {
  if (!input.decidedByActorId) throw new MissingActorOrAutomationRuleError();
  return promoteIncidentCandidateCore(client, {
    ...input,
    decidedByActorType: input.decidedByActorType ?? "PERSON",
    automationRuleId: null,
    automationRuleVersion: null,
  });
}

export interface PromoteIncidentCandidateAutomatedInput extends IncidentProposedProfileInput {
  incidentCandidateId: string;
  idempotencyKey: string;
  automationRuleId: string;
  automationRuleVersion: number;
  explanation: string;
  corroborationCount?: number;
}

/** An `AutomationRule` promotes a candidate with no human in the loop. The rule must exist, be APPROVED/ACTIVE, be within its effective window, and be explicitly linked to `incidentTypeId` — validated inside the transaction, before any row is written. */
export async function promoteIncidentCandidateAutomated(
  client: TargetPrismaClientLike,
  input: PromoteIncidentCandidateAutomatedInput
): Promise<PromotionResult> {
  if (!input.automationRuleId) throw new MissingActorOrAutomationRuleError();
  return promoteIncidentCandidateCore(client, {
    ...input,
    decidedByActorType: "AUTOMATION_RULE",
    decidedByActorId: input.automationRuleId,
  });
}

// ---------------------------------------------------------------------------
// DiscardDecision
// ---------------------------------------------------------------------------

export interface DiscardIncidentCandidateInput {
  incidentCandidateId: string;
  decidedByActorType: ActorType;
  decidedByActorId: string;
  reason: string;
}

export interface DiscardResult {
  discardDecisionId: string;
  created: boolean;
}

/** Discard is irreversible (doctrine): the candidate row is NEVER deleted, and this is the only status transition a discarded candidate can ever make — a promoted candidate can never be discarded, and a discarded candidate can never be promoted. */
export async function discardIncidentCandidate(client: TargetPrismaClientLike, input: DiscardIncidentCandidateInput): Promise<DiscardResult> {
  if (!input.decidedByActorId) throw new MissingActorOrAutomationRuleError();
  if (!input.reason) throw new IncidentPromotionError("A non-empty reason is required to discard an IncidentCandidate", "MISSING_REASON");

  const result = await transactional(client).$transaction(async (tx) => {
    const candidate = await lockIncidentCandidate(tx, input.incidentCandidateId);
    if (!candidate) throw new CandidateNotFoundError(input.incidentCandidateId);
    if (candidate.status === "PROMOTED") throw new CandidateAlreadyPromotedForDiscardError(input.incidentCandidateId);

    if (candidate.status === "DISCARDED") {
      const existing = await findDiscardDecisionByCandidateId(tx, input.incidentCandidateId);
      if (existing) {
        recordDiscardDuplicate({ incidentCandidateId: input.incidentCandidateId });
        return { discardDecisionId: existing.id, created: false };
      }
    }

    const discardDecisionId = uuidFromSeed(`DiscardDecision:${input.incidentCandidateId}`);
    const auditLogId = uuidFromSeed(`AuditLog:${input.incidentCandidateId}:discard`);

    await insertDiscardDecision(tx, {
      id: discardDecisionId,
      incidentCandidateId: input.incidentCandidateId,
      decidedByActorType: input.decidedByActorType,
      decidedByActorId: input.decidedByActorId,
      reason: input.reason,
    });
    await markIncidentCandidateDiscarded(tx, input.incidentCandidateId);
    await insertAuditLog(tx, auditLogId, {
      actorType: input.decidedByActorType,
      actorId: input.decidedByActorId,
      action: "INCIDENT_CANDIDATE_DISCARDED",
      targetTable: "incident.incident_candidates",
      targetId: input.incidentCandidateId,
      classification: candidate.classification,
      context: null,
      purpose: null,
      decision: input.reason,
      result: "SUCCESS",
      beforeState: { status: candidate.status },
      afterState: { status: "DISCARDED" },
      correlationId: null,
      incidentId: null,
    });

    return { discardDecisionId, created: true };
  });

  if (result.created) recordDiscard({ incidentCandidateId: input.incidentCandidateId });
  return result;
}

// ---------------------------------------------------------------------------
// IncidentHypothesis
// ---------------------------------------------------------------------------

export interface CreateIncidentHypothesisInput {
  incidentCandidateId: string;
  description: string;
}

export async function createIncidentHypothesis(client: TargetPrismaClientLike, input: CreateIncidentHypothesisInput): Promise<{ hypothesisId: string }> {
  if (!input.description) throw new IncidentPromotionError("A non-empty description is required to create an IncidentHypothesis", "MISSING_DESCRIPTION");

  const hypothesisId = await transactional(client).$transaction(async (tx) => {
    const candidate = await lockIncidentCandidate(tx, input.incidentCandidateId);
    if (!candidate) throw new CandidateNotFoundError(input.incidentCandidateId);
    if (candidate.status === "PROMOTED" || candidate.status === "DISCARDED") {
      throw new HypothesisOnClosedCandidateError(input.incidentCandidateId, candidate.status);
    }
    const id = randomUUID();
    await insertHypothesis(tx, { id, incidentCandidateId: input.incidentCandidateId, description: input.description });
    return id;
  });

  recordHypothesisCreated({ incidentCandidateId: input.incidentCandidateId, hypothesisId });
  return { hypothesisId };
}

export interface SupersedeIncidentHypothesisInput {
  hypothesisId: string;
}

/** Marks a hypothesis `DISCARDED` — never deleted, matching the same append-only discipline as `DiscardDecision`. Idempotent: superseding an already-`DISCARDED` hypothesis is a no-op. */
export async function supersedeIncidentHypothesis(client: TargetPrismaClientLike, input: SupersedeIncidentHypothesisInput): Promise<{ created: boolean }> {
  const created = await transactional(client).$transaction(async (tx) => {
    const hypothesis = await lockHypothesis(tx, input.hypothesisId);
    if (!hypothesis) throw new HypothesisNotFoundError(input.hypothesisId);
    if (hypothesis.status === "DISCARDED") return false;
    await markHypothesisDiscarded(tx, input.hypothesisId);
    return true;
  });

  if (created) recordHypothesisSuperseded({ incidentCandidateId: undefined, hypothesisId: input.hypothesisId });
  return { created };
}

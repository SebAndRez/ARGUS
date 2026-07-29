/**
 * src/lib/database-target/repositories/incidentPromotionRepository.ts
 *
 * Raw-SQL primitives backing the Wave 4 promotion/discard/hypothesis
 * services (`services/incidentPromotionService.ts`). Development/tests
 * only, same isolation rules as `wave3Repository.ts` — never imported by
 * production runtime code.
 *
 * Every write in this file is expected to run inside a single
 * `client.$transaction(async (tx) => {...})` interactive transaction,
 * with the candidate/hypothesis row locked via `SELECT ... FOR UPDATE`
 * before any decision is made — that row lock is what makes two
 * concurrent promotion/discard attempts on the SAME candidate serialize
 * (the second waits for the first to commit, then observes its result),
 * while the UNIQUE constraints on `incident.incident_promotions`
 * (candidate, incident, idempotency_key) and
 * `incident.discard_decisions` (candidate) are the physical backstop that
 * makes a duplicate row impossible even across a lock race.
 */

import type { TargetPrismaClientLike } from "../client/targetPrismaClient";
import type { ActorType, InformationClassification, ConfidenceLevel } from "../shared";
import type {
  IncidentVerificationStatus,
  IncidentOperationalStatus,
  IncidentPreventiveStatus,
  IncidentTrend,
  IncidentStructuralStatus,
  IncidentStateDimension,
  IncidentCandidateStatus,
  IncidentHypothesisStatus,
} from "../incident";
import type { AuditLogInput } from "../security";
import { computeAuditLogIntegrityValue, AUDIT_LOG_CANONICALIZATION_VERSION } from "../security";

export interface RawSqlClient {
  $queryRawUnsafe: <T = unknown>(query: string, ...values: unknown[]) => Promise<T[]>;
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<number>;
}

interface TransactionalTargetClient extends RawSqlClient {
  $transaction: <T>(fn: (tx: RawSqlClient) => Promise<T>) => Promise<T>;
}

export function transactional(client: TargetPrismaClientLike): TransactionalTargetClient {
  return client as unknown as TransactionalTargetClient;
}

export function raw(client: TargetPrismaClientLike | RawSqlClient): RawSqlClient {
  return client as unknown as RawSqlClient;
}

// ---------------------------------------------------------------------------
// incident.incident_candidates
// ---------------------------------------------------------------------------

export interface IncidentCandidateRow {
  id: string;
  status: IncidentCandidateStatus;
  correlation_key: string | null;
  classification: InformationClassification;
}

/** Locks the candidate row for the duration of the enclosing transaction — the serialization point for concurrent promotion/discard attempts on the same candidate. */
export async function lockIncidentCandidate(tx: RawSqlClient, incidentCandidateId: string): Promise<IncidentCandidateRow | null> {
  const rows = await tx.$queryRawUnsafe<IncidentCandidateRow>(
    `SELECT id, status, correlation_key, classification FROM incident.incident_candidates WHERE id = $1::uuid FOR UPDATE`,
    incidentCandidateId
  );
  return rows[0] ?? null;
}

export async function markIncidentCandidatePromoted(tx: RawSqlClient, incidentCandidateId: string): Promise<void> {
  await tx.$executeRawUnsafe(
    `UPDATE incident.incident_candidates SET status = 'PROMOTED'::incident.incident_candidate_status_enum WHERE id = $1::uuid`,
    incidentCandidateId
  );
}

export async function markIncidentCandidateDiscarded(tx: RawSqlClient, incidentCandidateId: string): Promise<void> {
  await tx.$executeRawUnsafe(
    `UPDATE incident.incident_candidates SET status = 'DISCARDED'::incident.incident_candidate_status_enum WHERE id = $1::uuid`,
    incidentCandidateId
  );
}

// ---------------------------------------------------------------------------
// governance.automation_rules / automation_rule_incident_types
// ---------------------------------------------------------------------------

export interface AutomationRuleRow {
  id: string;
  status: string;
  confidence_threshold: string | null;
  required_corroboration_count: number | null;
  effective_from: Date;
  effective_to: Date | null;
}

export async function findAutomationRule(tx: RawSqlClient, automationRuleId: string): Promise<AutomationRuleRow | null> {
  const rows = await tx.$queryRawUnsafe<AutomationRuleRow>(
    `SELECT id, status, confidence_threshold, required_corroboration_count, effective_from, effective_to
     FROM governance.automation_rules WHERE id = $1::uuid`,
    automationRuleId
  );
  return rows[0] ?? null;
}

export async function automationRuleAppliesTo(tx: RawSqlClient, automationRuleId: string, incidentTypeId: string): Promise<boolean> {
  const rows = await tx.$queryRawUnsafe<{ automation_rule_id: string }>(
    `SELECT automation_rule_id FROM governance.automation_rule_incident_types WHERE automation_rule_id = $1::uuid AND incident_type_id = $2::uuid`,
    automationRuleId,
    incidentTypeId
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// incident.incidents
// ---------------------------------------------------------------------------

export interface InsertIncidentInput {
  id: string;
  originCandidateId: string;
  incidentTypeId: string;
  classification: InformationClassification;
  title: string;
  description: string | null;
  verificationStatus: IncidentVerificationStatus;
  operationalStatus: IncidentOperationalStatus;
  preventiveStatus: IncidentPreventiveStatus;
  trend: IncidentTrend;
  structuralStatus: IncidentStructuralStatus;
}

export async function insertIncident(tx: RawSqlClient, input: InsertIncidentInput): Promise<void> {
  await tx.$executeRawUnsafe(
    `INSERT INTO incident.incidents
       (id, origin_candidate_id, incident_type_id, classification, title, description,
        verification_status, operational_status, preventive_status, trend, structural_status, created_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::security.information_classification_enum, $5, $6,
             $7::incident.incident_verification_status_enum, $8::incident.incident_operational_status_enum,
             $9::incident.incident_preventive_status_enum, $10::incident.incident_trend_enum,
             $11::incident.incident_structural_status_enum, now())`,
    input.id,
    input.originCandidateId,
    input.incidentTypeId,
    input.classification,
    input.title,
    input.description,
    input.verificationStatus,
    input.operationalStatus,
    input.preventiveStatus,
    input.trend,
    input.structuralStatus
  );
}

// ---------------------------------------------------------------------------
// incident.incident_promotions
// ---------------------------------------------------------------------------

export interface IncidentPromotionRow {
  id: string;
  incident_candidate_id: string;
  incident_id: string;
  idempotency_key: string;
}

export async function findIncidentPromotionByIdempotencyKey(tx: RawSqlClient, idempotencyKey: string): Promise<IncidentPromotionRow | null> {
  const rows = await tx.$queryRawUnsafe<IncidentPromotionRow>(
    `SELECT id, incident_candidate_id, incident_id, idempotency_key FROM incident.incident_promotions WHERE idempotency_key = $1::uuid`,
    idempotencyKey
  );
  return rows[0] ?? null;
}

export async function findIncidentPromotionByCandidateId(tx: RawSqlClient, incidentCandidateId: string): Promise<IncidentPromotionRow | null> {
  const rows = await tx.$queryRawUnsafe<IncidentPromotionRow>(
    `SELECT id, incident_candidate_id, incident_id, idempotency_key FROM incident.incident_promotions WHERE incident_candidate_id = $1::uuid`,
    incidentCandidateId
  );
  return rows[0] ?? null;
}

export interface InsertIncidentPromotionInput {
  id: string;
  incidentCandidateId: string;
  incidentId: string;
  decidedByActorType: ActorType;
  decidedByActorId: string;
  automationRuleId: string | null;
  automationRuleVersion: number | null;
  inputDataSnapshot: Record<string, unknown>;
  confidence: ConfidenceLevel;
  explanation: string;
  idempotencyKey: string;
}

export async function insertIncidentPromotion(tx: RawSqlClient, input: InsertIncidentPromotionInput): Promise<void> {
  await tx.$executeRawUnsafe(
    `INSERT INTO incident.incident_promotions
       (id, incident_candidate_id, incident_id, decided_by_actor_type, decided_by_actor_id, automation_rule_id,
        automation_rule_version, input_data_snapshot, confidence, explanation, idempotency_key, decided_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::security.actor_type_enum, $5::uuid, $6::uuid,
             $7, $8::jsonb, $9::evidence.confidence_level_enum, $10, $11::uuid, now())`,
    input.id,
    input.incidentCandidateId,
    input.incidentId,
    input.decidedByActorType,
    input.decidedByActorId,
    input.automationRuleId,
    input.automationRuleVersion,
    JSON.stringify(input.inputDataSnapshot),
    input.confidence,
    input.explanation,
    input.idempotencyKey
  );
}

// ---------------------------------------------------------------------------
// incident.discard_decisions
// ---------------------------------------------------------------------------

export interface DiscardDecisionRow {
  id: string;
  incident_candidate_id: string;
}

export async function findDiscardDecisionByCandidateId(tx: RawSqlClient, incidentCandidateId: string): Promise<DiscardDecisionRow | null> {
  const rows = await tx.$queryRawUnsafe<DiscardDecisionRow>(
    `SELECT id, incident_candidate_id FROM incident.discard_decisions WHERE incident_candidate_id = $1::uuid`,
    incidentCandidateId
  );
  return rows[0] ?? null;
}

export interface InsertDiscardDecisionInput {
  id: string;
  incidentCandidateId: string;
  decidedByActorType: ActorType;
  decidedByActorId: string;
  reason: string;
}

export async function insertDiscardDecision(tx: RawSqlClient, input: InsertDiscardDecisionInput): Promise<void> {
  await tx.$executeRawUnsafe(
    `INSERT INTO incident.discard_decisions (id, incident_candidate_id, decided_by_actor_type, decided_by_actor_id, reason, decided_at)
     VALUES ($1::uuid, $2::uuid, $3::security.actor_type_enum, $4::uuid, $5, now())`,
    input.id,
    input.incidentCandidateId,
    input.decidedByActorType,
    input.decidedByActorId,
    input.reason
  );
}

// ---------------------------------------------------------------------------
// incident.incident_transitions
// ---------------------------------------------------------------------------

export interface InsertIncidentTransitionInput {
  id: string;
  incidentId: string;
  dimension: IncidentStateDimension;
  previousValue: string | null;
  newValue: string;
  reason: string | null;
  decidedByActorType: ActorType;
  decidedByActorId: string;
}

export async function insertIncidentTransition(tx: RawSqlClient, input: InsertIncidentTransitionInput): Promise<void> {
  await tx.$executeRawUnsafe(
    `INSERT INTO incident.incident_transitions
       (id, incident_id, dimension, previous_value, new_value, reason, decided_by_actor_type, decided_by_actor_id, occurred_at)
     VALUES ($1::uuid, $2::uuid, $3::incident.incident_state_dimension_enum, $4, $5, $6, $7::security.actor_type_enum, $8::uuid, now())`,
    input.id,
    input.incidentId,
    input.dimension,
    input.previousValue,
    input.newValue,
    input.reason,
    input.decidedByActorType,
    input.decidedByActorId
  );
}

// ---------------------------------------------------------------------------
// incident.hypotheses
// ---------------------------------------------------------------------------

export interface HypothesisRow {
  id: string;
  incident_candidate_id: string;
  status: IncidentHypothesisStatus;
}

export async function lockHypothesis(tx: RawSqlClient, hypothesisId: string): Promise<HypothesisRow | null> {
  const rows = await tx.$queryRawUnsafe<HypothesisRow>(
    `SELECT id, incident_candidate_id, status FROM incident.hypotheses WHERE id = $1::uuid FOR UPDATE`,
    hypothesisId
  );
  return rows[0] ?? null;
}

export interface InsertHypothesisInput {
  id: string;
  incidentCandidateId: string;
  description: string;
}

export async function insertHypothesis(tx: RawSqlClient, input: InsertHypothesisInput): Promise<void> {
  await tx.$executeRawUnsafe(
    `INSERT INTO incident.hypotheses (id, incident_candidate_id, description, status, created_at)
     VALUES ($1::uuid, $2::uuid, $3, 'ACTIVE'::incident.hypothesis_status_enum, now())`,
    input.id,
    input.incidentCandidateId,
    input.description
  );
}

export async function markHypothesisDiscarded(tx: RawSqlClient, hypothesisId: string): Promise<void> {
  await tx.$executeRawUnsafe(
    `UPDATE incident.hypotheses SET status = 'DISCARDED'::incident.hypothesis_status_enum WHERE id = $1::uuid`,
    hypothesisId
  );
}

// ---------------------------------------------------------------------------
// security.audit_logs
// ---------------------------------------------------------------------------

export async function insertAuditLog(tx: RawSqlClient, id: string, input: AuditLogInput): Promise<void> {
  // Sign ONLY the designated AuditLogSignableContent subset — `input` (an
  // AuditLogInput) also carries `correlationId`/`incidentId`, which must
  // NEVER participate in the integrity computation (a verifier recomputing
  // from the audit_logs row's own signable columns, as
  // computeAuditLogIntegrityValue's own doc comment specifies, would not
  // have those two extra fields to include).
  const integrityValue = computeAuditLogIntegrityValue({
    actorType: input.actorType,
    actorId: input.actorId,
    action: input.action,
    targetTable: input.targetTable,
    targetId: input.targetId,
    classification: input.classification,
    context: input.context,
    purpose: input.purpose,
    decision: input.decision,
    result: input.result,
    beforeState: input.beforeState,
    afterState: input.afterState,
  });
  await tx.$executeRawUnsafe(
    `INSERT INTO security.audit_logs
       (id, actor_type, actor_id, action, target_table, target_id, classification, context, purpose, decision,
        result, before_state, after_state, integrity_value, integrity_algorithm, canonicalization_version,
        correlation_id, incident_id, occurred_at)
     VALUES ($1::uuid, $2::security.actor_type_enum, $3::uuid, $4, $5, $6::uuid, $7::security.information_classification_enum,
             $8::jsonb, $9, $10, $11, $12::jsonb, $13::jsonb, $14, 'HMAC-SHA256', $15, $16::uuid, $17::uuid, now())`,
    id,
    input.actorType,
    input.actorId,
    input.action,
    input.targetTable,
    input.targetId,
    input.classification,
    input.context ? JSON.stringify(input.context) : null,
    input.purpose,
    input.decision,
    input.result,
    input.beforeState ? JSON.stringify(input.beforeState) : null,
    input.afterState ? JSON.stringify(input.afterState) : null,
    integrityValue,
    AUDIT_LOG_CANONICALIZATION_VERSION,
    input.correlationId ?? null,
    input.incidentId ?? null
  );
}

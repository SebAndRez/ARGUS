/**
 * src/lib/database-target/repositories/incidentOperationalZoneRepository.ts
 *
 * Isolated target repository for R31 — the persisted path
 *
 *   incident -> operational zone -> jurisdiction -> command scope
 *
 * Development/tests only, never imported by production runtime code, and NOT
 * wired to any endpoint.
 *
 * Contains NO authorization logic and NO SQL of its own beyond calling the
 * canonical SECURITY DEFINER functions created in
 * `prisma/target-migrations/080_geography/migration.sql` §6. That is
 * deliberate, and for the same reason as
 * `accessRoleAssignmentRepository.ts`: validation, the COMMAND gate,
 * idempotency, and the transactional coupling to `security.audit_logs` all
 * live in one place — the database — where a different caller cannot bypass
 * them. A second implementation here would be free to drift from the one the
 * database actually enforces, and the drift would be invisible.
 *
 * PRINCIPALS. The assignment / revocation / supersession functions are
 * executable ONLY by `access_admin`, so those helpers must be given an admin
 * client (`getTargetAdminPrismaClient()`). Handing them the runtime (app_api)
 * client fails with insufficient_privilege — by design, and asserted by
 * `incident-zone-rls.test.ts`. The read helpers and the spatial resolver run
 * fine on the runtime client.
 */

import type { RawSqlClient } from "./incidentPromotionRepository";

/**
 * Mirrors `geo.incident_zone_assignment_kind_enum`.
 *
 * Only COMMAND is consulted by `security.fn_has_command_role`. PRIMARY,
 * AFFECTED and MONITORING grant no authority, and there is no fallback
 * between them: an incident with no COMMAND assignment authorizes nobody.
 */
export type IncidentZoneAssignmentKind = "PRIMARY" | "AFFECTED" | "COMMAND" | "MONITORING";

/**
 * Mirrors `geo.incident_zone_resolution_method_enum`. Load-bearing rather than
 * descriptive — the CHECK constraints read it to decide whether a row may be
 * COMMAND at all:
 *   SPATIAL_INTERSECTION     -> AFFECTED | MONITORING only
 *   INHERITED_FROM_CANDIDATE -> PRIMARY | AFFECTED | MONITORING only
 *   AUTOMATION_RULE          -> COMMAND only if the rule is expressly
 *                               authorized AND approved
 *   MANUAL | OFFICIAL_SOURCE -> COMMAND via an authorized, audited operation
 */
export type IncidentZoneResolutionMethod =
  | "MANUAL"
  | "OFFICIAL_SOURCE"
  | "SPATIAL_INTERSECTION"
  | "INHERITED_FROM_CANDIDATE"
  | "AUTOMATION_RULE";

export type IncidentZoneAssignmentStatus = "ACTIVE" | "REVOKED" | "SUPERSEDED";

export type ZoneAssignmentReviewStatus =
  | "AUTO_APPROVED"
  | "REQUIRES_REVIEW"
  | "REVIEWED_APPROVED"
  | "REVIEWED_REJECTED";

export type ConfidenceLevel = "UNKNOWN" | "LOW" | "MEDIUM" | "HIGH" | "CONFIRMED";

/** Mirrors `geo.spatial_resolution_outcome_enum`. A resolver never answers "authorized". */
export type SpatialResolutionOutcome =
  | "RESOLVED"
  | "MULTIPLE_MATCHES"
  | "NO_MATCH"
  | "INVALID_GEOMETRY"
  | "REQUIRES_REVIEW";

export interface AssignIncidentOperationalZoneInput {
  incidentId: string;
  operationalZoneId: string;
  assignmentKind: IncidentZoneAssignmentKind;
  resolutionMethod: IncidentZoneResolutionMethod;
  /** Required for COMMAND unless `automationRuleId` is given — exactly one of the two. */
  assignedBySubjectId?: string;
  /** Required for COMMAND unless `assignedBySubjectId` is given — exactly one of the two. */
  automationRuleId?: string;
  confidence?: ConfidenceLevel;
  reviewStatus?: ZoneAssignmentReviewStatus;
  validFrom?: Date;
  validUntil?: Date;
  sourceRecordId?: string;
  evidenceId?: string;
  /** Controlled code (`^[A-Z][A-Z0-9_]{2,49}$`). Mandatory for COMMAND; free text is rejected by the SQL side. */
  reasonCode?: string;
  provenance?: string;
  /** Reuse the same key to retry safely: the same row is returned instead of a second, overlapping relation. */
  idempotencyKey?: string;
  /** Mandatory for COMMAND: it is what ties the row to its audit record. */
  correlationId?: string;
}

export interface RevokeIncidentOperationalZoneAssignmentInput {
  assignmentId: string;
  /** Controlled code (`^[A-Z][A-Z0-9_]{2,49}$`). */
  reasonCode: string;
  revokedBySubjectId?: string;
  correlationId?: string;
}

export interface SupersedeIncidentOperationalZoneAssignmentInput {
  assignmentId: string;
  operationalZoneId: string;
  assignmentKind: IncidentZoneAssignmentKind;
  resolutionMethod: IncidentZoneResolutionMethod;
  reasonCode: string;
  assignedBySubjectId?: string;
  automationRuleId?: string;
  confidence?: ConfidenceLevel;
  reviewStatus?: ZoneAssignmentReviewStatus;
  validUntil?: Date;
  provenance?: string;
  idempotencyKey?: string;
  correlationId?: string;
}

export interface IncidentZoneAssignmentRow {
  id: string;
  incidentId: string;
  operationalZoneId: string;
  assignmentKind: IncidentZoneAssignmentKind;
  resolutionMethod: IncidentZoneResolutionMethod;
  status: IncidentZoneAssignmentStatus;
  validFrom: Date;
  validUntil: Date | null;
  confidence: ConfidenceLevel;
  reviewStatus: ZoneAssignmentReviewStatus;
  assignedBySubjectId: string | null;
  automationRuleId: string | null;
  correlationId: string | null;
  provenance: string;
  supersededByAssignmentId: string | null;
  revokedAt: Date | null;
  revocationReasonCode: string | null;
}

export interface ZoneResolutionProposal {
  operationalZoneId: string | null;
  outcome: SpatialResolutionOutcome;
  /** Never COMMAND, and never PRIMARY: geometry proposes reach, not authority or description. */
  proposedAssignmentKind: Exclude<IncidentZoneAssignmentKind, "COMMAND" | "PRIMARY"> | null;
  confidence: ConfidenceLevel;
  overlapRatio: number | null;
  covered: boolean | null;
  jurisdictionResolvable: boolean;
}

export interface EffectiveJurisdictionRow {
  jurisdictionId: string;
  operationalZoneId: string;
  assignmentKind: IncidentZoneAssignmentKind;
  assignmentId: string;
  declaringOrganizationId: string | null;
}

/**
 * Creates an incident/zone assignment. The SQL function validates the incident
 * is open, the zone is active, the window is coherent, and — for COMMAND — that
 * the method is authorizable, the zone's jurisdiction is resolvable, exactly one
 * authority is named, the subject is ACTIVE with a real ADMIN/OPERATIONAL/
 * SECURITY grant and a current institutional membership, or the automation rule
 * is expressly command-authorized and approved. It writes the row AND its
 * `security.audit_logs` entry in the SAME transaction, so an assignment without
 * an audit trail is not a state this code can produce.
 *
 * Requires the ADMIN principal (`access_admin`).
 */
export async function assignIncidentOperationalZone(
  tx: RawSqlClient,
  input: AssignIncidentOperationalZoneInput
): Promise<string> {
  const rows = await tx.$queryRawUnsafe<{ id: string }>(
    `SELECT geo.fn_assign_incident_operational_zone(
              $1::uuid, $2::uuid,
              $3::geo.incident_zone_assignment_kind_enum,
              $4::geo.incident_zone_resolution_method_enum,
              $5::uuid, $6::uuid,
              $7::evidence.confidence_level_enum,
              $8::geo.zone_assignment_review_status_enum,
              $9::timestamptz, $10::timestamptz,
              $11::uuid, $12::uuid, $13::varchar, $14::varchar, $15::uuid, $16::uuid, NULL::uuid) AS id`,
    input.incidentId,
    input.operationalZoneId,
    input.assignmentKind,
    input.resolutionMethod,
    input.assignedBySubjectId ?? null,
    input.automationRuleId ?? null,
    input.confidence ?? "MEDIUM",
    input.reviewStatus ?? "REQUIRES_REVIEW",
    input.validFrom ?? new Date(),
    input.validUntil ?? null,
    input.sourceRecordId ?? null,
    input.evidenceId ?? null,
    input.reasonCode ?? null,
    input.provenance ?? "MANUAL",
    input.idempotencyKey ?? null,
    input.correlationId ?? null
  );
  return rows[0]!.id;
}

/**
 * Revokes an assignment. Returns `false` when it was already terminal — a
 * retried revoke is success-with-no-change, never an error and never a second
 * audit entry, and a SUPERSEDED row is never rewritten into REVOKED.
 *
 * Requires the ADMIN principal.
 */
export async function revokeIncidentOperationalZoneAssignment(
  tx: RawSqlClient,
  input: RevokeIncidentOperationalZoneAssignmentInput
): Promise<boolean> {
  const rows = await tx.$queryRawUnsafe<{ revoked: boolean }>(
    `SELECT geo.fn_revoke_incident_operational_zone_assignment(
              $1::uuid, $2::varchar, $3::uuid, $4::uuid) AS revoked`,
    input.assignmentId,
    input.reasonCode,
    input.revokedBySubjectId ?? null,
    input.correlationId ?? null
  );
  return Boolean(rows[0]!.revoked);
}

/**
 * Replaces an assignment with a successor atomically, returning the successor's
 * id. The predecessor survives as SUPERSEDED, linked to its successor — the row
 * IS the history. A REVOKED assignment cannot be superseded back into life.
 *
 * Requires the ADMIN principal.
 */
export async function supersedeIncidentOperationalZoneAssignment(
  tx: RawSqlClient,
  input: SupersedeIncidentOperationalZoneAssignmentInput
): Promise<string> {
  const rows = await tx.$queryRawUnsafe<{ id: string }>(
    `SELECT geo.fn_supersede_incident_operational_zone_assignment(
              $1::uuid, $2::uuid,
              $3::geo.incident_zone_assignment_kind_enum,
              $4::geo.incident_zone_resolution_method_enum,
              $5::varchar, $6::uuid, $7::uuid,
              $8::evidence.confidence_level_enum,
              $9::geo.zone_assignment_review_status_enum,
              $10::timestamptz, $11::varchar, $12::uuid, $13::uuid) AS id`,
    input.assignmentId,
    input.operationalZoneId,
    input.assignmentKind,
    input.resolutionMethod,
    input.reasonCode,
    input.assignedBySubjectId ?? null,
    input.automationRuleId ?? null,
    input.confidence ?? "MEDIUM",
    input.reviewStatus ?? "REQUIRES_REVIEW",
    input.validUntil ?? null,
    input.provenance ?? "MANUAL",
    input.idempotencyKey ?? null,
    input.correlationId ?? null
  );
  return rows[0]!.id;
}

/**
 * Asks the spatial resolver what zones an incident's real geometry touches.
 * Returns PROPOSALS, never authority: the strongest kind it can propose is
 * AFFECTED, and `ck_ioza_spatial_never_command` rejects COMMAND for the method
 * these proposals are persisted under even if this call were changed.
 *
 * Handles Point, Polygon, MultiPolygon, absent geometry, invalid geometry,
 * incidents crossing several zones, overlapping zones, and zones with no
 * jurisdiction. Safe on the runtime principal.
 */
export async function resolveIncidentOperationalZones(
  tx: RawSqlClient,
  incidentId: string,
  minOverlapRatio = 0
): Promise<ZoneResolutionProposal[]> {
  const rows = await tx.$queryRawUnsafe<{
    operational_zone_id: string | null;
    outcome: SpatialResolutionOutcome;
    proposed_assignment_kind: ZoneResolutionProposal["proposedAssignmentKind"];
    confidence: ConfidenceLevel;
    overlap_ratio: string | number | null;
    covered: boolean | null;
    jurisdiction_resolvable: boolean;
  }>(
    `SELECT operational_zone_id, outcome, proposed_assignment_kind, confidence,
            overlap_ratio, covered, jurisdiction_resolvable
       FROM geo.fn_resolve_incident_operational_zones($1::uuid, $2::numeric)`,
    incidentId,
    minOverlapRatio
  );
  return rows.map((row) => ({
    operationalZoneId: row.operational_zone_id,
    outcome: row.outcome,
    proposedAssignmentKind: row.proposed_assignment_kind,
    confidence: row.confidence,
    overlapRatio: row.overlap_ratio === null ? null : Number(row.overlap_ratio),
    covered: row.covered,
    jurisdictionResolvable: row.jurisdiction_resolvable,
  }));
}

/**
 * Persists the resolver's proposals as AFFECTED/MONITORING rows in
 * REQUIRES_REVIEW. Structurally incapable of producing COMMAND. Idempotent:
 * the key is derived from (incident, zone, kind, method), so a re-run resolves
 * to the same rows. Returns how many proposals were written or already existed.
 *
 * Executable by `jobs_worker` / `ingest_worker` / `access_admin`.
 */
export async function persistIncidentZoneResolution(
  tx: RawSqlClient,
  incidentId: string,
  assignedBySubjectId?: string,
  correlationId?: string,
  minOverlapRatio = 0
): Promise<number> {
  const rows = await tx.$queryRawUnsafe<{ written: number }>(
    `SELECT geo.fn_persist_incident_zone_resolution($1::uuid, $2::uuid, $3::uuid, $4::numeric) AS written`,
    incidentId,
    assignedBySubjectId ?? null,
    correlationId ?? null,
    minOverlapRatio
  );
  return Number(rows[0]!.written);
}

/**
 * Carries a promoted candidate's geographic relations onto its new incident as
 * PRIMARY/AFFECTED/MONITORING. Can never create COMMAND. A candidate with no
 * resolvable zone writes nothing: the incident still exists, its jurisdiction
 * stays unresolved, and `fn_has_command_role` keeps failing closed rather than
 * a zone being invented to fill the gap.
 */
export async function inheritCandidateZoneAssignments(
  tx: RawSqlClient,
  incidentCandidateId: string,
  incidentId: string,
  assignedBySubjectId?: string,
  correlationId?: string,
  minOverlapRatio = 0
): Promise<number> {
  const rows = await tx.$queryRawUnsafe<{ written: number }>(
    `SELECT geo.fn_inherit_candidate_zone_assignments(
              $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::numeric) AS written`,
    incidentCandidateId,
    incidentId,
    assignedBySubjectId ?? null,
    correlationId ?? null,
    minOverlapRatio
  );
  return Number(rows[0]!.written);
}

/** Every currently-authorizing relation for an incident, optionally narrowed to one kind. Subject to the relation's RLS policy on a runtime principal. */
export async function listActiveIncidentOperationalZones(
  tx: RawSqlClient,
  incidentId: string,
  assignmentKind?: IncidentZoneAssignmentKind
): Promise<IncidentZoneAssignmentRow[]> {
  const rows = await tx.$queryRawUnsafe<{
    id: string;
    incident_id: string;
    operational_zone_id: string;
    assignment_kind: IncidentZoneAssignmentKind;
    resolution_method: IncidentZoneResolutionMethod;
    status: IncidentZoneAssignmentStatus;
    valid_from: Date;
    valid_until: Date | null;
    confidence: ConfidenceLevel;
    review_status: ZoneAssignmentReviewStatus;
    assigned_by_subject_id: string | null;
    automation_rule_id: string | null;
    correlation_id: string | null;
    provenance: string;
    superseded_by_assignment_id: string | null;
    revoked_at: Date | null;
    revocation_reason_code: string | null;
  }>(
    `SELECT id, incident_id, operational_zone_id, assignment_kind, resolution_method, status,
            valid_from, valid_until, confidence, review_status, assigned_by_subject_id,
            automation_rule_id, correlation_id, provenance, superseded_by_assignment_id,
            revoked_at, revocation_reason_code
       FROM geo.incident_operational_zone_assignments
      WHERE incident_id = $1::uuid
        AND status = 'ACTIVE'
        AND revoked_at IS NULL
        AND superseded_by_assignment_id IS NULL
        AND valid_from <= now()
        AND (valid_until IS NULL OR valid_until > now())
        AND ($2::text IS NULL OR assignment_kind::text = $2::text)
      ORDER BY assignment_kind, created_at`,
    incidentId,
    assignmentKind ?? null
  );
  return rows.map((row) => ({
    id: row.id,
    incidentId: row.incident_id,
    operationalZoneId: row.operational_zone_id,
    assignmentKind: row.assignment_kind,
    resolutionMethod: row.resolution_method,
    status: row.status,
    validFrom: new Date(row.valid_from),
    validUntil: row.valid_until ? new Date(row.valid_until) : null,
    confidence: row.confidence,
    reviewStatus: row.review_status,
    assignedBySubjectId: row.assigned_by_subject_id,
    automationRuleId: row.automation_rule_id,
    correlationId: row.correlation_id,
    provenance: row.provenance,
    supersededByAssignmentId: row.superseded_by_assignment_id,
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
    revocationReasonCode: row.revocation_reason_code,
  }));
}

/** The COMMAND zones of an incident. A thin projection over the same read, kept separate so a caller cannot accidentally widen it to PRIMARY/AFFECTED. */
export async function listIncidentCommandZones(
  tx: RawSqlClient,
  incidentId: string
): Promise<IncidentZoneAssignmentRow[]> {
  return listActiveIncidentOperationalZones(tx, incidentId, "COMMAND");
}

/** The incident's effective jurisdictions, resolved through the full chain with every temporal and lifecycle condition applied. */
export async function readIncidentEffectiveJurisdictions(
  tx: RawSqlClient,
  incidentId: string,
  assignmentKind?: IncidentZoneAssignmentKind
): Promise<EffectiveJurisdictionRow[]> {
  const rows = await tx.$queryRawUnsafe<{
    jurisdiction_id: string;
    operational_zone_id: string;
    assignment_kind: IncidentZoneAssignmentKind;
    assignment_id: string;
    declaring_organization_id: string | null;
  }>(
    `SELECT jurisdiction_id, operational_zone_id, assignment_kind, assignment_id, declaring_organization_id
       FROM geo.fn_incident_effective_jurisdictions(
              $1::uuid, $2::geo.incident_zone_assignment_kind_enum)`,
    incidentId,
    assignmentKind ?? null
  );
  return rows.map((row) => ({
    jurisdictionId: row.jurisdiction_id,
    operationalZoneId: row.operational_zone_id,
    assignmentKind: row.assignment_kind,
    assignmentId: row.assignment_id,
    declaringOrganizationId: row.declaring_organization_id,
  }));
}

/** The COMMAND projection of the above. Hard-wired to COMMAND with no fallback — the same guarantee the SQL function carries. */
export async function readIncidentCommandJurisdictions(
  tx: RawSqlClient,
  incidentId: string
): Promise<Omit<EffectiveJurisdictionRow, "assignmentKind">[]> {
  const rows = await tx.$queryRawUnsafe<{
    jurisdiction_id: string;
    operational_zone_id: string;
    assignment_id: string;
    declaring_organization_id: string | null;
  }>(
    `SELECT jurisdiction_id, operational_zone_id, assignment_id, declaring_organization_id
       FROM geo.fn_incident_command_jurisdictions($1::uuid)`,
    incidentId
  );
  return rows.map((row) => ({
    jurisdictionId: row.jurisdiction_id,
    operationalZoneId: row.operational_zone_id,
    assignmentId: row.assignment_id,
    declaringOrganizationId: row.declaring_organization_id,
  }));
}

/** The authorization predicate itself, asked as the session's own actor. Never trusts a role name, a GUC, or an unresolved jurisdiction id. */
export async function hasCommandRole(
  tx: RawSqlClient,
  actorId: string,
  incidentId: string
): Promise<boolean> {
  const rows = await tx.$queryRawUnsafe<{ allowed: boolean }>(
    `SELECT security.fn_has_command_role($1::uuid, $2::uuid) AS allowed`,
    actorId,
    incidentId
  );
  return Boolean(rows[0]!.allowed);
}

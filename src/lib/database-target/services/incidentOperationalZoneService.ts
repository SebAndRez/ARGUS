/**
 * src/lib/database-target/services/incidentOperationalZoneService.ts
 *
 * R31 — the six isolated target services for the persisted path
 *
 *   incident -> operational zone -> jurisdiction -> command scope
 *
 * NOT wired to any production endpoint, deliberately (mandate Fase 6): this
 * layer exists so the relation can be exercised end-to-end under real
 * principals before anything user-facing depends on it.
 *
 * What this layer DOES add over the repository:
 *   * principal selection — the COMMAND-capable operations run on the ADMIN
 *     client (`access_admin`) because only that role may execute the
 *     assignment functions; the read and resolve operations run on the
 *     RUNTIME client (`app_api`), which is what production would actually use;
 *   * session context — every call runs inside a transaction carrying the
 *     caller's `argus.*` context, because `fn_has_command_role` and
 *     `fn_classification_allowed` are session-bound and answer only about the
 *     actor the session itself declares;
 *   * caller-side preconditions for COMMAND, so a malformed request is
 *     refused here with a named error instead of reaching the database as a
 *     constraint violation. These are a courtesy, never the boundary: the SQL
 *     side re-checks every one of them, and is the only thing that can be
 *     relied upon.
 *
 * The owner credential is NEVER used here. Neither is a superuser, and no
 * path in this file can produce a COMMAND assignment from geometry.
 */

import {
  getTargetAdminPrismaClient,
  getTargetRuntimePrismaClient,
  type TargetPrismaClientLike,
} from "../client/targetPrismaClient";
import {
  applyTargetSessionContext,
  type TargetSessionContext,
} from "../session/targetSessionContext";
import type { RawSqlClient } from "../repositories/incidentPromotionRepository";
import {
  assignIncidentOperationalZone as assignRepo,
  inheritCandidateZoneAssignments as inheritRepo,
  listActiveIncidentOperationalZones as listActiveRepo,
  listIncidentCommandZones as listCommandRepo,
  persistIncidentZoneResolution as persistRepo,
  readIncidentCommandJurisdictions as readCommandJurisdictionsRepo,
  readIncidentEffectiveJurisdictions as readEffectiveJurisdictionsRepo,
  resolveIncidentOperationalZones as resolveRepo,
  revokeIncidentOperationalZoneAssignment as revokeRepo,
  supersedeIncidentOperationalZoneAssignment as supersedeRepo,
  type AssignIncidentOperationalZoneInput,
  type EffectiveJurisdictionRow,
  type IncidentZoneAssignmentRow,
  type RevokeIncidentOperationalZoneAssignmentInput,
  type SupersedeIncidentOperationalZoneAssignmentInput,
  type ZoneResolutionProposal,
} from "../repositories/incidentOperationalZoneRepository";

export class IncidentOperationalZoneServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IncidentOperationalZoneServiceError";
  }
}

const REASON_CODE_RE = /^[A-Z][A-Z0-9_]{2,49}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface TransactionalClient {
  $transaction: <T>(fn: (tx: RawSqlClient) => Promise<T>) => Promise<T>;
}

async function withSession<T>(
  client: TargetPrismaClientLike,
  ctx: TargetSessionContext,
  fn: (tx: RawSqlClient) => Promise<T>
): Promise<T> {
  return (client as unknown as TransactionalClient).$transaction(async (tx) => {
    await applyTargetSessionContext(tx, ctx);
    return fn(tx);
  });
}

/**
 * The preconditions the mandate requires a COMMAND assignment to satisfy, as
 * far as they are checkable without a database round trip. The remaining ones
 * — the subject really being ACTIVE with an authorizing grant and a current
 * institutional membership, the automation rule really being approved AND
 * expressly command-authorized, the zone's jurisdiction really being
 * resolvable — are enforced inside
 * `geo.fn_assign_incident_operational_zone`, where they cannot be bypassed
 * by a caller that skips this file.
 */
function assertCommandPreconditions(input: {
  assignmentKind: string;
  resolutionMethod: string;
  assignedBySubjectId?: string;
  automationRuleId?: string;
  reasonCode?: string;
  correlationId?: string;
}): void {
  if (input.assignmentKind !== "COMMAND") return;

  if (input.resolutionMethod === "SPATIAL_INTERSECTION" || input.resolutionMethod === "INHERITED_FROM_CANDIDATE") {
    throw new IncidentOperationalZoneServiceError(
      `INCIDENT_ZONE_COMMAND_METHOD_FORBIDDEN: ${input.resolutionMethod} can never produce a COMMAND assignment. ` +
        `A geographic intersection is evidence of reach, not of authority.`
    );
  }
  const hasSubject = Boolean(input.assignedBySubjectId);
  const hasRule = Boolean(input.automationRuleId);
  if (hasSubject === hasRule) {
    throw new IncidentOperationalZoneServiceError(
      "INCIDENT_ZONE_COMMAND_AUTHORITY_REQUIRED: exactly one of assignedBySubjectId / automationRuleId must be named. " +
        "Neither is anonymous command; both at once makes \"who granted this\" unanswerable."
    );
  }
  if (!input.reasonCode || !REASON_CODE_RE.test(input.reasonCode)) {
    throw new IncidentOperationalZoneServiceError(
      "INCIDENT_ZONE_COMMAND_REASON_REQUIRED: a COMMAND assignment must carry a controlled reason code matching ^[A-Z][A-Z0-9_]{2,49}$."
    );
  }
  if (!input.correlationId || !UUID_RE.test(input.correlationId)) {
    throw new IncidentOperationalZoneServiceError(
      "INCIDENT_ZONE_COMMAND_CORRELATION_REQUIRED: a COMMAND assignment must carry a correlation id — it is what ties the row to its audit record."
    );
  }
}

/**
 * Creates an incident/zone assignment.
 *
 * Runs on the ADMIN principal because `geo.fn_assign_incident_operational_zone`
 * is executable only by `access_admin`. That is the whole point: the
 * connection that CONSUMES command scope (app_api) must not be able to mint
 * it, and the migration owner must never be a runtime.
 */
export async function assignIncidentOperationalZone(
  ctx: TargetSessionContext,
  input: AssignIncidentOperationalZoneInput
): Promise<string> {
  assertCommandPreconditions(input);
  const admin = await getTargetAdminPrismaClient();
  return withSession(admin, ctx, (tx) => assignRepo(tx, input));
}

/** Revokes an assignment. Returns false when it was already terminal — a retried revoke is not a second history entry. */
export async function revokeIncidentOperationalZoneAssignment(
  ctx: TargetSessionContext,
  input: RevokeIncidentOperationalZoneAssignmentInput
): Promise<boolean> {
  if (!REASON_CODE_RE.test(input.reasonCode)) {
    throw new IncidentOperationalZoneServiceError(
      "INCIDENT_ZONE_REVOCATION_REASON_INVALID: a controlled reason code matching ^[A-Z][A-Z0-9_]{2,49}$ is required."
    );
  }
  const admin = await getTargetAdminPrismaClient();
  return withSession(admin, ctx, (tx) => revokeRepo(tx, input));
}

/** Replaces an assignment with a successor atomically. The predecessor survives as SUPERSEDED, linked to its successor. */
export async function supersedeIncidentOperationalZoneAssignment(
  ctx: TargetSessionContext,
  input: SupersedeIncidentOperationalZoneAssignmentInput
): Promise<string> {
  assertCommandPreconditions(input);
  if (!REASON_CODE_RE.test(input.reasonCode)) {
    throw new IncidentOperationalZoneServiceError(
      "INCIDENT_ZONE_SUPERSESSION_REASON_INVALID: a controlled reason code matching ^[A-Z][A-Z0-9_]{2,49}$ is required."
    );
  }
  const admin = await getTargetAdminPrismaClient();
  return withSession(admin, ctx, (tx) => supersedeRepo(tx, input));
}

/**
 * Asks what zones an incident's geometry touches. Runs on the RUNTIME
 * principal: proposing is a read, and the result is advisory.
 */
export async function resolveIncidentOperationalZones(
  ctx: TargetSessionContext,
  incidentId: string,
  minOverlapRatio = 0
): Promise<ZoneResolutionProposal[]> {
  const runtime = await getTargetRuntimePrismaClient();
  return withSession(runtime, ctx, (tx) => resolveRepo(tx, incidentId, minOverlapRatio));
}

/**
 * Persists the resolver's proposals. AFFECTED/MONITORING only, in
 * REQUIRES_REVIEW — a machine proposal is never self-approving, and this path
 * is structurally incapable of writing COMMAND.
 *
 * Runs on the ADMIN principal here because the test/dev harness has no
 * jobs_worker login; in production this is the jobs_worker/ingest_worker path
 * (both hold EXECUTE on the function, neither holds any write grant on the
 * table itself).
 */
export async function persistIncidentZoneResolution(
  ctx: TargetSessionContext,
  incidentId: string,
  assignedBySubjectId?: string,
  minOverlapRatio = 0
): Promise<number> {
  const admin = await getTargetAdminPrismaClient();
  return withSession(admin, ctx, (tx) =>
    persistRepo(tx, incidentId, assignedBySubjectId, ctx.correlationId, minOverlapRatio)
  );
}

/**
 * Carries a promoted candidate's geographic relations onto its new incident.
 * PRIMARY/AFFECTED/MONITORING only — never COMMAND. Writes nothing when the
 * candidate has no resolvable zone, leaving the incident's jurisdiction
 * unresolved and `fn_has_command_role` failing closed, rather than inventing
 * a zone to fill the gap.
 */
export async function inheritCandidateZoneAssignments(
  ctx: TargetSessionContext,
  incidentCandidateId: string,
  incidentId: string,
  assignedBySubjectId?: string,
  minOverlapRatio = 0
): Promise<number> {
  const admin = await getTargetAdminPrismaClient();
  return withSession(admin, ctx, (tx) =>
    inheritRepo(tx, incidentCandidateId, incidentId, assignedBySubjectId, ctx.correlationId, minOverlapRatio)
  );
}

/** Every currently-authorizing relation for an incident. Runtime principal, so the relation's RLS policy applies. */
export async function listActiveIncidentOperationalZones(
  ctx: TargetSessionContext,
  incidentId: string,
  assignmentKind?: IncidentZoneAssignmentRow["assignmentKind"]
): Promise<IncidentZoneAssignmentRow[]> {
  const runtime = await getTargetRuntimePrismaClient();
  return withSession(runtime, ctx, (tx) => listActiveRepo(tx, incidentId, assignmentKind));
}

/** The COMMAND zones of an incident, and nothing else. */
export async function listIncidentCommandZones(
  ctx: TargetSessionContext,
  incidentId: string
): Promise<IncidentZoneAssignmentRow[]> {
  const runtime = await getTargetRuntimePrismaClient();
  return withSession(runtime, ctx, (tx) => listCommandRepo(tx, incidentId));
}

/** The incident's effective jurisdictions through the full chain. */
export async function listIncidentEffectiveJurisdictions(
  ctx: TargetSessionContext,
  incidentId: string,
  assignmentKind?: IncidentZoneAssignmentRow["assignmentKind"]
): Promise<EffectiveJurisdictionRow[]> {
  const runtime = await getTargetRuntimePrismaClient();
  return withSession(runtime, ctx, (tx) => readEffectiveJurisdictionsRepo(tx, incidentId, assignmentKind));
}

/** The COMMAND projection. No PRIMARY/AFFECTED/MONITORING fallback exists at any layer. */
export async function listIncidentCommandJurisdictions(
  ctx: TargetSessionContext,
  incidentId: string
): Promise<Omit<EffectiveJurisdictionRow, "assignmentKind">[]> {
  const runtime = await getTargetRuntimePrismaClient();
  return withSession(runtime, ctx, (tx) => readCommandJurisdictionsRepo(tx, incidentId));
}

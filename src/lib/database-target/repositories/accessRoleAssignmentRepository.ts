/**
 * src/lib/database-target/repositories/accessRoleAssignmentRepository.ts
 *
 * Isolated target repository for the AccessSubject / AccessRoleAssignment
 * lifecycle. Development/tests only, never imported by production runtime code,
 * and NOT wired to any endpoint.
 *
 * Contains NO authorization logic and NO SQL of its own beyond calling the four
 * canonical SECURITY DEFINER functions created in
 * `prisma/target-migrations/020_identity/migration.sql`. That is deliberate:
 * validation, the audit write, idempotency and the transactional coupling all
 * live in one place, in the database, where they cannot be bypassed by a
 * different caller. A second implementation here could drift from the one the
 * database actually enforces.
 *
 * The grant/revoke functions are executable ONLY by `access_admin`, so these
 * helpers must be given an admin-principal client
 * (`getTargetAdminPrismaClient()`). Handing them the runtime (app_api) client
 * fails with insufficient_privilege — by design, and asserted by
 * `access-role-rls.test.ts`.
 */

import type { RawSqlClient } from "./incidentPromotionRepository";
import type { TargetAccessPurpose } from "../session/targetSessionContext";

/** Mirrors `security.actor_type_enum` minus ANONYMOUS, which can never be a persisted authorizable subject. */
export type AccessSubjectType = "PERSON" | "ORGANIZATION" | "SYSTEM" | "AUTOMATION_RULE";

export type AccessRoleAssignmentStatus = "ACTIVE" | "SUSPENDED" | "REVOKED";

export interface RegisterAccessSubjectInput {
  subjectType: AccessSubjectType;
  personId?: string;
  organizationId?: string;
  automationRuleId?: string;
  /** Controlled machine-identity key (`^[A-Z][A-Z0-9_]{2,99}$`). The target schema has no table for machine identities, and inventing one is out of scope. */
  systemKey?: string;
}

export interface GrantAccessRoleInput {
  accessSubjectId: string;
  /** The `security.access_roles.code` to grant. A code, never a free-text role name — the SQL side resolves it to the latest ACTIVE version. */
  accessRoleCode: string;
  institutionId?: string;
  purpose?: TargetAccessPurpose;
  validFrom?: Date;
  validUntil?: Date;
  grantedBySubjectId?: string;
  source?: string;
  /** Reuse the same key to retry safely: the same assignment row is returned instead of a second, silently overlapping grant. */
  idempotencyKey?: string;
}

export interface RevokeAccessRoleInput {
  assignmentId: string;
  /** Controlled code (`^[A-Z][A-Z0-9_]{2,49}$`). Free text is rejected by the SQL side. */
  revocationReasonCode: string;
  revokedBySubjectId?: string;
}

export interface ActiveAccessRoleRow {
  accessRoleId: string;
  code: string;
  classificationCeiling: "PUBLIC" | "OPERATIONAL" | "SENSITIVE" | "RESTRICTED" | "CRITICAL";
}

export interface AccessRoleAssignmentRow {
  id: string;
  accessSubjectId: string;
  accessRoleId: string;
  accessRoleCode: string;
  institutionId: string | null;
  purpose: TargetAccessPurpose;
  status: AccessRoleAssignmentStatus;
  validFrom: Date;
  validUntil: Date | null;
  revokedAt: Date | null;
  revocationReasonCode: string | null;
}

/**
 * Registers (or returns the existing) canonical authorization identity.
 * Idempotent by identity: there is at most one ACTIVE subject per real
 * identity, enforced by partial unique indexes as well as by this call.
 */
export async function registerAccessSubject(tx: RawSqlClient, input: RegisterAccessSubjectInput): Promise<string> {
  const rows = await tx.$queryRawUnsafe<{ id: string }>(
    `SELECT security.fn_register_access_subject(
              $1::security.actor_type_enum, $2::uuid, $3::uuid, $4::uuid, $5::varchar) AS id`,
    input.subjectType,
    input.personId ?? null,
    input.organizationId ?? null,
    input.automationRuleId ?? null,
    input.systemKey ?? null
  );
  return rows[0]!.id;
}

/**
 * Grants an access role. The SQL function validates the subject is ACTIVE, the
 * role exists and is ACTIVE, and the validity window is coherent; it writes the
 * assignment AND its `security.audit_logs` row in the SAME transaction, through
 * the canonical partition lifecycle — so an authorization change without an
 * audit trail is not a state this code can produce.
 */
export async function grantAccessRole(tx: RawSqlClient, input: GrantAccessRoleInput): Promise<string> {
  const rows = await tx.$queryRawUnsafe<{ id: string }>(
    `SELECT security.fn_grant_access_role(
              $1::uuid, $2::varchar, $3::uuid, $4::security.access_purpose_enum,
              $5::timestamptz, $6::timestamptz, $7::uuid, $8::varchar, $9::uuid) AS id`,
    input.accessSubjectId,
    input.accessRoleCode,
    input.institutionId ?? null,
    input.purpose ?? "GENERAL",
    input.validFrom ?? new Date(),
    input.validUntil ?? null,
    input.grantedBySubjectId ?? null,
    input.source ?? "MANUAL_GRANT",
    input.idempotencyKey ?? null
  );
  return rows[0]!.id;
}

/** Revokes an assignment. Returns `false` when it was already revoked — a retried revoke is success-with-no-change, never an error and never a second audit entry. */
export async function revokeAccessRole(tx: RawSqlClient, input: RevokeAccessRoleInput): Promise<boolean> {
  const rows = await tx.$queryRawUnsafe<{ revoked: boolean }>(
    `SELECT security.fn_revoke_access_role($1::uuid, $2::varchar, $3::uuid) AS revoked`,
    input.assignmentId,
    input.revocationReasonCode,
    input.revokedBySubjectId ?? null
  );
  return Boolean(rows[0]!.revoked);
}

/**
 * The roles currently authorizing for an actor IN THE CURRENT SESSION CONTEXT.
 * This is the only read path the runtime has into authorization, and it is
 * session-bound: it answers only about the actor the session itself declares
 * (see `fn_active_access_roles`), so it cannot be used to enumerate somebody
 * else's clearance.
 */
export async function readActiveAccessRoles(tx: RawSqlClient, actorId: string): Promise<ActiveAccessRoleRow[]> {
  const rows = await tx.$queryRawUnsafe<{
    access_role_id: string;
    code: string;
    classification_ceiling: ActiveAccessRoleRow["classificationCeiling"];
  }>(
    `SELECT access_role_id, code, classification_ceiling
       FROM security.fn_active_access_roles($1::uuid)
      ORDER BY code`,
    actorId
  );
  return rows.map((row) => ({
    accessRoleId: row.access_role_id,
    code: row.code,
    classificationCeiling: row.classification_ceiling,
  }));
}

/** Reads assignment rows for one subject. Requires a principal the RLS policy admits (ADMIN/AUDIT/SECURITY, or the subject itself). */
export async function readAssignmentsForSubject(
  tx: RawSqlClient,
  accessSubjectId: string
): Promise<AccessRoleAssignmentRow[]> {
  const rows = await tx.$queryRawUnsafe<{
    id: string;
    access_subject_id: string;
    access_role_id: string;
    access_role_code: string;
    institution_id: string | null;
    purpose: TargetAccessPurpose;
    status: AccessRoleAssignmentStatus;
    valid_from: Date;
    valid_until: Date | null;
    revoked_at: Date | null;
    revocation_reason_code: string | null;
  }>(
    `SELECT a.id, a.access_subject_id, a.access_role_id, r.code::text AS access_role_code,
            a.institution_id, a.purpose, a.status, a.valid_from, a.valid_until,
            a.revoked_at, a.revocation_reason_code
       FROM security.access_role_assignments a
       JOIN security.access_roles r ON r.id = a.access_role_id
      WHERE a.access_subject_id = $1::uuid
      ORDER BY a.granted_at`,
    accessSubjectId
  );
  return rows.map((row) => ({
    id: row.id,
    accessSubjectId: row.access_subject_id,
    accessRoleId: row.access_role_id,
    accessRoleCode: row.access_role_code,
    institutionId: row.institution_id,
    purpose: row.purpose,
    status: row.status,
    validFrom: new Date(row.valid_from),
    validUntil: row.valid_until ? new Date(row.valid_until) : null,
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
    revocationReasonCode: row.revocation_reason_code,
  }));
}

/** Convenience predicate over the same session-bound resolution the RLS policies use. */
export async function isClassificationAllowed(
  tx: RawSqlClient,
  actorId: string,
  classification: ActiveAccessRoleRow["classificationCeiling"]
): Promise<boolean> {
  const rows = await tx.$queryRawUnsafe<{ allowed: boolean }>(
    `SELECT security.fn_classification_allowed($1::uuid, $2::security.information_classification_enum) AS allowed`,
    actorId,
    classification
  );
  return Boolean(rows[0]!.allowed);
}

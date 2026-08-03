/**
 * src/lib/database-target/session/targetSessionContext.ts
 *
 * Transport for the request context the target RLS policies read. Development/
 * tests only, same isolation rules as the rest of `src/lib/database-target/`.
 *
 * WHAT CHANGED, AND WHY IT MATTERS
 * `argus.*` GUCs used to be the AUTHORITY: `security.fn_classification_allowed`
 * read `argus.actor_role` and believed it, so any principal that could run
 * `SET argus.actor_role = 'ADMIN'` had CRITICAL clearance. They are now purely
 * a LOOKUP KEY: every value set here must be matched by a persisted row in
 * `security.access_subjects` / `security.access_role_assignments` before it
 * authorizes anything.
 *
 * `actorRole` is therefore deliberately ABSENT from this API. There is no
 * parameter for it, so no caller can set it, so no caller can be tempted to
 * treat it as a claim again. The SQL side does not read it either.
 *
 * All four values are applied with `set_config(..., is_local => true)`, so they
 * are scoped to the enclosing transaction and cannot leak into the next request
 * on a pooled connection.
 */

import type { RawSqlClient } from "../repositories/incidentPromotionRepository";

/** The closed purpose vocabulary of `security.access_purpose_enum`. A free-text purpose is unverifiable, so there is none. */
export type TargetAccessPurpose =
  | "GENERAL"
  | "OPERATIONAL_RESPONSE"
  | "AUDIT_REVIEW"
  | "SECURITY_REVIEW"
  | "ADMINISTRATION"
  | "EMERGENCY_ASSISTANCE";

export interface TargetSessionContext {
  /** The acting actor's id — a person/organization/automation-rule id, matched against access_subjects. */
  actorId: string;
  /** Optional shortcut to the resolved subject. Validated, never trusted: the SQL side still requires it to belong to `actorId`. */
  accessSubjectId?: string;
  /** The institution the actor is acting inside. Required for institution-scoped assignments to authorize. */
  institutionId?: string;
  /** Required for any assignment whose purpose is not GENERAL. */
  purpose?: TargetAccessPurpose;
  /** Required for any assignment whose purpose is EMERGENCY_ASSISTANCE. Must name an ACTIVE governance.emergency_bases row. */
  emergencyBasisId?: string;
  /** Technical correlation id. Never used for authorization — it exists only to tie logs and audit rows together. */
  correlationId?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_PURPOSES = new Set<TargetAccessPurpose>([
  "GENERAL",
  "OPERATIONAL_RESPONSE",
  "AUDIT_REVIEW",
  "SECURITY_REVIEW",
  "ADMINISTRATION",
  "EMERGENCY_ASSISTANCE",
]);

export class TargetSessionContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TargetSessionContextError";
  }
}

function assertUuid(value: string, field: string): void {
  if (!UUID_RE.test(value)) {
    throw new TargetSessionContextError(
      `TARGET_SESSION_CONTEXT_INVALID: ${field} must be a uuid. Malformed context is rejected here rather than ` +
        `passed to the database, where it would be silently treated as "no authorization".`
    );
  }
}

/**
 * Validates the shape of the context and applies it to the current
 * transaction. Format validation is a caller-side courtesy, not a security
 * boundary — the SQL functions fail closed on anything malformed regardless,
 * which is why a bad value can never widen access even if this function were
 * bypassed entirely.
 */
export async function applyTargetSessionContext(tx: RawSqlClient, ctx: TargetSessionContext): Promise<void> {
  assertUuid(ctx.actorId, "actorId");
  if (ctx.accessSubjectId !== undefined) assertUuid(ctx.accessSubjectId, "accessSubjectId");
  if (ctx.institutionId !== undefined) assertUuid(ctx.institutionId, "institutionId");
  if (ctx.emergencyBasisId !== undefined) assertUuid(ctx.emergencyBasisId, "emergencyBasisId");
  if (ctx.purpose !== undefined && !ALLOWED_PURPOSES.has(ctx.purpose)) {
    throw new TargetSessionContextError(
      `TARGET_SESSION_CONTEXT_INVALID: purpose "${ctx.purpose}" is not in security.access_purpose_enum.`
    );
  }

  // One statement, all values bound as parameters — no identifier or value is
  // ever interpolated into SQL text.
  await tx.$queryRawUnsafe(
    `SELECT set_config('argus.actor_id', $1, true),
            set_config('argus.access_subject_id', $2, true),
            set_config('argus.institution_id', $3, true),
            set_config('argus.purpose', $4, true),
            set_config('argus.emergency_basis_id', $5, true),
            set_config('argus.correlation_id', $6, true)`,
    ctx.actorId,
    ctx.accessSubjectId ?? "",
    ctx.institutionId ?? "",
    ctx.purpose ?? "",
    ctx.emergencyBasisId ?? "",
    ctx.correlationId ?? ""
  );
}

/** Clears every context value for the current transaction — used between cases in tests and between requests on a reused connection. */
export async function clearTargetSessionContext(tx: RawSqlClient): Promise<void> {
  await tx.$queryRawUnsafe(
    `SELECT set_config('argus.actor_id', '', true),
            set_config('argus.access_subject_id', '', true),
            set_config('argus.institution_id', '', true),
            set_config('argus.purpose', '', true),
            set_config('argus.emergency_basis_id', '', true),
            set_config('argus.correlation_id', '', true)`
  );
}

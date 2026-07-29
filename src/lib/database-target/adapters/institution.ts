/**
 * src/lib/database-target/adapters/institution.ts
 *
 * Functional compatibility adapter for BC 2 (Instituciones), target
 * `institution.organizations`. Per D-01 (frozen decision register),
 * `institution.*` is `CREATE_EMPTY` — there is NO current model to migrate
 * from. This adapter therefore has no "current -> target" backfill path at
 * all; it only ever accepts an explicit, administrator-authored creation
 * request. Its `shadowWrite` always returns `MIGRATION_BLOCKED` while no
 * such explicit request exists, and `NOT_ENABLED` while the flag is off —
 * it must never synthesize an organization to absorb `UNASSIGNED` people.
 */

import type { Organization } from "../institution";
import {
  type AdapterOutcome,
  type AdapterWriteContext,
  migrationBlocked,
  notEnabled,
} from "./types";

/** 1. "Current-read" interface — deliberately absent. `institution.*` has no legacy source (D-01); see class doc comment. */
export type LegacyInstitutionSource = never;

/** 2. Target-read interface — reuses `institution.ts`'s `Organization`. */
export type InstitutionTarget = Organization;

/** An explicit, human-authored request to create an Organization — the only legitimate input to this domain (never derived from `User`/legacy data). */
export interface OrganizationCreationRequest {
  legalName: string;
  registrationIdentifier: string | null;
  hasFormalAuthority: boolean;
  requestedByActorId: string;
}

/** 3. "current -> target" transform — N/A (no legacy source). This is the forward-only creation-request transform instead. */
export function organizationRequestToTarget(
  request: OrganizationCreationRequest,
  newId: string,
  now: Date = new Date()
): InstitutionTarget {
  return {
    id: newId,
    legalName: request.legalName,
    registrationIdentifier: request.registrationIdentifier,
    hasFormalAuthority: request.hasFormalAuthority,
    status: "ACTIVE",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    deletedAt: null,
  };
}

/** 4. target -> legacy-payload transform — N/A; no legacy consumer shape exists for a concept the current app has never modeled. Documented as a stable no-op rather than silently omitted. */
export function institutionTargetToLegacyPayload(target: InstitutionTarget): null {
  void target;
  return null;
}

/** 5-9. Shadow write — always blocked/not-enabled; never fabricates an Organization from legacy data. */
export function shadowWriteInstitution(
  request: OrganizationCreationRequest | undefined,
  ctx: AdapterWriteContext
): AdapterOutcome<InstitutionTarget> {
  if (!ctx.shadowWriteEnabled) {
    return notEnabled("targetDatabaseShadowWrite is disabled — institution shadow write not attempted");
  }
  if (!request) {
    return migrationBlocked(
      "institution.organizations is CREATE_EMPTY per D-01 — no legacy source to backfill; " +
        "requires an explicit OrganizationCreationRequest, never an inferred one"
    );
  }
  return migrationBlocked(
    "institution shadow write is scaffolded but not yet connected to a real ID generator/persistence call"
  );
}

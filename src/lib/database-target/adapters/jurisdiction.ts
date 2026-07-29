/**
 * src/lib/database-target/adapters/jurisdiction.ts
 *
 * Functional compatibility adapter for `governance.jurisdictions`. No
 * current model represents a jurisdiction today — this is a governance
 * primitive introduced by the target model (Ola 0/1). Like institution.ts,
 * this adapter has no legacy backfill path; it only accepts an explicit
 * declaration request, and requires an already-existing
 * `geo.administrative_areas` row (D-07 — geometry population is a separate,
 * currently-blocked concern; see `ARGUS_MIGRATION_DECISION_REGISTER_v1.0_FROZEN.md`).
 */

import type { Jurisdiction } from "../jurisdiction";
import {
  type AdapterOutcome,
  type AdapterWriteContext,
  migrationBlocked,
  notEnabled,
} from "./types";

/** 1. "Current-read" interface — deliberately absent; no legacy jurisdiction concept exists. */
export type LegacyJurisdictionSource = never;

/** 2. Target-read interface — reuses `jurisdiction.ts`'s `Jurisdiction`. */
export type JurisdictionTarget = Jurisdiction;

/** An explicit declaration request — the only legitimate input to this domain. */
export interface JurisdictionDeclarationRequest {
  name: string;
  primaryAdministrativeAreaId: string;
  declaringOrganizationId: string | null;
  legalBasis: string | null;
}

/** 3. "current -> target" transform — N/A; forward-declaration transform instead. */
export function jurisdictionRequestToTarget(
  request: JurisdictionDeclarationRequest,
  newId: string,
  now: Date = new Date()
): JurisdictionTarget {
  return {
    id: newId,
    name: request.name,
    primaryAdministrativeAreaId: request.primaryAdministrativeAreaId,
    declaringOrganizationId: request.declaringOrganizationId,
    legalBasis: request.legalBasis,
    approvedByActorType: null,
    approvedByActorId: null,
    version: 1,
    effectiveFrom: now.toISOString(),
    effectiveTo: null,
  };
}

/** 4. target -> legacy-payload transform — N/A; no legacy consumer shape exists. */
export function jurisdictionTargetToLegacyPayload(target: JurisdictionTarget): null {
  void target;
  return null;
}

/** 5-9. Shadow write — always blocked/not-enabled; D-07's geometry dependency (`geo.administrative_areas`) is out of scope for this adapter. */
export function shadowWriteJurisdiction(
  request: JurisdictionDeclarationRequest | undefined,
  ctx: AdapterWriteContext
): AdapterOutcome<JurisdictionTarget> {
  if (!ctx.shadowWriteEnabled) {
    return notEnabled("targetDatabaseShadowWrite is disabled — jurisdiction shadow write not attempted");
  }
  if (!request) {
    return migrationBlocked(
      "governance.jurisdictions has no legacy source — requires an explicit JurisdictionDeclarationRequest"
    );
  }
  if (!request.primaryAdministrativeAreaId) {
    return migrationBlocked(
      "primaryAdministrativeAreaId is required and depends on geo.administrative_areas population (D-07, currently blocked)"
    );
  }
  return migrationBlocked(
    "jurisdiction shadow write is scaffolded but not yet connected to a real ID generator/persistence call"
  );
}

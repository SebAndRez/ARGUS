/**
 * src/lib/database-target/adapters/ice.ts
 *
 * Functional compatibility adapter for BC 14 (Salud y Datos de Emergencia /
 * ICE), target `ice.emergency_profiles`. Per D-08 (frozen decision
 * register), NO current Prisma model has any concept of medical consent or
 * emergency access — this entire schema is `CREATE_EMPTY`. This adapter
 * only ever creates a profile from an explicit person-linked request,
 * never derives one from `User`/any legacy row.
 */

import type { EmergencyProfile } from "../ice";
import {
  type AdapterOutcome,
  type AdapterWriteContext,
  migrationBlocked,
  notEnabled,
} from "./types";

/** 1. "Current-read" interface — deliberately absent; `ice.*` has no legacy source (D-08). */
export type LegacyIceSource = never;

/** 2. Target-read interface — reuses `ice.ts`'s `EmergencyProfile`. */
export type IceTarget = EmergencyProfile;

/** An explicit creation request — the only legitimate input to this domain. Requires an already-migrated `identity.people` row. */
export interface EmergencyProfileCreationRequest {
  personId: string;
}

/** 3. "current -> target" transform — N/A (no legacy source); forward-only creation transform instead. Deliberately UUIDv4 (not UUIDv7, P2-09) — `newId` must be supplied by a UUIDv4 generator, never this module's concern to generate. */
export function emergencyProfileRequestToTarget(
  request: EmergencyProfileCreationRequest,
  newId: string,
  now: Date = new Date()
): IceTarget {
  return {
    id: newId,
    personId: request.personId,
    classification: "CRITICAL",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    deletedAt: null,
  };
}

/** 4. target -> legacy-payload transform — N/A; no legacy consumer shape exists for a concept the current app has never modeled. */
export function iceTargetToLegacyPayload(target: IceTarget): null {
  void target;
  return null;
}

/** 5-9. Shadow write — always blocked/not-enabled; every access must additionally go through a `SECURITY DEFINER` function per D-08, never direct application-role writes even once enabled. */
export function shadowWriteIce(
  request: EmergencyProfileCreationRequest | undefined,
  ctx: AdapterWriteContext
): AdapterOutcome<IceTarget> {
  if (!ctx.shadowWriteEnabled) {
    return notEnabled("targetDatabaseShadowWrite is disabled — ICE shadow write not attempted");
  }
  if (!request) {
    return migrationBlocked("ice.emergency_profiles has no legacy source — requires an explicit EmergencyProfileCreationRequest");
  }
  if (!request.personId) {
    return migrationBlocked("personId is required — ice.emergency_profiles.person_id is NOT NULL UNIQUE");
  }
  return migrationBlocked(
    "ICE shadow write is scaffolded but not yet connected to a real ID generator/persistence call, " +
      "and must route through a SECURITY DEFINER function even once implemented (D-08)"
  );
}

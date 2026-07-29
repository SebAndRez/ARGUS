/**
 * src/lib/database-target/adapters/mission.ts
 *
 * Functional compatibility adapter for BC 10 (Despacho Operacional), target
 * `mission.missions`. Completely new domain (Ola 5, CREATE_EMPTY across all
 * 10 `mission.*` tables) — `src/modules/fenix/*` plans dispatch today
 * without persisting it. No legacy backfill path exists; this adapter only
 * accepts an explicit creation request tied to a (future)
 * `help.operational_needs` row.
 */

import type { Mission, MissionObjective } from "../mission";
import {
  type AdapterOutcome,
  type AdapterWriteContext,
  migrationBlocked,
  notEnabled,
} from "./types";

/** 1. "Current-read" interface — deliberately absent; `mission.*` has no legacy source. */
export type LegacyMissionSource = never;

/** 2. Target-read interface — reuses `mission.ts`'s `Mission`. */
export type MissionTarget = Mission;

/** An explicit creation request — the only legitimate input to this domain. */
export interface MissionCreationRequest {
  operationalNeedId: string;
  objective: MissionObjective;
}

/** 3. "current -> target" transform — N/A (no legacy source); forward-only creation transform instead. */
export function missionRequestToTarget(
  request: MissionCreationRequest,
  newId: string,
  now: Date = new Date()
): MissionTarget {
  return {
    id: newId,
    operationalNeedId: request.operationalNeedId,
    status: "CREATED",
    classification: "CRITICAL",
    objective: request.objective,
    objectiveSchemaVersion: 1,
    createdAt: now.toISOString(),
    closedAt: null,
  };
}

/** 4. target -> legacy-payload transform — N/A; `src/modules/fenix/*` has no persisted legacy shape to project back to. */
export function missionTargetToLegacyPayload(target: MissionTarget): null {
  void target;
  return null;
}

/** 5-9. Shadow write — always blocked/not-enabled; requires `help.operational_needs` to exist first (Ola 5 dependency), which this adapter never assumes. */
export function shadowWriteMission(
  request: MissionCreationRequest | undefined,
  ctx: AdapterWriteContext
): AdapterOutcome<MissionTarget> {
  if (!ctx.shadowWriteEnabled) {
    return notEnabled("targetDatabaseShadowWrite is disabled — mission shadow write not attempted");
  }
  if (!request) {
    return migrationBlocked("mission.missions has no legacy source — requires an explicit MissionCreationRequest");
  }
  if (!request.operationalNeedId) {
    return migrationBlocked("operationalNeedId is required — mission.missions.operational_need_id is NOT NULL");
  }
  return migrationBlocked(
    "mission shadow write is scaffolded but not yet connected to a real ID generator/persistence call"
  );
}

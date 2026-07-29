/**
 * src/lib/database-target/adapters/help.ts
 *
 * Functional compatibility adapter for BC 9 (Ayuda), current `HelpRequest`
 * (0 real rows) -> target `help.help_requests` (Ola 5, T-05). Low data
 * risk given 0 rows, but the end-to-end SOS flow is high product risk
 * (RISK-P0 class) — this adapter validates *structure*, not historical
 * data.
 */

import type { HelpRequest, HelpRequestStatus } from "../help";
import {
  type AdapterOutcome,
  type AdapterWriteContext,
  migrationBlocked,
  notEnabled,
} from "./types";

/** 1. Current-read interface — the exact subset of `HelpRequest` (prisma/schema.prisma) this adapter touches. */
export interface LegacyHelpRequestRecord {
  id: string;
  userId: string;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  status: string;
  createdAt: Date;
}

const STATUS_MAP: Record<string, HelpRequestStatus> = {
  RECEIVED: "RECEIVED",
  TRIAGED: "TRIAGED",
  ASSIGNED: "ASSIGNED",
  IN_PROGRESS: "IN_PROGRESS",
  RESOLVED: "RESOLVED",
  CLOSED: "CLOSED",
  CANCELLED: "CANCELLED",
};

/** 2. Target-read interface — reuses `help.ts`'s `HelpRequest`. */
export type HelpRequestTarget = HelpRequest;

/** 3. current -> target transform. */
export function helpRequestToTarget(record: LegacyHelpRequestRecord): HelpRequestTarget {
  const mappedStatus = STATUS_MAP[record.status];
  return {
    id: record.id,
    incidentId: null,
    requesterPersonId: record.userId,
    status: mappedStatus ?? "RECEIVED",
    classification: "SENSITIVE",
    location: { latitude: record.latitude, longitude: record.longitude },
    closedByActorType: null,
    closedByActorId: null,
    closeReason: null,
    closedAt: null,
    lastClosureIdempotencyKey: null,
    createdAt: record.createdAt.toISOString(),
    legacyStatus: record.status,
    legacySource: "HelpRequest",
    legacyRecordId: record.id,
    migrationConfidence: mappedStatus ? "HIGH" : "LOW",
    migrationReviewStatus: mappedStatus ? "AUTO_MAPPED" : "REQUIRES_REVIEW",
  };
}

/** 4. target -> legacy-payload transform. Per the physical catalog, `status`/`closed_*` may only ever be written via `help.close_help_request_authorized` (SECURITY DEFINER) — this projection is read-only, never used to construct an UPDATE. */
export function helpRequestTargetToLegacyPayload(target: HelpRequestTarget): {
  id: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
} {
  return {
    id: target.id,
    status: target.status,
    latitude: target.location?.latitude ?? null,
    longitude: target.location?.longitude ?? null,
  };
}

/** 5-9. Shadow write — NOT_ENABLED when the flag is off; never a fake success. */
export function shadowWriteHelpRequest(
  record: LegacyHelpRequestRecord,
  ctx: AdapterWriteContext
): AdapterOutcome<HelpRequestTarget> {
  if (!ctx.shadowWriteEnabled) {
    return notEnabled("targetDatabaseShadowWrite is disabled — help-request shadow write not attempted");
  }
  if (!record.id) {
    return migrationBlocked("LegacyHelpRequestRecord.id is required to derive help_requests.legacy_record_id");
  }
  const target = helpRequestToTarget(record);
  return {
    kind: "PERSISTED",
    target,
    legacyId: record.id,
    migrationConfidence: target.migrationConfidence ?? "HIGH",
    reviewStatus: target.migrationReviewStatus ?? "AUTO_MAPPED",
  };
}

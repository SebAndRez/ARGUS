/**
 * src/lib/database-target/adapters/resource.ts
 *
 * Functional compatibility adapter for BC 11 (Recursos), current
 * `CriticalPoi` (530 rows) -> target `resource.*`/`geo.*` (Ola 6). Applies
 * D-06 (frozen decision register) literally: classification into routes
 * (A) Facility / (B) MeetingPoint-or-ExtractionOrReceptionPoint / (C)
 * PublicReferencePoi / (D) MigrationReviewQueue is NEVER decided by this
 * file via a hardcoded `category`/`priority` check — D-06 explicitly
 * states the classification rule by real observed `type` value is not
 * defined a priori and requires inspecting the 530 rows first. The route
 * decision is therefore injected (`PoiRouteClassifier`), exactly like
 * `LegacyStatusMappingTable` in incident.ts — absent a classifier result,
 * the row lands on route (D) (`MigrationReviewQueueEntry`), which per D-06
 * is itself a recorded outcome, never a silent omission.
 */

import type { ExtractionOrReceptionPoint, Facility, MeetingPoint, MigrationReviewQueueEntry, PublicReferencePoi, Resource } from "../resource";
import {
  type AdapterOutcome,
  type AdapterWriteContext,
  notEnabled,
} from "./types";

/** 1. Current-read interface — the exact subset of `CriticalPoi` (prisma/schema.prisma) this adapter touches. */
export interface LegacyCriticalPoiRecord {
  id: string;
  name: string;
  category: string;
  priority: string;
  latitude: number;
  longitude: number;
  status: string;
  createdAt: Date;
}

/** D-06 route outcome. `null` from a classifier means "insufficiently classified" -> route (D), never an assumed route. */
export type PoiRoute = "A" | "B" | "C" | "D";

/** Injected classification rule — represents human/product judgment on real observed `CriticalPoi.category`/`.priority` values (D-06 precondition). Never hardcoded in this file. */
export type PoiRouteClassifier = (record: LegacyCriticalPoiRecord) => PoiRoute | null;

/** 2. Target-read interface — a discriminated union over the 4 D-06 routes, each reusing `resource.ts`'s existing shapes. */
export type ResourceTarget =
  | { route: "A"; resource: Resource; facility: Facility }
  | { route: "B"; point: MeetingPoint | ExtractionOrReceptionPoint }
  | { route: "C"; reference: PublicReferencePoi }
  | { route: "D"; queueEntry: MigrationReviewQueueEntry };

/** 3. current -> target transform. `classifier` result of `null` (or a classifier not being able to resolve a route) always resolves to route (D) — never assumed to be (A). */
export function criticalPoiToTarget(
  record: LegacyCriticalPoiRecord,
  classifier: PoiRouteClassifier
): ResourceTarget {
  const route = classifier(record);

  if (route === "A") {
    const resource: Resource = {
      id: record.id,
      resourceType: "FACILITY",
      institutionalIdentifier: null,
      ownerOrganizationId: null,
      status: record.status === "active" ? "AVAILABLE" : "UNAVAILABLE",
      location: { latitude: record.latitude, longitude: record.longitude },
      classification: "OPERATIONAL",
      legacyStatus: record.status,
      legacySource: "CriticalPoi",
      legacyRecordId: record.id,
      migrationConfidence: "HIGH",
      migrationReviewStatus: "AUTO_MAPPED",
      createdAt: record.createdAt.toISOString(),
    };
    const facility: Facility = {
      id: record.id,
      resourceId: record.id,
      capacity: 0,
      occupancy: 0,
      address: null,
      legacyStatus: record.status,
      legacySource: "CriticalPoi",
      legacyRecordId: record.id,
      migrationConfidence: "MEDIUM",
      migrationReviewStatus: "REQUIRES_REVIEW",
    };
    return { route: "A", resource, facility };
  }

  if (route === "B") {
    const point: MeetingPoint = {
      id: record.id,
      location: { latitude: record.latitude, longitude: record.longitude },
      capacity: null,
      status: record.status === "active" ? "VIABLE" : "CLOSED",
      version: 1,
      deactivatedAt: null,
      legacyStatus: record.status,
      legacySource: "CriticalPoi",
      legacyRecordId: record.id,
      migrationConfidence: "MEDIUM",
      migrationReviewStatus: "REQUIRES_REVIEW",
    };
    return { route: "B", point };
  }

  if (route === "C") {
    const reference: PublicReferencePoi = {
      id: record.id,
      name: record.name,
      location: { latitude: record.latitude, longitude: record.longitude },
      category: record.category,
      legacyRecordId: record.id,
    };
    return { route: "C", reference };
  }

  const queueEntry: MigrationReviewQueueEntry = {
    id: record.id,
    legacyStatus: record.status,
    legacySource: "CriticalPoi",
    legacyRecordId: record.id,
    migrationConfidence: "LOW",
    migrationReviewStatus: "REQUIRES_REVIEW",
    reviewNote: `Unclassified CriticalPoi.category="${record.category}"/.priority="${record.priority}" — D-06 route not resolved`,
  };
  return { route: "D", queueEntry };
}

/** 4. target -> legacy-payload transform. Routes (A)/(B)/(C) all had a `name`/coordinate pair in `CriticalPoi` — reconstructable; route (D) has no resolved shape to project back (it IS the "not yet resolved" state). */
export function resourceTargetToLegacyPayload(
  target: ResourceTarget
): { id: string; name: string | null; latitude: number; longitude: number } | null {
  if (target.route === "A") {
    return { id: target.resource.id, name: null, latitude: target.resource.location!.latitude, longitude: target.resource.location!.longitude };
  }
  if (target.route === "B") {
    return { id: target.point.id, name: null, latitude: target.point.location.latitude, longitude: target.point.location.longitude };
  }
  if (target.route === "C") {
    return { id: target.reference.id, name: target.reference.name, latitude: target.reference.location.latitude, longitude: target.reference.location.longitude };
  }
  return null;
}

/** 5-9. Shadow write — NOT_ENABLED when the flag is off. Route (D) is a legitimate `REQUIRES_REVIEW` PERSISTED-into-the-queue outcome, per D-06 ("landing here is itself a recorded classification outcome") — not a blocked outcome. */
export function shadowWriteResource(
  record: LegacyCriticalPoiRecord,
  classifier: PoiRouteClassifier,
  ctx: AdapterWriteContext
): AdapterOutcome<ResourceTarget> {
  if (!ctx.shadowWriteEnabled) {
    return notEnabled("targetDatabaseShadowWrite is disabled — resource shadow write not attempted");
  }
  const target = criticalPoiToTarget(record, classifier);
  return {
    kind: "PERSISTED",
    target,
    legacyId: record.id,
    migrationConfidence: target.route === "A" ? "HIGH" : target.route === "D" ? "LOW" : "MEDIUM",
    reviewStatus: target.route === "C" ? "AUTO_MAPPED" : "REQUIRES_REVIEW",
  };
}

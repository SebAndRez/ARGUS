/**
 * src/lib/database-target/resource.ts
 *
 * Target-schema types for BC 11 (Recursos y Logística), schema `resource`,
 * plus the schema `geo` operational-point tables that are the required
 * counterpart of the D-06 split (see below). Mirrors
 * `ARGUS_PHYSICAL_TABLE_CATALOG_v1.0.md` §resource/§geo (unchanged in v1.1
 * except `resource.resource_reservations`, modified per P2-10/refuerzo de
 * P1-01 — see `ARGUS_PHYSICAL_TABLE_CATALOG_v1.1_FROZEN.md`).
 *
 * Current model this replaces conceptually: `CriticalPoi` (530 real rows) +
 * `CriticalPoiOperationalStatus` (108 rows) + `CriticalPoiStatusEvidence`
 * (108 rows, no real FK — pre-existing integrity asymmetry per Baseline
 * §2), governed by **D-06** (frozen decision register):
 * `CriticalPoi` is NEVER transformed wholesale into `Facility`. It is
 * classified row-by-row into exactly one of four routes, and every route
 * must be represented here:
 *
 *   (A) Operational installation  -> `Facility` (this file, backed by
 *       `resource.resources` + `resource.facilities`).
 *   (B) Operational point         -> `MeetingPoint` / `ExtractionPoint` /
 *       `ReceptionPoint` (this file; physically schema `geo`, cross-included
 *       here because D-06 is the decision that governs their population
 *       from `CriticalPoi`, not because they belong to schema `resource`).
 *   (C) Public reference          -> `PublicReferencePoi` (this file;
 *       projection/reference shape, `proj.public_map_feed` or an
 *       equivalent public geographic reference catalog — not a `resource.*`
 *       table either).
 *   (D) Insufficiently classified -> `MigrationReviewQueue` (this file; a
 *       *working queue*, NOT a physical target table — per D-06 it "puede
 *       materializarse como vista sobre `legacy_source='CriticalPoi' AND
 *       migration_review_status='REQUIRES_REVIEW'`").
 *
 * NOT a Prisma client. NOT imported by any existing runtime code. Pure
 * type declarations for future adapter work.
 */

import type { GeoPoint, InformationClassification, LegacyProvenance } from "./shared";

/** `resource_type_enum`. */
export type ResourceType = "PERSON" | "EQUIPMENT" | "FACILITY" | "VEHICLE" | "SUPPLY" | "SERVICE";

/** `resource_status_enum` (default 'AVAILABLE'). */
export type ResourceStatus =
  | "AVAILABLE"
  | "RESERVED"
  | "ASSIGNED"
  | "IN_USE"
  | "MAINTENANCE"
  | "UNAVAILABLE"
  | "RETIRED";

/**
 * `resource.resources` — the generic aggregate root shared by every
 * concrete resource kind (person/equipment/facility/vehicle/supply/service).
 * A `Facility` (below) is always a 1:1 satellite of one `Resource` row, never
 * a standalone table.
 */
export interface Resource extends Partial<LegacyProvenance> {
  /** db: id — uuid PK */
  id: string;
  /** db: resource_type — resource_type_enum NOT NULL */
  resourceType: ResourceType;
  /** db: institutional_identifier — varchar(100) NULL */
  institutionalIdentifier: string | null;
  /** db: owner_organization_id — uuid NULL REFERENCES institution.organizations(id) ON DELETE SET NULL */
  ownerOrganizationId: string | null;
  /** db: status — DEFAULT 'AVAILABLE' */
  status: ResourceStatus;
  /** db: location — geography(Point,4326) NULL */
  location: GeoPoint | null;
  /** db: classification — DEFAULT 'OPERATIONAL' */
  classification: InformationClassification;
  /** db: created_at */
  createdAt: string;
}

/**
 * `resource.facilities` — route (A) of the D-06 split. 1:1 satellite of
 * `resource.resources` (`CASCADE`, UNIQUE). `CriticalPoiOperationalStatus`
 * (108 real rows, the shelters with managed operational state) is the
 * clearest candidate subset for this route — the remaining ~422 rows of
 * `CriticalPoi` require per-`type` classification (see backfill catalog).
 */
export interface Facility extends Partial<LegacyProvenance> {
  /** db: id — uuid PK */
  id: string;
  /** db: resource_id — uuid NOT NULL UNIQUE REFERENCES resource.resources(id) ON DELETE CASCADE */
  resourceId: string;
  /** db: capacity — integer NOT NULL */
  capacity: number;
  /** db: occupancy — integer NOT NULL DEFAULT 0 — CHECK ck_facilities_occupancy_le_capacity (occupancy <= capacity) */
  occupancy: number;
  /** db: address — text NULL */
  address: string | null;
}

/** `reservation_status_enum` (default 'PENDING_CONFIRMATION'). */
export type ReservationStatus =
  | "PENDING_CONFIRMATION"
  | "CONFIRMED"
  | "EXTENDED"
  | "RELEASED"
  | "EXPIRED"
  | "CANCELLED";

/**
 * `resource.resource_reservations` **[MODIFIED v1.1 — P2-10, refuerzo de
 * P1-01]**. `extensionCeiling` is service-computed at extension time as
 * `expires_at_original + governance.resource_reservation_rules
 * .max_extension_duration`; `extendedOnce` may only ever transition
 * false->true once (trigger `trg_resource_reservations_single_extension`
 * rejects `OLD.extended_once=true AND NEW.extended_once=true`). Per
 * `target-resource-reservation.test.ts`, the 5/15-minute thresholds are
 * NEVER hardcoded here — they are resolved from
 * `governance.resource_reservation_rules` at reservation/extension time.
 */
export interface ResourceReservation extends Partial<LegacyProvenance> {
  /** db: id — uuid PK */
  id: string;
  /** db: mission_id — uuid NOT NULL REFERENCES mission.missions(id) */
  missionId: string;
  /** db: resource_id — uuid NOT NULL REFERENCES resource.resources(id) */
  resourceId: string;
  /** db: status — DEFAULT 'PENDING_CONFIRMATION' */
  status: ReservationStatus;
  /** db: expires_at — timestamptz NOT NULL */
  expiresAt: string;
  /** db: extended_once — boolean NOT NULL DEFAULT false */
  extendedOnce: boolean;
  /** db: extension_ceiling — timestamptz NULL [NUEVO v1.1] */
  extensionCeiling: string | null;
  /** db: idempotency_key — uuid NOT NULL */
  idempotencyKey: string;
  /** db: created_at */
  createdAt: string;
  /** db: released_at — timestamptz NULL */
  releasedAt: string | null;
}

/** `meeting_point_status_enum` (default 'VIABLE'). Shared by MeetingPoint/ExtractionPoint/ReceptionPoint families. */
export type OperationalPointStatus = "VIABLE" | "NOT_VIABLE" | "SATURATED" | "CLOSED";

/**
 * `geo.meeting_points` — route (B) of the D-06 split, unique-ownership
 * variant: reusable across successive missions, never owned by a single
 * `Mission` (only referenced via `mission.mission_meeting_point_assignments`).
 * Per the mapping doc v1.1, its only legitimate partial source is the (B)
 * subset of `CriticalPoi` — `FamilyPlan.primaryMeetingPoint`/
 * `.alternateMeetingPoint` is explicitly NOT a source (corrects v1.0, per
 * D-03: VESTA stays `LEGACY_READ_ONLY`).
 */
export interface MeetingPoint extends Partial<LegacyProvenance> {
  /** db: id — uuid PK */
  id: string;
  /** db: location — geography(Point,4326) NOT NULL */
  location: GeoPoint;
  /** db: capacity — integer NULL */
  capacity: number | null;
  /** db: status — DEFAULT 'VIABLE' */
  status: OperationalPointStatus;
  /** db: version — integer NOT NULL DEFAULT 1 */
  version: number;
  /** db: deactivated_at — timestamptz NULL */
  deactivatedAt: string | null;
}

/**
 * `geo.extraction_points` / `geo.reception_points` — route (B) of the D-06
 * split, mission-scoped variant (as opposed to `MeetingPoint`'s
 * cross-mission reuse). Classification into this route vs. `MeetingPoint`
 * vs. route (C)/(D) depends entirely on the observed `CriticalPoi.type`
 * value (D-06) — no value is assumed a priori.
 */
export interface ExtractionOrReceptionPoint extends Partial<LegacyProvenance> {
  /** db: id — uuid PK */
  id: string;
  /** db: mission_id — uuid NOT NULL REFERENCES mission.missions(id) ON DELETE RESTRICT */
  missionId: string;
  /** db: location — geography(Point,4326) NOT NULL */
  location: GeoPoint;
  /** db: status — extraction_reception_status_enum NOT NULL DEFAULT 'VIABLE' */
  status: OperationalPointStatus;
  /** db: version — integer NOT NULL DEFAULT 1 */
  version: number;
  /** discriminator — NOT a physical column; distinguishes which of the two identically-shaped tables a row came from. */
  pointKind: "EXTRACTION" | "RECEPTION";
}

/**
 * Route (C) of the D-06 split — a passive public reference point with no
 * managed operational state (as opposed to (A)/(B), which are actively
 * managed). Modeled after `proj.public_map_feed` / an equivalent public
 * geographic reference catalog per the mapping doc §Schema `geo`/`proj`.
 * NOT a single physical target table on its own — this shape documents the
 * stable read-only contract such a projection must serve.
 */
export interface PublicReferencePoi {
  /** Stable public identifier — may be a `proj.public_map_feed` row id or an equivalent reference catalog id. */
  id: string;
  /** Human-readable label, analogous to `CriticalPoi.name` today. */
  name: string;
  /** geography(Point,4326) projected to the public lat/lng contract. */
  location: GeoPoint;
  /** Free-form category string — pending a governed vocabulary; never treated as authoritative operational state. */
  category: string | null;
  /** `ST_Simplify`-reduced geometry precision is mandatory for any polygonal variant (Gap Analysis §4) — not applicable to point features. */
  legacyRecordId: string | null;
}

/**
 * Route (D) of the D-06 split — a `CriticalPoi` row without sufficient
 * classification signal to resolve to (A)/(B)/(C). Per D-06's criterio de
 * cierre, landing here is itself a recorded classification outcome, never
 * a silent omission. NOT a physical target table — "puede materializarse
 * como vista sobre `legacy_source='CriticalPoi' AND
 * migration_review_status='REQUIRES_REVIEW'`" (D-06). Every field below is
 * therefore drawn from `LegacyProvenance`, not a `resource.*`/`geo.*` column.
 */
export interface MigrationReviewQueueEntry extends LegacyProvenance {
  /** Working-queue identifier — not a physical PK, may be the source row's own id when materialized as a view. */
  id: string;
  /** Always 'CriticalPoi' for the D-06 use case; kept generic since other backfills may also queue rows here. */
  legacySource: string;
  /** The original CriticalPoi.id (or other legacy table PK) pending human classification. */
  legacyRecordId: string;
  /** Always 'REQUIRES_REVIEW' while the entry remains queued. */
  migrationReviewStatus: "REQUIRES_REVIEW";
  /** Free-text note on why automatic classification (A/B/C) could not be resolved — e.g. unrecognized `CriticalPoi.type` value. */
  reviewNote: string | null;
}

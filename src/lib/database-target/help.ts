/**
 * src/lib/database-target/help.ts
 *
 * Target-schema types for BC 9 (Necesidades y Solicitudes de Ayuda), schema
 * `help`. Mirrors the 6 tables documented in `ARGUS_PHYSICAL_TABLE_CATALOG_
 * v1.0.md` §help (`help.help_requests` modified in v1.1 — see
 * `ARGUS_PHYSICAL_TABLE_CATALOG_v1.1_FROZEN.md` §help, P1-04/Corrección#5 —
 * the other 5 tables are inherited unchanged from v1.0).
 *
 * Current model these replace conceptually: `HelpRequest` (33-model schema),
 * split into `help.help_requests` + `help.affected_people` per the
 * Compatibility Layer Plan §1. The v1.1 close mechanism
 * (`closed_by_actor_id`/`close_reason`/`closed_at`) is a physical
 * materialization of what was previously only a narrative status change —
 * see `target-help-request-close.test.ts`. Per the physical catalog, the
 * only write path for `status`/`closed_*` is the `SECURITY DEFINER`
 * function `help.close_help_request_authorized` — no adapter may model a
 * direct `UPDATE` of these columns.
 *
 * NOT a Prisma client. NOT imported by any existing runtime code. Pure
 * type declarations for future adapter work.
 */

import type {
  ActorType,
  InformationClassification,
  LegacyProvenance,
  OfflineSyncColumns,
} from "./shared";

/** `help_request_status_enum` (default 'RECEIVED'). */
export type HelpRequestStatus =
  | "RECEIVED"
  | "TRIAGED"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "CLOSED"
  | "CANCELLED";

/**
 * `help.help_requests` **[MODIFIED v1.1 — P1-04/Corrección#5]**. The five
 * `NUEVO v1.1` columns below materialize the authorized-close mechanism
 * physically (previously only narrative) — `CHECK
 * ck_help_requests_close_actor` enforces `closedByActorId` is set whenever
 * `status` reaches `RESOLVED`/`CLOSED`, and trigger
 * `trg_help_requests_deny_requester_close` rejects any transition where the
 * closing actor is the requester themself.
 */
export interface HelpRequest extends Partial<LegacyProvenance>, Partial<OfflineSyncColumns> {
  /** db: id — uuid PK */
  id: string;
  /** db: incident_id — uuid NULL REFERENCES incident.incidents(id) ON DELETE SET NULL */
  incidentId: string | null;
  /** db: requester_person_id — uuid NULL REFERENCES identity.people(id) ON DELETE SET NULL */
  requesterPersonId: string | null;
  /** db: status — help_request_status_enum NOT NULL DEFAULT 'RECEIVED' */
  status: HelpRequestStatus;
  /** db: classification — information_classification_enum NOT NULL DEFAULT 'SENSITIVE' */
  classification: InformationClassification;
  /** db: location — geography(Point,4326) NULL, projected back via GeoPoint at the API boundary */
  location: { latitude: number; longitude: number } | null;
  /** db: closed_by_actor_type — actor_type_enum NULL [NUEVO v1.1] */
  closedByActorType: ActorType | null;
  /** db: closed_by_actor_id — uuid NULL [NUEVO v1.1] — never the requester (trigger-enforced) */
  closedByActorId: string | null;
  /** db: close_reason — text NULL [NUEVO v1.1] */
  closeReason: string | null;
  /** db: closed_at — timestamptz NULL [NUEVO v1.1] */
  closedAt: string | null;
  /** db: last_closure_idempotency_key — uuid NULL [NUEVO v1.1] */
  lastClosureIdempotencyKey: string | null;
  /** db: created_at — timestamptz NOT NULL DEFAULT now() */
  createdAt: string;
}

/** `operational_need_status_enum` (default 'IDENTIFIED'). */
export type OperationalNeedStatus = "IDENTIFIED" | "CONVERTED" | "RESOLVED";

/** `help.operational_needs` — a need identified with or without an explicit request. */
export interface OperationalNeed {
  /** db: id */
  id: string;
  /** db: incident_id — uuid NULL REFERENCES incident.incidents(id) ON DELETE SET NULL */
  incidentId: string | null;
  /** db: help_request_id — uuid NULL REFERENCES help.help_requests(id) ON DELETE SET NULL */
  helpRequestId: string | null;
  /** db: description — text NOT NULL */
  description: string;
  /** db: status */
  status: OperationalNeedStatus;
  /** db: classification — information_classification_enum NOT NULL (no fixed default) */
  classification: InformationClassification;
  /** db: created_at */
  createdAt: string;
  /**
   * CHECK ck_operational_needs_origin: incidentId IS NOT NULL OR
   * helpRequestId IS NOT NULL — never both null.
   */
}

/** `affectation_status_enum` (default 'UNKNOWN'). */
export type AffectationStatus =
  | "AT_RISK"
  | "INJURED"
  | "TRAPPED"
  | "SAFE"
  | "DECEASED"
  | "UNKNOWN";

/**
 * `help.affected_people` — a person affected by an incident, distinct from
 * `Person`/`HelpRequest`/`EmergencyProfile` (corrects P0-01). Direct child of
 * `help_requests`, never an N:M association.
 */
export interface AffectedPerson {
  /** db: id */
  id: string;
  /** db: help_request_id — uuid NOT NULL REFERENCES help.help_requests(id) ON DELETE CASCADE */
  helpRequestId: string;
  /** db: person_id — uuid NULL REFERENCES identity.people(id) ON DELETE SET NULL — optional, person may be unidentified */
  personId: string | null;
  /** db: affectation_status — DEFAULT 'UNKNOWN' */
  affectationStatus: AffectationStatus;
  /** db: provisional_identity — jsonb NULL */
  provisionalIdentity: Record<string, unknown> | null;
  /** db: classification — DEFAULT 'SENSITIVE' */
  classification: InformationClassification;
  /** db: merged_into_id — uuid NULL REFERENCES help.affected_people(id) ON DELETE SET NULL — merges only via audited RPC, never silent DELETE */
  mergedIntoId: string | null;
  /** db: created_at */
  createdAt: string;
}

/** `help.rescue_assessments` — pre-assignment analysis for a help request. */
export interface RescueAssessment {
  /** db: id */
  id: string;
  /** db: help_request_id — uuid NOT NULL REFERENCES help.help_requests(id) ON DELETE CASCADE */
  helpRequestId: string;
  /** db: hazard_notes — text NULL */
  hazardNotes: string | null;
  /** db: mobility_notes — text NULL */
  mobilityNotes: string | null;
  /** db: resources_needed — jsonb NULL */
  resourcesNeeded: Record<string, unknown> | null;
  /** db: created_at */
  createdAt: string;
}

/** `situation_update_type_enum`. */
export type SituationUpdateType = "STATUS_CHANGE" | "RESOLUTION_CLAIM" | "OTHER";

/** `resolution_claim_review_status_enum` — only meaningful for `RESOLUTION_CLAIM`. */
export type ResolutionClaimReviewStatus = "PENDING_OPERATOR_REVIEW" | "ACKNOWLEDGED_BY_OPERATOR";

/**
 * `help.situation_updates` — strict append-only log (`HelpRequestResolutionClaim`
 * folded in via `updateType` discriminator). Deliberately has NO
 * auto-close trigger — a `RESOLUTION_CLAIM` never closes a `HelpRequest` by
 * itself (see Physical Table Catalog Fase 12).
 */
export interface SituationUpdate extends Partial<OfflineSyncColumns> {
  /** db: id */
  id: string;
  /** db: help_request_id — uuid NOT NULL REFERENCES help.help_requests(id) ON DELETE RESTRICT */
  helpRequestId: string;
  /** db: update_type */
  updateType: SituationUpdateType;
  /** db: content — text NOT NULL */
  content: string;
  /**
   * db: review_status — NULL unless updateType === 'RESOLUTION_CLAIM'
   * (CHECK ck_situation_updates_review_status).
   */
  reviewStatus: ResolutionClaimReviewStatus | null;
  /** db: declared_by_actor_type — actor_type_enum NOT NULL */
  declaredByActorType: ActorType;
  /** db: declared_by_actor_id — uuid NOT NULL */
  declaredByActorId: string;
  /** db: created_at */
  createdAt: string;
}

/** `collaboration_invitation_status_enum` (default 'OFFERED'). */
export type CollaborationInvitationStatus = "OFFERED" | "ACCEPTED" | "REJECTED" | "EXPIRED";

/**
 * `help.collaboration_invitations` — the "nearby professional" two-phase
 * pattern instance. Phase 1 (distance + compatible role) never authorizes
 * exact coordinates/tactical data on its own; Phase 2 requires an active
 * `security.contextual_accesses` row after acceptance.
 */
export interface CollaborationInvitation extends Partial<OfflineSyncColumns> {
  /** db: id */
  id: string;
  /** db: help_request_id — uuid NOT NULL REFERENCES help.help_requests(id) ON DELETE RESTRICT */
  helpRequestId: string;
  /** db: invited_person_id — uuid NOT NULL REFERENCES identity.people(id) ON DELETE RESTRICT */
  invitedPersonId: string;
  /** db: capability_id — uuid NULL REFERENCES capability.capabilities(id) ON DELETE SET NULL */
  capabilityId: string | null;
  /** db: status — DEFAULT 'OFFERED' */
  status: CollaborationInvitationStatus;
  /** db: approximate_distance_meters — numeric(10,2) NULL */
  approximateDistanceMeters: number | null;
  /** db: contextual_access_id — uuid NULL REFERENCES security.contextual_accesses(id) ON DELETE SET NULL — Phase 2 */
  contextualAccessId: string | null;
  /** db: expires_at — timestamptz NOT NULL (required while OFFERED) */
  expiresAt: string;
  /** db: created_at */
  createdAt: string;
}

/**
 * src/lib/database-target/incident.ts
 *
 * Target-schema types for BC 6 (Incidente Canónico), schema `incident`.
 * Mirrors `incident.incidents`, `incident.incident_relations`,
 * `incident.incident_transitions` as documented in
 * `ARGUS_PHYSICAL_TABLE_CATALOG_v1.0.md` §incident (unchanged in v1.1
 * except the 3 new associative tables fichadas por P1-01, also included
 * here for completeness).
 *
 * Current model this replaces conceptually: `KnowledgeIncident` +
 * `IncidentRelation` + `IncidentTransition` (33-model schema), per D-02
 * (frozen decision register): the five status dimensions below are NEVER
 * collapsed into a single "status" column, unlike the 13 nullable canonical
 * columns bolted onto `KnowledgeIncident` in migration 13.
 *
 * NOT a Prisma client. NOT imported by any existing runtime code.
 */

import type { ActorType, ConfidenceLevel, GeoPoint, InformationClassification, LegacyProvenance } from "./shared";
import type { ObservationProvenance } from "./evidence";

/** `incident_verification_status_enum` (default 'UNCONFIRMED') — 4 values per `ARGUS_PHYSICAL_ENUMS_REFERENCE_DATA_v1.1_FROZEN.md` #26, transcribed exactly from `prisma/schema.target.prisma`. */
export type IncidentVerificationStatus =
  | "UNCONFIRMED"
  | "PARTIALLY_CONFIRMED"
  | "CONFIRMED"
  | "DISPUTED";

/** `incident_operational_status_enum` (default 'DETECTED') — 7 values per Enums Reference Data #27. */
export type IncidentOperationalStatus =
  | "DETECTED"
  | "ASSESSING"
  | "ACTIVE"
  | "CONTAINED"
  | "MITIGATING"
  | "RESOLVED"
  | "CLOSED";

/** `incident_preventive_status_enum` (default 'NONE') — 4 values per Enums Reference Data #28. */
export type IncidentPreventiveStatus = "NONE" | "MONITORING" | "PREVENTIVE_ACTION" | "STANDBY";

/** `incident_trend_enum` (default 'UNKNOWN') — 4 values per Enums Reference Data #29. */
export type IncidentTrend = "UNKNOWN" | "IMPROVING" | "STABLE" | "WORSENING";

/** `incident_structural_status_enum` (default 'INDEPENDENT') — 5 values per Enums Reference Data #30. */
export type IncidentStructuralStatus = "INDEPENDENT" | "PARENT" | "CHILD" | "MERGED" | "SPLIT";

/**
 * `incident.incidents` — the canonical incident. Five status dimensions are
 * kept strictly separate per D-02 — no single "status" field exists or
 * should ever be reintroduced by a future adapter.
 */
export interface Incident extends Partial<LegacyProvenance> {
  /** db: id — uuid PK */
  id: string;
  /** db: origin_candidate_id — uuid NULL UNIQUE REFERENCES incident.incident_candidates(id) */
  originCandidateId: string | null;
  /** db: verification_status */
  verificationStatus: IncidentVerificationStatus;
  /** db: operational_status */
  operationalStatus: IncidentOperationalStatus;
  /** db: preventive_status */
  preventiveStatus: IncidentPreventiveStatus;
  /** db: trend */
  trend: IncidentTrend;
  /** db: structural_status */
  structuralStatus: IncidentStructuralStatus;
  /** db: incident_type_id — uuid NOT NULL REFERENCES governance.incident_types(id) */
  incidentTypeId: string;
  /** db: classification — DEFAULT 'CRITICAL' */
  classification: InformationClassification;
  /** db: title — varchar(255) NOT NULL */
  title: string;
  /** db: description — text NULL */
  description: string | null;
  /** db: created_at */
  createdAt: string;
  /** db: closed_at */
  closedAt: string | null;
}

/**
 * `incident_candidate_status_enum` (default 'UNDER_ASSESSMENT') — the
 * physical promotion-lifecycle status of `incident.incident_candidates`,
 * distinct from `Incident`'s 5 status dimensions (a candidate is not yet a
 * confirmed incident; it either gets promoted, stays under assessment
 * forever, or is discarded).
 */
export type IncidentCandidateStatus = "UNDER_ASSESSMENT" | "PROMOTING" | "PROMOTED" | "DISCARDED";

/**
 * What originated this candidate — NOT a physical column
 * (`incident.incident_candidates` has no discriminator column of its own);
 * carried here because every candidate this adapter layer creates has a
 * traceable origin, and losing that origin would make `correlationKey`
 * un-auditable. Mirrors the 3 upstream sources the Ola 3/4 plan names.
 */
export type IncidentCandidateOriginType = "SOURCE_RECORD" | "OBSERVATION" | "REPORT" | "LEGACY_KNOWLEDGE_INCIDENT";

/**
 * A candidate's proposed values for the 5 dimensions `incident.incidents`
 * keeps strictly separate (D-02) — staged here PRE-promotion, never written
 * to any `incident.incidents` row directly. Physically, once/if a candidate
 * is promoted, this exact shape is what `incident.incident_promotions
 * .input_data_snapshot` (jsonb, NOT NULL) is expected to contain — this
 * interface is that snapshot's pre-promotion working shape, not a
 * standalone physical table. Never invented: every optional field below is
 * `null` unless a real upstream value maps to it, and the whole object is
 * `null` when D-02's approved status-mapping table has no entry yet
 * (mirrors `knowledgeIncidentToTarget`'s `null`-on-no-mapping contract in
 * `adapters/incident.ts`).
 */
export interface ProposedIncidentProfile {
  proposedIncidentTypeId: string | null;
  proposedCategory: string | null;
  verificationStatus: IncidentVerificationStatus;
  operationalStatus: IncidentOperationalStatus;
  preventiveStatus: IncidentPreventiveStatus;
  trend: IncidentTrend;
  structuralStatus: IncidentStructuralStatus;
  confidence: ConfidenceLevel;
}

/**
 * `incident.incident_candidates` — a proposed-but-unconfirmed incident,
 * modeled as its OWN type. Never an alias of `Incident`, `KnowledgeIncident`,
 * `ExternalEvent`, `Observation`, or `RiskAssessment` — each of those keeps
 * its own file/shape; this interface only ever REFERENCES them by id.
 *
 * Field provenance, explicit per field group:
 *   - `id`/`status`/`correlationKey`/`classification`/`promotionStartedAt`/
 *     `createdAt` are the 6 real physical columns of
 *     `incident.incident_candidates` (see the Prisma model, lines ~1995-2013
 *     of `prisma/schema.target.prisma`).
 *   - `legacyStatus`/`legacySource`/`legacyRecordId`/`migrationConfidence`/
 *     `migrationReviewStatus` are the standard `LegacyProvenance` mixin
 *     (D-02, frozen decision register).
 *   - `proposedProfile` is NOT a physical column set on this table — see
 *     `ProposedIncidentProfile`'s own doc comment. `null` when no approved
 *     D-02 mapping resolves it yet (`REQUIRES_REVIEW`, never guessed).
 *   - `jurisdictionId`/`administrativeAreaId`/`location`/`occurredAt`/
 *     `receivedAt`/`clientCreatedAt` are NOT physical columns on
 *     `incident_candidates` either — the physical model resolves these only
 *     transitively, through the linked `evidence.observations` rows (via
 *     `incident.incident_candidate_observations`). They are carried here as
 *     an explicit, nullable, DENORMALIZED SNAPSHOT for adapter/shadow-write
 *     convenience — never written back as if they were their own columns,
 *     and never fabricated when no linked observation supplies them.
 *   - `sourceRecordIds`/`observationIds`/`evidenceIds` mirror the real
 *     link tables (`incident_candidate_observations` for `observationIds`;
 *     `sourceRecordIds`/`evidenceIds` are transitive through the linked
 *     observations' own `sourceRecordId`/`observation_evidence_links`, same
 *     denormalized-snapshot caveat as above).
 *   - `automationRuleId`/`actorType`/`actorId` reflect (when present) the
 *     `governance.automation_rules`/polymorphic actor that will end up on
 *     `incident.incident_promotions` if/when this candidate is promoted —
 *     never itself a physical column on `incident_candidates`.
 *   - `provenance` reuses the same VO Provenance contract as
 *     `evidence.observations.provenance` (see `evidence.ts`), tracing this
 *     candidate's own derivation chain — NOT a physical column here either
 *     (the physical table has no `provenance` jsonb column); carried for
 *     adapter/reconciliation traceability only.
 */
export interface IncidentCandidate extends Partial<LegacyProvenance> {
  /** db: id — uuid PK */
  id: string;
  /** db: status — DEFAULT 'UNDER_ASSESSMENT' */
  status: IncidentCandidateStatus;
  /** db: correlation_key — text NULL */
  correlationKey: string | null;
  /** db: classification — DEFAULT 'OPERATIONAL' */
  classification: InformationClassification;
  /** db: promotion_started_at — timestamptz NULL */
  promotionStartedAt: string | null;
  /** db: created_at */
  createdAt: string;

  /** NOT a physical column — see class doc comment. */
  candidateOriginType: IncidentCandidateOriginType;
  /** NOT a physical column — see class doc comment. `null` = REQUIRES_REVIEW (no approved D-02 mapping yet), never guessed. */
  proposedProfile: ProposedIncidentProfile | null;

  /** NOT a physical column — denormalized snapshot, see class doc comment. */
  jurisdictionId: string | null;
  /** NOT a physical column — denormalized snapshot. */
  administrativeAreaId: string | null;
  /** NOT a physical column — denormalized snapshot, geography(Point,4326) projected to the public lat/lng contract. */
  location: GeoPoint | null;
  /** NOT a physical column — denormalized snapshot. */
  occurredAt: string | null;
  /** NOT a physical column — denormalized snapshot (offline-sync `received_at` on the linked observation/source record). */
  receivedAt: string | null;
  /** NOT a physical column — denormalized snapshot (offline-sync `client_created_at`). */
  clientCreatedAt: string | null;

  /** Transitive link, not a physical FK on this table — see class doc comment. */
  sourceRecordIds: string[];
  /** Mirrors `incident.incident_candidate_observations` — the one real link table. */
  observationIds: string[];
  /** Transitive link, not a physical FK on this table — see class doc comment. */
  evidenceIds: string[];

  /** db (future, on promotion): `incident.incident_promotions.automation_rule_id` — NULL until/unless promoted by automation. */
  automationRuleId: string | null;
  /** db (future, on promotion): `incident.incident_promotions.decided_by_actor_type` — NULL pre-decision. */
  actorType: ActorType | null;
  /** db (future, on promotion): `incident.incident_promotions.decided_by_actor_id` — NULL pre-decision. */
  actorId: string | null;

  /** NOT a physical column — see class doc comment; reuses the `ObservationProvenance` shape from `evidence.ts`. */
  provenance: ObservationProvenance | null;
}

/** `incident_relation_type_enum` — full enumerated list per the physical catalog. */
export type IncidentRelationType =
  | "CAUSES"
  | "CAUSED_BY"
  | "CONSEQUENCE_OF"
  | "ASSOCIATED_WITH"
  | "PROPAGATED_FROM"
  | "AFFECTS"
  | "SUPERSEDES"
  | "DERIVED_FROM"
  | "SECONDARY_THREAT_OF"
  | "GROUPING";

/** `incident.incident_relations` — typed semantic link between incidents; `GROUPING` also resolves `ParentIncident`. */
export interface IncidentRelation {
  /** db: id */
  id: string;
  /** db: source_incident_id — uuid NOT NULL REFERENCES incident.incidents(id) ON DELETE RESTRICT */
  sourceIncidentId: string;
  /** db: target_incident_id — uuid NOT NULL REFERENCES incident.incidents(id) ON DELETE RESTRICT */
  targetIncidentId: string;
  /** db: relation_type */
  relationType: IncidentRelationType;
  /** db: created_at */
  createdAt: string;
}

/** `incident.incident_transitions` — historical state-change log for an incident's five dimensions. */
export interface IncidentTransition {
  /** db: id */
  id: string;
  /** db: incident_id — uuid NOT NULL REFERENCES incident.incidents(id) */
  incidentId: string;
  /** db: dimension — which of the 5 status dimensions changed */
  dimension:
    | "verification_status"
    | "operational_status"
    | "preventive_status"
    | "trend"
    | "structural_status";
  /** db: previous_value */
  previousValue: string | null;
  /** db: new_value */
  newValue: string;
  /** db: created_at */
  createdAt: string;
}

/** `incident.incident_candidate_observations` [NUEVA v1.1 — P1-01]: N:M IncidentCandidate<->Observation with a confidence attribute. */
export interface IncidentCandidateObservation {
  /** db: id */
  id: string;
  /** db: incident_candidate_id — ON DELETE CASCADE */
  incidentCandidateId: string;
  /** db: observation_id — REFERENCES evidence.observations(id) ON DELETE RESTRICT */
  observationId: string;
  /** db: correlation_confidence */
  correlationConfidence: ConfidenceLevel;
  /** db: created_at */
  createdAt: string;
}

/** `incident.incident_merge_sources` [NUEVA v1.1 — P1-01]: lineage children of IncidentMerge. Append-only, never deleted. */
export interface IncidentMergeSource {
  /** db: id */
  id: string;
  /** db: incident_merge_id — ON DELETE CASCADE */
  incidentMergeId: string;
  /** db: source_incident_id — REFERENCES incident.incidents(id) ON DELETE RESTRICT */
  sourceIncidentId: string;
  /** db: created_at */
  createdAt: string;
}

/** `incident.incident_split_targets` [NUEVA v1.1 — P1-01]: lineage children of IncidentSplit. */
export interface IncidentSplitTarget {
  /** db: id */
  id: string;
  /** db: incident_split_id — ON DELETE CASCADE */
  incidentSplitId: string;
  /** db: target_incident_id — REFERENCES incident.incidents(id) ON DELETE RESTRICT */
  targetIncidentId: string;
  /** db: created_at */
  createdAt: string;
}

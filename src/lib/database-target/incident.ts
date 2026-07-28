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

import type { InformationClassification, LegacyProvenance, ConfidenceLevel } from "./shared";

/** `incident_verification_status_enum` (default 'UNCONFIRMED'). */
export type IncidentVerificationStatus =
  | "UNCONFIRMED"
  | "CORROBORATED"
  | "CONFIRMED"
  | "REFUTED";

/** `incident_operational_status_enum` (default 'DETECTED'). */
export type IncidentOperationalStatus =
  | "DETECTED"
  | "ACTIVE"
  | "CONTAINED"
  | "RESOLVED"
  | "CLOSED";

/** `incident_preventive_status_enum` (default 'NONE'). */
export type IncidentPreventiveStatus = "NONE" | "MONITORING" | "PREVENTIVE_ACTION_TAKEN";

/** `incident_trend_enum` (default 'UNKNOWN'). */
export type IncidentTrend = "UNKNOWN" | "IMPROVING" | "STABLE" | "WORSENING";

/** `incident_structural_status_enum` (default 'INDEPENDENT'). */
export type IncidentStructuralStatus = "INDEPENDENT" | "SUB_INCIDENT" | "MERGED" | "SPLIT";

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

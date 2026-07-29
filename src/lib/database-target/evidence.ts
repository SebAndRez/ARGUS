/**
 * src/lib/database-target/evidence.ts
 *
 * Target-schema types for BC 5 (Observaciones y Evidencia), schema
 * `evidence`. Mirrors `prisma/schema.target.prisma` models `Observation`/
 * `EvidenceRecord`/`EvidenceAsset`/`ObservationEvidenceLink` (lines
 * ~1755-1920).
 *
 * Current models these replace conceptually: `Report` (1 row, D-01
 * `authorType='CITIZEN'`), `ExternalEvent` (1,904 rows, via
 * `ingest.source_records` — see the Ola 3 executable plan), `Evidence` (0
 * rows, D-04 — migrates here, NOT to `comms.*`), `KnowledgeEvidence` (2,463
 * rows, partial — see Ola 3/4 split in the Executable Migration Plan).
 *
 * NOT a Prisma client. NOT imported by any existing runtime code. Pure
 * type declarations for future adapter work.
 */

import type { ActorType, ConfidenceLevel, GeoPoint, InformationClassification, LegacyProvenance, OfflineSyncColumns } from "./shared";

/** `observation_origin_enum` / `evidence_origin_enum` (identical value set, kept as one shared union). */
export type OriginType = "PRIMARY" | "DERIVED";

/** `report_author_type_enum`. */
export type ReportAuthorType = "CITIZEN" | "PROFESSIONAL" | "INSTITUTIONAL";

/** `observation_verification_status_enum` (default 'UNVERIFIED'). */
export type ObservationVerificationStatus =
  | "UNVERIFIED"
  | "PARTIALLY_VERIFIED"
  | "VERIFIED"
  | "REFUTED";

/** Contract VO Provenance — {chain:[{step_kind,actor_type?,actor_id?,source_record_id?,timestamp}], depth}. Validated by `fn_validate_jsonb_shape('observation_provenance', ...)` (SQL_COMPLEMENTARY_REQUIRED). */
export interface ObservationProvenance {
  chain: Array<{
    stepKind: string;
    actorType?: ActorType;
    actorId?: string;
    sourceRecordId?: string;
    timestamp: string;
  }>;
  depth: number;
}

/**
 * `evidence.observations` — an append-only claim, immutable after INSERT
 * (`claim_text`/`claim_structured`/`provenance` are trigger-protected).
 * Corrections/retractions are new rows linked via `correctsObservationId`/
 * `retractsObservationId`, never an UPDATE of the original.
 */
export interface Observation extends Partial<LegacyProvenance>, Partial<OfflineSyncColumns> {
  /** db: id — uuid PK */
  id: string;
  /** db: origin_type — observation_origin_enum NOT NULL */
  originType: OriginType;
  /** db: author_type — report_author_type_enum NULL */
  authorType: ReportAuthorType | null;
  /** db: author_person_id — uuid NULL REFERENCES identity.people(id) ON DELETE SET NULL */
  authorPersonId: string | null;
  /** db: source_record_id — uuid NULL REFERENCES ingest.source_records(id) ON DELETE SET NULL */
  sourceRecordId: string | null;
  /** db: claim_text — text NOT NULL, immutable after INSERT */
  claimText: string;
  /** db: claim_structured — jsonb NULL, contract {domain, ...}, immutable after INSERT */
  claimStructured: Record<string, unknown> | null;
  /** db: claim_schema_version — integer NOT NULL DEFAULT 1 */
  claimSchemaVersion: number;
  /** db: provenance — jsonb NOT NULL, contract VO Provenance, immutable after INSERT */
  provenance: ObservationProvenance;
  /** db: provenance_schema_version — integer NOT NULL DEFAULT 1 */
  provenanceSchemaVersion: number;
  /** db: location — geography(Point,4326) NULL, projected back via GeoPoint at the API boundary */
  location: GeoPoint | null;
  /** db: occurred_at */
  occurredAt: string | null;
  /** db: reported_at */
  reportedAt: string | null;
  /** db: verification_status — DEFAULT 'UNVERIFIED' */
  verificationStatus: ObservationVerificationStatus;
  /** db: confidence_level — DEFAULT 'UNKNOWN' */
  confidenceLevel: ConfidenceLevel;
  /** db: corrects_observation_id — uuid NULL REFERENCES evidence.observations(id) ON DELETE SET NULL */
  correctsObservationId: string | null;
  /** db: retracts_observation_id — uuid NULL REFERENCES evidence.observations(id) ON DELETE SET NULL */
  retractsObservationId: string | null;
  /** db: created_at */
  createdAt: string;
}

/**
 * `PrimaryObservation` — a logical, discriminated VIEW of `Observation`
 * (`originType === "PRIMARY"`), never its own physical table (per the
 * Prisma model comment: "Observation — atomic claim about a condition
 * (includes Report/PrimaryObservation/DerivedObservation)",
 * `prisma/schema.target.prisma` line ~1754). Distinct as a TypeScript type
 * from `Observation` so a transformer signature can require "must be
 * primary" without a runtime check scattered across call sites — but
 * every `PrimaryObservation` is trivially a valid `Observation` (structural
 * subtype), never the reverse.
 */
export interface PrimaryObservation extends Observation {
  originType: "PRIMARY";
}

export function isPrimaryObservation(observation: Observation): observation is PrimaryObservation {
  return observation.originType === "PRIMARY";
}

/**
 * `Report` — a logical, discriminated VIEW of `Observation`
 * (`originType === "PRIMARY"` AND `authorType === "CITIZEN"`), never its
 * own physical table. Mirrors the current `Report` model (33-model schema)
 * 1:1 in spirit — D-01 fixes `authorType='CITIZEN'` for every row migrated
 * from `Report`. Distinct as a TypeScript type from both `Observation` and
 * `PrimaryObservation` per the wave-3 mandate ("Report ≠ PrimaryObservation
 * ≠ Observation ≠ Evidence ≠ SourceRecord") — structurally still a valid
 * `PrimaryObservation`/`Observation`, never the reverse.
 */
export interface Report extends PrimaryObservation {
  authorType: "CITIZEN";
  authorPersonId: string;
}

export function isReport(observation: Observation): observation is Report {
  return isPrimaryObservation(observation) && observation.authorType === "CITIZEN" && observation.authorPersonId !== null;
}

/**
 * `evidence.evidence_records` — independent Aggregate Root (v1.2 §7.5
 * amendment). `chainOfCustody` is required — an adapter must never
 * construct a row with an empty chain.
 */
export interface EvidenceRecord extends Partial<LegacyProvenance>, Partial<OfflineSyncColumns> {
  /** db: id — uuid PK */
  id: string;
  /** db: origin_type — evidence_origin_enum NOT NULL */
  originType: OriginType;
  /** db: classification — information_classification_enum NOT NULL */
  classification: InformationClassification;
  /** db: chain_of_custody — jsonb NOT NULL */
  chainOfCustody: Record<string, unknown>;
  /** db: license_terms — jsonb NULL */
  licenseTerms: Record<string, unknown> | null;
  /** db: consent_id — uuid NULL REFERENCES identity.consents(id) ON DELETE SET NULL */
  consentId: string | null;
  /** db: derived_from_evidence_id — uuid NULL REFERENCES evidence.evidence_records(id) ON DELETE SET NULL */
  derivedFromEvidenceId: string | null;
  /** db: created_at */
  createdAt: string;
}

/** `evidence.evidence_assets` — metadata only; binary lives in Supabase Storage per D-05. */
export interface EvidenceAsset {
  /** db: id — uuid PK */
  id: string;
  /** db: evidence_id — uuid NOT NULL UNIQUE REFERENCES evidence.evidence_records(id) ON DELETE RESTRICT */
  evidenceId: string;
  /** db: storage_ref — text NOT NULL (Supabase Storage path, never inline binary) */
  storageRef: string;
  /** db: content_hash — text NOT NULL */
  contentHash: string;
  /** db: mime_type — varchar(100) NOT NULL */
  mimeType: string;
  /** db: created_at */
  createdAt: string;
}

/** `observation_evidence_link_type_enum`. */
export type ObservationEvidenceLinkType = "SUPPORTS" | "CONTRADICTS" | "REFUTES" | "CONTEXTUALIZES";

/** `link_method_enum`. */
export type LinkMethod = "MANUAL" | "AUTOMATIC";

/** `evidence.observation_evidence_links` — auditable N:M link between Observation and Evidence (v1.2 §7.5 amendment). */
export interface ObservationEvidenceLink {
  /** db: id */
  id: string;
  /** db: observation_id — uuid NOT NULL REFERENCES evidence.observations(id) ON DELETE RESTRICT */
  observationId: string;
  /** db: evidence_id — uuid NOT NULL REFERENCES evidence.evidence_records(id) ON DELETE RESTRICT */
  evidenceId: string;
  /** db: link_type */
  linkType: ObservationEvidenceLinkType;
  /** db: linked_by_actor_type — actor_type_enum NOT NULL (POLYMORPHIC, no physical FK) */
  linkedByActorType: ActorType;
  /** db: linked_by_actor_id — uuid NOT NULL */
  linkedByActorId: string;
  /** db: link_method */
  linkMethod: LinkMethod;
}

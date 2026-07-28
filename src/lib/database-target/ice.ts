/**
 * src/lib/database-target/ice.ts
 *
 * Target-schema types for BC 14 (Salud y Datos de Emergencia / ICE), schema
 * `ice`. Mirrors the 8 tables documented in `ARGUS_PHYSICAL_TABLE_CATALOG_
 * v1.0.md` §ice (unchanged in v1.1 — "8 tablas, sin cambios de columnas
 * respecto a v1.0").
 *
 * Current model this replaces: NONE — per D-08 (frozen decision register),
 * no current Prisma model has any concept of medical consent or emergency
 * access; this entire schema is `CREATE_EMPTY`. D-08 governs two
 * independent concepts that must never be conflated:
 *   - Ordinary medical consent: explicit, granular, revocable,
 *     purpose-limited, data-category-limited, time-limited, auditable
 *     (`identity.consents`, BC 1 — not redeclared here, see identity.ts).
 *   - `EmergencyBasis` access: independent of and never a substitute for
 *     ordinary consent — used only for genuine life-or-death situations
 *     with no time for the ordinary consent flow. EVERY access via
 *     `EmergencyBasis` must go through a `SECURITY DEFINER` function, never
 *     direct application-role access to the clinical tables (D-08
 *     mitigation for the RLS risk this schema carries).
 *
 * NOT a Prisma client. NOT imported by any existing runtime code. Pure
 * type declarations for future adapter work.
 */

import type { ActorType, InformationClassification, LegacyProvenance } from "./shared";

/**
 * `ice.emergency_profiles` — a person's ICE record. 1:1 with
 * `identity.people` (`RESTRICT`, UNIQUE). `CRITICAL` classification in its
 * entirety, per the P2-09 note on UUIDv4 (not UUIDv7) PKs across this
 * schema — deliberately chosen to avoid temporal-ordering leakage on the
 * most sensitive data category in the system.
 */
export interface EmergencyProfile {
  /** db: id — uuid PK (UUIDv4, deliberately NOT UUIDv7 — P2-09, avoids temporal leakage) */
  id: string;
  /** db: person_id — uuid NOT NULL UNIQUE REFERENCES identity.people(id) ON DELETE RESTRICT */
  personId: string;
  /** db: classification — DEFAULT 'CRITICAL' */
  classification: InformationClassification;
  /** db: created_at */
  createdAt: string;
  /** db: updated_at */
  updatedAt: string;
  /** db: deleted_at */
  deletedAt: string | null;
}

/** `clinical_item_status_enum` (default 'ACTIVE'). Shared by all 5 clinical satellite tables below. */
export type ClinicalItemStatus = "ACTIVE" | "RETIRED";

/**
 * Common shape of the 5 clinical satellite tables — `ice.medical_conditions`,
 * `ice.allergies`, `ice.current_medications`, `ice.medical_devices`,
 * `ice.special_needs`. Each is a physically separate table with its own
 * columns (per the catalog: "cinco tablas separadas por columnas propias"),
 * but all 5 share this exact shape, so one generic interface is
 * parameterized by `kind` rather than duplicated 5 times.
 */
export interface ClinicalSatelliteRecord {
  /** db: id — uuid PK */
  id: string;
  /** db: emergency_profile_id — uuid NOT NULL REFERENCES ice.emergency_profiles(id) ON DELETE CASCADE (within the consistency boundary) */
  emergencyProfileId: string;
  /** db: description — text NOT NULL */
  description: string;
  /** db: status — DEFAULT 'ACTIVE' */
  status: ClinicalItemStatus;
  /** db: created_at */
  createdAt: string;
  /** Discriminator — NOT a physical column; identifies which of the 5 physically-separate tables this row represents. */
  kind: "MEDICAL_CONDITION" | "ALLERGY" | "CURRENT_MEDICATION" | "MEDICAL_DEVICE" | "SPECIAL_NEED";
}

/** Convenience aliases — one per physical table, all structurally identical to `ClinicalSatelliteRecord`. */
export type MedicalCondition = ClinicalSatelliteRecord;
export type Allergy = ClinicalSatelliteRecord;
export type CurrentMedication = ClinicalSatelliteRecord;
export type MedicalDevice = ClinicalSatelliteRecord;
export type SpecialNeed = ClinicalSatelliteRecord;

/**
 * `ice.emergency_accesses` — third-party access record, stricter than the
 * generic `security.audit_logs`. Source of truth, INSERT-only (immutable,
 * strict append-only); application role has `REVOKE UPDATE, DELETE`.
 *
 * D-08 requires 10 audit facts be captured for every `EmergencyBasis`
 * access: actor, purpose, basis, incident, mission, data disclosed, start,
 * expiration, revocation, audit. Nine of the ten map to a direct physical
 * column below (`actorType`+`actorId`, `purpose`, `emergencyBasisId`,
 * `missionId`, `informationDisclosed`, `accessStartedAt`, `expiresAt`,
 * `revokedAt`, `accessDecisionId`). The tenth — "incidente" — has NO direct
 * physical column in the frozen v1.1 catalog (only `mission_id` is FK'd;
 * an incident is reachable only transitively via
 * `mission.missions.operational_need_id -> help.operational_needs
 * .incident_id`, never denormalized onto this table). This gap is
 * documented here rather than silently inventing an `incident_id` column
 * not present in `ARGUS_PHYSICAL_TABLE_CATALOG_v1.1_FROZEN.md` — flagged
 * for the next human review of the D-08 closure criteria, not resolved by
 * this file.
 */
export interface EmergencyAccess {
  /** db: id — uuid PK */
  id: string;
  /** db: emergency_profile_id — uuid NOT NULL REFERENCES ice.emergency_profiles(id) ON DELETE RESTRICT */
  emergencyProfileId: string;
  /** db: actor_type — actor_type_enum NOT NULL (1st of 10 required audit facts: actor) */
  actorType: ActorType;
  /** db: actor_id — uuid NOT NULL (1st of 10 required audit facts: actor) */
  actorId: string;
  /** db: emergency_basis_id — uuid NOT NULL REFERENCES governance.emergency_bases(id) ON DELETE RESTRICT (3rd: basis/fundamento) */
  emergencyBasisId: string;
  /** db: purpose — text NOT NULL (2nd: purpose/propósito) */
  purpose: string;
  /** db: mission_id — uuid NULL REFERENCES mission.missions(id) ON DELETE SET NULL (5th: mission) */
  missionId: string | null;
  /** db: jurisdiction_id — uuid NULL REFERENCES governance.jurisdictions(id) ON DELETE SET NULL */
  jurisdictionId: string | null;
  /** db: institution_id — uuid NULL REFERENCES institution.organizations(id) ON DELETE SET NULL */
  institutionId: string | null;
  /** db: information_disclosed — jsonb NOT NULL (6th: data disclosed/datos entregados) */
  informationDisclosed: Record<string, unknown>;
  /** db: access_decision_id — uuid NULL REFERENCES security.access_decisions(id) ON DELETE SET NULL (10th: audit/auditoría, via the linked decision record) */
  accessDecisionId: string | null;
  /** db: access_started_at — timestamptz NOT NULL DEFAULT now() (7th: start/inicio) */
  accessStartedAt: string;
  /** db: expires_at — timestamptz NOT NULL (8th: expiration/expiración) */
  expiresAt: string;
  /** db: revoked_at — timestamptz NULL (9th: revocation/revocación) */
  revokedAt: string | null;
  /**
   * NOT a physical column (see class-level doc comment) — the 10th D-08
   * audit fact ("incidente") documented here as a known open gap, never
   * silently fabricated as a real FK.
   */
  incidentIdGapNote?: "NOT_A_PHYSICAL_COLUMN_SEE_D08_NOTE";
}

/** `designation_status_enum` (default 'ACTIVE'). */
export type DesignationStatus = "ACTIVE" | "REVOKED";

/**
 * `ice.emergency_contact_designations` — captures what an
 * `identity.emergency_contacts` row is designated FOR within a person's
 * ICE profile. Distinct from `EmergencyContact` (VESTA, current schema —
 * `LEGACY_READ_ONLY` per D-03) and from `identity.emergency_contacts`
 * itself — see the name-collision note in identity.ts/D-03. Per D-08
 * (corrects the v1.0 mapping doc), NO current structure feeds this table —
 * `EmergencyContact.priority` (VESTA) is explicitly NOT a source.
 */
export interface EmergencyContactDesignation {
  /** db: id — uuid PK */
  id: string;
  /** db: emergency_profile_id — uuid NOT NULL REFERENCES ice.emergency_profiles(id) ON DELETE CASCADE */
  emergencyProfileId: string;
  /** db: emergency_contact_id — uuid NOT NULL REFERENCES identity.emergency_contacts(id) ON DELETE RESTRICT */
  emergencyContactId: string;
  /** db: priority — smallint NOT NULL DEFAULT 1 */
  priority: number;
  /** db: disclosure_scope — jsonb NULL */
  disclosureScope: Record<string, unknown> | null;
  /** db: status — DEFAULT 'ACTIVE' */
  status: DesignationStatus;
  /** db: created_at */
  createdAt: string;
  /** db: revoked_at */
  revokedAt: string | null;
}

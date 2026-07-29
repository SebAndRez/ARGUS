/**
 * src/lib/database-target/alert.ts
 *
 * Target-schema types for BC 12 (Alertas e Instrucciones Críticas), schema
 * `alert`. Mirrors `prisma/schema.target.prisma` models `Alert`/
 * `AlertAuthorization`/`CriticalInstruction`/`CriticalInstructionVersion`
 * (lines ~3287-3430), 4 of the 15 `alert.*` tables.
 *
 * Current model this replaces: NONE — today's "alert" is a read-side
 * projection of `KnowledgeIncident`/`ExternalEvent`, with no authorization
 * record of its own. `alert.*` is a completely new domain (CREATE_EMPTY,
 * Ola 7) that elevates that projection to a persisted entity with its own
 * authorization chain — an ADDITIONAL capability, not a replacement of the
 * existing canonical-mapper read path (`canonicalKnowledgeIncidentToArgusEvent()`).
 * `CriticalInstructionVersion`'s 3 integrity columns implement D-01
 * (frozen decision register) — see `IntegrityVersioning` in shared.ts.
 *
 * NOT a Prisma client. NOT imported by any existing runtime code. Pure
 * type declarations for future adapter work.
 */

import type { ActorType, InformationClassification, IntegrityVersioning } from "./shared";

/** `alert_kind_enum`. */
export type AlertKind = "INFORMATIONAL" | "PREVENTIVE" | "EMERGENCY";

/** Contract VO Audience, shared by `alert.alerts.audience` and `alert.critical_instruction_versions.audience`. */
export interface Audience {
  scope: string;
  geographicRef?: string;
  roleCodes?: string[];
  institutionIds?: string[];
  capabilityCodes?: string[];
}

/**
 * `alert.alerts` — a persisted alert with its own authorization record,
 * distinct from (and consumed independently of) the existing canonical
 * `ArgusEvent` read-side projection.
 */
export interface Alert {
  /** db: id — uuid PK */
  id: string;
  /** db: alert_kind */
  alertKind: AlertKind;
  /** db: incident_id — uuid NULL REFERENCES incident.incidents(id) ON DELETE SET NULL */
  incidentId: string | null;
  /** db: risk_assessment_id — uuid NULL REFERENCES risk.risk_assessments(id) ON DELETE SET NULL */
  riskAssessmentId: string | null;
  /** db: audience — jsonb NOT NULL, contract Audience */
  audience: Audience;
  /** db: audience_schema_version — integer NOT NULL DEFAULT 1 */
  audienceSchemaVersion: number;
  /** db: target_area — geography(MultiPolygon,4326) NULL, never leaked as raw WKT past the API boundary */
  targetArea: unknown | null;
  /** db: related_instruction_id — uuid NULL REFERENCES alert.critical_instructions(id) ON DELETE SET NULL */
  relatedInstructionId: string | null;
  /** db: classification — DEFAULT 'RESTRICTED' */
  classification: InformationClassification;
  /** db: created_at */
  createdAt: string;
}

/** `alert.alert_authorizations` — record of who/what allowed the emission. */
export interface AlertAuthorization {
  /** db: id */
  id: string;
  /** db: alert_id — uuid NOT NULL REFERENCES alert.alerts(id) ON DELETE RESTRICT */
  alertId: string;
  /** db: authorized_by_actor_type — actor_type_enum NOT NULL (POLYMORPHIC, no physical FK) */
  authorizedByActorType: ActorType;
  /** db: authorized_by_actor_id — uuid NOT NULL */
  authorizedByActorId: string;
  /** db: authorized_at */
  authorizedAt: string;
}

/** `critical_instruction_status_enum` (default 'ACTIVE'). */
export type CriticalInstructionStatus = "ACTIVE" | "CANCELLED";

/**
 * `alert.critical_instructions` — stable identity; prescribes concrete
 * action. Circular FK with `CriticalInstructionVersion` (its own
 * `currentVersionId`) is resolved via a 3-step creation transaction +
 * trigger (`trg_critical_instructions_version_consistency`, P2-01) — an
 * adapter must never attempt to set `currentVersionId` in the same INSERT
 * as the instruction's own row.
 */
export interface CriticalInstruction {
  /** db: id — uuid PK */
  id: string;
  /** db: current_version_id — uuid NULL REFERENCES alert.critical_instruction_versions(id) ON DELETE SET NULL */
  currentVersionId: string | null;
  /** db: status — DEFAULT 'ACTIVE' */
  status: CriticalInstructionStatus;
  /** db: incident_id — uuid NULL REFERENCES incident.incidents(id) ON DELETE SET NULL */
  incidentId: string | null;
  /** db: created_at */
  createdAt: string;
}

/** `directive_kind_enum`. */
export type DirectiveKind = "ORDER" | "RECOMMENDATION";

/** `version_status_enum` (default 'ACTIVE'). */
export type VersionStatus = "ACTIVE" | "SUPERSEDED" | "CANCELLED";

/**
 * `alert.critical_instruction_versions` — exact, immutable, cryptographically
 * chained content (corrects P0-02). The 3 `IntegrityVersioning` columns are
 * D-01 (frozen decision register): `signatureIntegrityValue` is never
 * computed/verified without an explicit `integrityAlgorithm` +
 * `canonicalizationVersion` pair — see `target-critical-instruction-version.test.ts`.
 */
export interface CriticalInstructionVersion extends IntegrityVersioning {
  /** db: id — uuid PK */
  id: string;
  /** db: critical_instruction_id — uuid NOT NULL REFERENCES alert.critical_instructions(id) ON DELETE RESTRICT */
  criticalInstructionId: string;
  /** db: version_number — integer NOT NULL */
  versionNumber: number;
  /** db: content — text NOT NULL */
  content: string;
  /** db: directive_kind */
  directiveKind: DirectiveKind;
  /** db: audience — jsonb NOT NULL, contract Audience (shared with alert.alerts.audience) */
  audience: Audience;
  /** db: audience_schema_version — integer NOT NULL DEFAULT 1 */
  audienceSchemaVersion: number;
  /** db: target_area — geography(MultiPolygon,4326) NULL */
  targetArea: unknown | null;
  /** db: authority_jurisdiction_id — uuid NULL REFERENCES governance.jurisdictions(id) ON DELETE SET NULL */
  authorityJurisdictionId: string | null;
  /** db: signed_by_actor_type — actor_type_enum NOT NULL (POLYMORPHIC, no physical FK) */
  signedByActorType: ActorType;
  /** db: signed_by_actor_id — uuid NOT NULL */
  signedByActorId: string;
  /** db: signature_integrity_value — text NOT NULL (HMAC per integrityAlgorithm/canonicalizationVersion) */
  signatureIntegrityValue: string;
  /** db: previous_version_id — uuid NULL REFERENCES alert.critical_instruction_versions(id) ON DELETE SET NULL */
  previousVersionId: string | null;
  /** db: next_version_id — uuid NULL REFERENCES alert.critical_instruction_versions(id) ON DELETE SET NULL */
  nextVersionId: string | null;
  /** db: supersedes_version_id — uuid NULL */
  supersedesVersionId: string | null;
  /** db: status — DEFAULT 'ACTIVE' */
  status: VersionStatus;
  /** db: effective_from */
  effectiveFrom: string;
  /** db: expires_at */
  expiresAt: string | null;
  /** db: change_reason */
  changeReason: string | null;
  /** db: created_at */
  createdAt: string;
}

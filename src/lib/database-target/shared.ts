/**
 * src/lib/database-target/shared.ts
 *
 * Cross-domain enum-like unions and value objects reused by more than one
 * target-schema type file (identity.ts, incident.ts, help.ts, resource.ts,
 * ice.ts). These are pure TypeScript `type`/`interface` declarations that
 * mirror the target Prisma schema documented in
 * `docs/architecture/private/ARGUS_PHYSICAL_TABLE_CATALOG_v1.1_FROZEN.md`
 * and `ARGUS_PHYSICAL_TABLE_CATALOG_v1.0.md`.
 *
 * IMPORTANT: this module is NOT wired into any existing runtime import.
 * It exists purely as a typed reference for future adapter/repository code
 * (see `ARGUS_DATABASE_COMPATIBILITY_LAYER_PLAN_v1.0.md` §2). Nothing here
 * is a Prisma client, and nothing here is imported by `src/app/**` or any
 * currently-running code path.
 *
 * Naming convention used throughout this directory: physical/DB columns are
 * `snake_case` (per the target catalog); TypeScript fields are `camelCase`,
 * each annotated with a `// db: <physical_column_name>` comment pointing
 * back to the column it mirrors.
 */

/** `information_classification_enum` — observed values across the target catalog. */
export type InformationClassification =
  | "PUBLIC"
  | "OPERATIONAL"
  | "SENSITIVE"
  | "RESTRICTED"
  | "CRITICAL";

/** `actor_type_enum` — discriminator for polymorphic actor references (command.command_roles, alert.critical_instruction_versions, etc.). */
export type ActorType = "PERSON" | "INSTITUTION" | "SYSTEM" | "AUTOMATED_PROCESS";

/** `confidence_level_enum` — used by evidence.observations, incident.incident_candidate_observations. */
export type ConfidenceLevel = "UNKNOWN" | "LOW" | "MEDIUM" | "HIGH" | "CONFIRMED";

/**
 * Five-column legacy-provenance extension (D-02, frozen decision register).
 * Added, per D-02, to every target table that receives backfill from a
 * current Prisma model. Not a physical table on its own — a shape mixed
 * into row types below via `LegacyProvenance`.
 */
export interface LegacyProvenance {
  /** db: legacy_status — original textual value, never normalized. */
  legacyStatus: string | null;
  /** db: legacy_source — name of the current Prisma model/table of origin. */
  legacySource: string | null;
  /** db: legacy_record_id — the original cuid() from the current schema. */
  legacyRecordId: string | null;
  /** db: migration_confidence */
  migrationConfidence: "HIGH" | "MEDIUM" | "LOW" | null;
  /** db: migration_review_status */
  migrationReviewStatus:
    | "AUTO_MAPPED"
    | "REQUIRES_REVIEW"
    | "REVIEWED_APPROVED"
    | "REVIEWED_REJECTED"
    | null;
}

/**
 * Cryptographic integrity-versioning columns (D-01, frozen decision
 * register). Present on `alert.critical_instruction_versions` and
 * `security.audit_logs`; referenced by tests/database-target/target-critical-instruction-version.test.ts.
 */
export interface IntegrityVersioning {
  /** db: integrity_algorithm — varchar(20) NOT NULL DEFAULT 'HMAC-SHA256' */
  integrityAlgorithm: string;
  /** db: canonicalization_version — integer NOT NULL DEFAULT 1 */
  canonicalizationVersion: number;
  /** db: integrity_key_id — varchar(50) NULL, references an external KMS key */
  integrityKeyId: string | null;
}

/** `geography(Point,4326)` projected back to the stable public lat/lng contract (per Compatibility Layer Plan §6 — PostGIS never leaks to API responses). */
export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/** Common append-only offline-sync columns seen on `evidence.observations`, `help.help_requests`, `comms.delivery_attempts`, etc. */
export interface OfflineSyncColumns {
  /** db: local_alias */
  localAlias: string | null;
  /** db: device_id */
  deviceId: string | null;
  /** db: operational_session_id */
  operationalSessionId: string | null;
  /** db: client_created_at */
  clientCreatedAt: string | null;
  /** db: received_at */
  receivedAt: string | null;
  /** db: reconciliation_status */
  reconciliationStatus: string | null;
}

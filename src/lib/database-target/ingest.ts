/**
 * src/lib/database-target/ingest.ts
 *
 * Target-schema types for BC 4 (Ingesta), schema `ingest`. Mirrors
 * `prisma/schema.target.prisma` models `Source`/`SourceConnector`/
 * `Provider`/`IngestionRun`/`SourceRecord`/`Transformation`/
 * `IngestionError` (lines ~1625-1748).
 *
 * Current models these replace conceptually (Ola 3, Executable Migration
 * Plan): `KnowledgeSource` (1 row) + the two live source-catalog pipelines
 * (`src/lib/vigia/sourceRegistry.ts`, `src/lib/knowledge-intake/
 * sourceRegistry.ts` — DUP-003, resolved read-only by
 * `adapters/sourceRegistryConsolidation.ts`, never merged into a single
 * static list) -> `Source`/`SourceConnector`; `IngestionRun`(3,405) +
 * `KnowledgeIngestionRun`(1,899) -> `IngestionRun` (fusion, discriminated by
 * `originKind` at the adapter layer, never a physical column); `ExternalEvent`
 * (1,904) -> `SourceRecord` (the real destination — `ExternalEvent` becomes
 * a LOGICAL classification of `SourceRecord.originKind`, never its own
 * target table, per the wave-3 mandate).
 *
 * NOT a Prisma client. NOT imported by any existing runtime code. Pure
 * type declarations for future adapter work.
 */

import type { InformationClassification, LegacyProvenance } from "./shared";

/** `source_status_enum` / `connector_status_enum` / `provider_status_enum` (identical 2-value set, default 'ACTIVE'). */
export type IngestActiveStatus = "ACTIVE" | "INACTIVE";

/**
 * `ingest.sources` — one row per (provider, endpoint) pair. The
 * `endpointSignature`+`providerId` unique pair is this table's real
 * external identity — never re-derived from a display `name`.
 */
export interface Source extends Partial<LegacyProvenance> {
  /** db: id — uuid PK */
  id: string;
  /** db: provider_id — uuid NOT NULL REFERENCES ingest.providers(id) ON DELETE RESTRICT */
  providerId: string;
  /** db: endpoint_signature — text NOT NULL, part of `uq_sources_provider_endpoint` */
  endpointSignature: string;
  /** db: name — varchar(255) NOT NULL */
  name: string;
  /** db: status — DEFAULT 'ACTIVE' */
  status: IngestActiveStatus;
  /** db: created_at */
  createdAt: string;
}

/** `ingest.source_connectors` — technical retrieval component, 1:1 with `Source`. */
export interface Connector {
  /** db: id — uuid PK */
  id: string;
  /** db: source_id — uuid NOT NULL UNIQUE REFERENCES ingest.sources(id) ON DELETE CASCADE */
  sourceId: string;
  /** db: config — jsonb NOT NULL (retrieval parameters: cadence, endpoint URL, auth env var name — never a secret value itself) */
  config: Record<string, unknown>;
  /** db: status — DEFAULT 'ACTIVE' */
  status: IngestActiveStatus;
}

/** `ingest.providers` — organization responsible for one or more Sources. */
export interface Provider {
  /** db: id — uuid PK */
  id: string;
  /** db: organization_id — uuid NULL REFERENCES institution.organizations(id) ON DELETE SET NULL */
  organizationId: string | null;
  /** db: name — varchar(255) NOT NULL */
  name: string;
  /** db: status — DEFAULT 'ACTIVE' */
  status: IngestActiveStatus;
}

/** `ingestion_run_status_enum` (default 'RUNNING'). */
export type IngestionRunStatus = "RUNNING" | "COMPLETED" | "FAILED";

/** `ingest.ingestion_runs` — one concrete collection cycle. Partitioned monthly by `startedAt` (SQL_COMPLEMENTARY_REQUIRED). */
export interface IngestionRun extends Partial<LegacyProvenance> {
  /** db: id — uuid PK */
  id: string;
  /** db: source_id — uuid NOT NULL REFERENCES ingest.sources(id) ON DELETE CASCADE */
  sourceId: string;
  /** db: idempotency_key — uuid NOT NULL, part of `uq_ingestion_runs_source_idempotency` */
  idempotencyKey: string;
  /** db: status — DEFAULT 'RUNNING' */
  status: IngestionRunStatus;
  /** db: started_at */
  startedAt: string;
  /** db: completed_at */
  completedAt: string | null;
}

/**
 * `source_record_origin_enum` — `EXTERNAL_EVENT` is the value that
 * discriminates a `SourceRecord` originating from the legacy
 * `ExternalEvent` model. `ExternalEvent` itself is NEVER modeled as its own
 * target table (wave-3 mandate) — it is exactly this logical
 * classification of `SourceRecord`.
 */
export type SourceRecordOrigin = "EXTERNAL_EVENT" | "DIRECT_CAPTURE" | "DERIVED";

/**
 * `ingest.source_records` — preserved, NEVER-mutated copy of external
 * content; the real target-schema destination of `ExternalEvent`.
 * `rawContent` is exempt from JSONB contract versioning (Relational Model
 * v1.1 Fase 10) — it is preserved verbatim, never normalized.
 */
export interface SourceRecord extends Partial<LegacyProvenance> {
  /** db: id — uuid PK */
  id: string;
  /** db: ingestion_run_id — uuid NOT NULL REFERENCES ingest.ingestion_runs(id) ON DELETE RESTRICT */
  ingestionRunId: string;
  /** db: source_id — uuid NOT NULL REFERENCES ingest.sources(id) ON DELETE RESTRICT */
  sourceId: string;
  /** db: origin_kind */
  originKind: SourceRecordOrigin;
  /** db: external_id — text NULL, part of the partial unique index `uq_source_records_source_external` (source_id, external_id) WHERE external_id IS NOT NULL */
  externalId: string | null;
  /** db: provenance — jsonb NOT NULL, contract `fn_validate_jsonb_shape('source_record_provenance', ...)` */
  provenance: Record<string, unknown>;
  /** db: raw_content — jsonb NOT NULL, preserved verbatim, never normalized */
  rawContent: Record<string, unknown>;
  /** db: content_hash — text NOT NULL */
  contentHash: string;
  /** db: classification — DEFAULT 'OPERATIONAL' */
  classification: InformationClassification;
  /** db: received_at */
  receivedAt: string;
  /** db: created_at */
  createdAt: string;
}

/** `ingest.transformations` — reinterpretation operation that never alters the original `SourceRecord`. `CREATE_EMPTY` per the Ola 3 plan (historical normalization was never recorded). */
export interface Transformation {
  /** db: id */
  id: string;
  /** db: source_record_id — uuid NOT NULL REFERENCES ingest.source_records(id) ON DELETE RESTRICT */
  sourceRecordId: string;
  /** db: operation — varchar(100) NOT NULL */
  operation: string;
  /** db: result — jsonb NOT NULL */
  result: Record<string, unknown>;
  /** db: created_at */
  createdAt: string;
}

/** `ingest.ingestion_errors` — ingestion failure. */
export interface IngestionError {
  /** db: id */
  id: string;
  /** db: ingestion_run_id — uuid NOT NULL REFERENCES ingest.ingestion_runs(id) ON DELETE CASCADE */
  ingestionRunId: string;
  /** db: error_code — varchar(50) NOT NULL */
  errorCode: string;
  /** db: detail — text NULL — never raw PII/content; see `observability/metrics.ts`'s no-PII discipline */
  detail: string | null;
  /** db: occurred_at */
  occurredAt: string;
}

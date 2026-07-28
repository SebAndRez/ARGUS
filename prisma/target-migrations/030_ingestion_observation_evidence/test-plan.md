# Wave 030 — Test Plan

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Before applying this wave

- `target-migration-order.test.ts` — sorts after `020_identity`; every FK to
  `identity.*`/`institution.*` resolves to a table already created.
- `target-migration-safety.test.ts` — no destructive statement against
  `ExternalEvent`/`IngestionRun`/`Report`/`KnowledgeEvidence`/
  `KnowledgeIngestionRun`/`TelecomConnectivityStatus`/`TelecomConnectivityEvidence`.

## After applying this wave

- `target-table-traceability.test.ts` — confirms both D-04 tables
  (`TelecomConnectivityStatus`, `TelecomConnectivityEvidence`) have a
  non-empty destination entry despite 0 rows to move (Decision Register D-04
  criterion of closure).
- `target-schema-target-validity.test.ts` — every table matches its ficha;
  `evidence.observations` checked field-for-field against the verbatim
  transcription (no `VERIFY_AGAINST_V1.0` flag on that one table).
- `target-model-count.test.ts` — 7+10=17 tables.
- `target-rls-coverage.test.ts` — all 17 tables RLS-enabled with >=1 policy.
- `target-migration-safety.test.ts` (post) — the `ON DELETE CASCADE` on
  `ingest.ingestion_errors.ingestion_run_id` is the only CASCADE in this
  wave and is intra-aggregate (an error record has no life independent of
  its run) — confirmed not crossing a BC boundary.

## Not covered by this wave's tests

- `target-help-request-close.test.ts`, `target-resource-reservation.test.ts`,
  `target-offline-identity.test.ts`, `target-geography-strategy.test.ts`,
  `target-critical-instruction-version.test.ts` — not applicable to this wave.

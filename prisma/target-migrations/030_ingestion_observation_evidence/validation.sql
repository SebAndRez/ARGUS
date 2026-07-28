-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 030 — Validation. SELECT-only.

SELECT table_schema, COUNT(*) FROM information_schema.tables
WHERE table_schema IN ('ingest','evidence') AND table_type = 'BASE TABLE'
GROUP BY table_schema ORDER BY table_schema;
-- Expected: ingest=7, evidence=10.

-- Fused ingestion_runs carries both legacy origins post-backfill
SELECT origin_kind, COUNT(*) FROM ingest.ingestion_runs GROUP BY origin_kind;
-- Expected (post-backfill): 'EXTERNAL_EVENT_PIPELINE' ~3405 rows,
-- 'GLOBAL_WATCH_PIPELINE' ~1899 rows (exact post-backfill counts "no
-- verificado" until the backfill script runs against real data).

-- evidence.observations CHECK constraints present
SELECT conname FROM pg_constraint
WHERE conname IN ('ck_observations_confidence_not_null','ck_observations_provenance_schema_version',
                  'ck_observations_claim_schema_version');
-- Expected: 3 rows.

-- RLS coverage
SELECT n.nspname, c.relname, c.relrowsecurity, COUNT(p.polname) AS policy_count
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname IN ('ingest','evidence') AND c.relkind = 'r'
GROUP BY n.nspname, c.relname, c.relrowsecurity
HAVING c.relrowsecurity = false OR COUNT(p.polname) = 0;
-- Expected: 0 rows.

-- GIST index on observations.location present
SELECT indexname FROM pg_indexes WHERE schemaname = 'evidence' AND indexname = 'gix_observations_location';
-- Expected: 1 row.

-- D-04 structural mapping present in source (illustrative label, not yet
-- backfilled since both current tables have 0 rows)
SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'observation_origin_enum';
-- Human check: confirm whether 'TELECOM_CONNECTIVITY_LEGACY' (or an approved
-- equivalent label) has been added to this enum before D-04's first real row.

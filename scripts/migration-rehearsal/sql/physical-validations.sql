-- NOT EXECUTED IN THIS SESSION (no local engine available).
-- Fase 11 — physical validations, run after Wave 100 has applied.
-- 100% SELECT — safe to run repeatedly, never mutates state.
\pset format unaligned
\pset tuples_only off

-- 1. Table count vs 168 models (schema.target.prisma models map 1:1 to
--    tables except TrustProfile, which is a projection with no table —
--    expect table count close to but not necessarily exactly 168; the exact
--    reconciliation is done by tests/database-target/target-model-count.test.ts
--    against schema.target.prisma directly, not by this query).
SELECT 'TOTAL_TABLES' AS check_name, count(*)::text AS value
FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema');

-- 2. Expected schemas present (20, per datasource.schemas in schema.target.prisma)
SELECT 'SCHEMAS_PRESENT' AS check_name, string_agg(schema_name, ',' ORDER BY schema_name) AS value
FROM information_schema.schemata
WHERE schema_name IN (
  'identity','institution','capability','ingest','evidence','incident','risk','command',
  'help','mission','resource','comms','alert','ice','community','media','security',
  'knowledge','governance','geo'
);

-- 3. Enum count
SELECT 'ENUM_COUNT' AS check_name, count(*)::text AS value
FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE t.typtype = 'e' AND n.nspname NOT IN ('pg_catalog','information_schema');

-- 4. No normal role has BYPASSRLS (migration_owner/app_api/ingest_worker/
--    jobs_worker/audit_reader/readonly_inspector must all be false)
SELECT 'ROLES_WITH_BYPASSRLS' AS check_name, coalesce(string_agg(rolname, ','), '(none — correct)') AS value
FROM pg_roles
WHERE rolbypassrls AND rolname IN ('migration_owner','app_api','ingest_worker','jobs_worker','audit_reader','readonly_inspector');

-- 5. app_api / ingest_worker / jobs_worker do not OWN tables (migration_owner
--    should own everything — ownership grants implicit RLS bypass for the owner
--    unless FORCE ROW LEVEL SECURITY is set, so absence of ownership by the
--    runtime roles is itself a structural RLS precondition worth checking).
SELECT 'TABLES_OWNED_BY_RUNTIME_ROLES' AS check_name, coalesce(string_agg(schemaname || '.' || tablename, ','), '(none — correct)') AS value
FROM pg_tables
WHERE tableowner IN ('app_api','ingest_worker','jobs_worker');

-- 6. Every OPERATIONAL+ classified table's schema has RLS enabled cluster-wide
--    (approximation: every non-pg_catalog table should have relrowsecurity=true
--    once Wave 010's rls_policies.sql / per-wave RLS statements have applied —
--    exceptions, if any, must be explicit and documented, never silent).
SELECT 'TABLES_WITHOUT_RLS' AS check_name, coalesce(string_agg(n.nspname || '.' || c.relname, ','), '(none — correct)') AS value
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND n.nspname NOT IN ('pg_catalog','information_schema','migration_meta')
  AND NOT c.relrowsecurity;

-- 7. security.audit_logs append-only: app_api/ingest_worker/jobs_worker
--    should have no UPDATE/DELETE grant on it.
SELECT 'AUDIT_LOGS_MUTABLE_GRANTS' AS check_name, coalesce(string_agg(grantee || ':' || privilege_type, ','), '(none — correct, append-only)') AS value
FROM information_schema.role_table_grants
WHERE table_schema = 'security' AND table_name LIKE 'audit_logs%'
  AND privilege_type IN ('UPDATE','DELETE')
  AND grantee IN ('app_api','ingest_worker','jobs_worker');

-- 8. Extensions actually present (must include postgis, pgcrypto)
SELECT 'EXTENSIONS' AS check_name, string_agg(extname, ',' ORDER BY extname) AS value FROM pg_extension;

-- 9. GEOMETRY validity spot-check on inserted fixture rows (bbox is never
--    used as the canonical geometry — geography(...) columns only).
SELECT 'INVALID_GEOMETRIES_ADMINISTRATIVE_AREAS' AS check_name, count(*)::text AS value
FROM geo.administrative_areas WHERE NOT ST_IsValid(boundary::geometry);

SELECT 'INVALID_GEOMETRIES_OBSERVATIONS' AS check_name, count(*)::text AS value
FROM evidence.observations WHERE location IS NOT NULL AND NOT ST_IsValid(location::geometry);

-- 10. Partitioned tables actually partitioned as documented (audit_logs,
--     ingestion_runs / source_records, delivery_attempts, incident_transitions)
SELECT 'PARTITIONED_TABLES' AS check_name, coalesce(string_agg(c.relname, ','), '(none found)') AS value
FROM pg_partitioned_table pt JOIN pg_class c ON c.oid = pt.partrelid;

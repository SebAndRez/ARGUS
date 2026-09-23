-- scripts/migration-rehearsal/sql/catalog-object-inventory.sql
--
-- Exact, diffable, per-object catalog inventory — one row per real object,
-- format `<CATEGORY>|<schema>.<name>` (or `<CATEGORY>|<name>` for
-- schema-less objects like roles/extensions). Used to build a reproducible
-- before/after comparison across a full rollback (Fase 3 of the corrective
-- mandate): capture this BEFORE wave 000 applies (empty baseline) and AFTER
-- the 100->000 rollback completes, then diff the two outputs line-by-line.
-- Every line present in the AFTER set but absent from the BEFORE set is a
-- residual object that must be classified (extension/system/harness/
-- legacy-fixture/ARGUS-expected/ARGUS-unexpected) — see Fase 3/4 handling
-- in Invoke-ArgusFullRehearsal.ps1 and Test-ArgusRehearsal.ps1.
--
-- Deliberately excludes pg_catalog/information_schema/pg_toast — those are
-- never ARGUS objects and never residue.

\pset format unaligned
\pset tuples_only on

-- Temporary namespaces (pg_temp_N / pg_toast_temp_N) are created by the
-- server for any session that uses a temp object (e.g. the pg_temp helper
-- functions of legacy-baseline/20_realistic_data.sql) and persist in the
-- catalog; they are never ARGUS objects.
SELECT 'SCHEMA|' || schema_name
FROM information_schema.schemata
WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
  AND schema_name NOT LIKE 'pg_temp_%'
  AND schema_name NOT LIKE 'pg_toast_temp_%'
ORDER BY 1;

-- Tables and views owned by an installed extension (pg_depend deptype
-- 'e', e.g. PostGIS spatial_ref_sys / geometry_columns / geography_columns,
-- which now live in schema `extensions` like on Supabase) are excluded exactly
-- as extension-owned functions/types/indexes already were below.
SELECT 'TABLE|' || t.schemaname || '.' || t.tablename
FROM pg_tables t
WHERE t.schemaname NOT IN ('pg_catalog', 'information_schema')
  AND NOT EXISTS (
    SELECT 1 FROM pg_depend d
    WHERE d.objid = format('%I.%I', t.schemaname, t.tablename)::regclass AND d.deptype = 'e'
  )
ORDER BY 1;

SELECT 'VIEW|' || v.schemaname || '.' || v.viewname
FROM pg_views v
WHERE v.schemaname NOT IN ('pg_catalog', 'information_schema')
  AND NOT EXISTS (
    SELECT 1 FROM pg_depend d
    WHERE d.objid = format('%I.%I', v.schemaname, v.viewname)::regclass AND d.deptype = 'e'
  )
ORDER BY 1;

SELECT 'MATVIEW|' || schemaname || '.' || matviewname
FROM pg_matviews
ORDER BY 1;

-- Functions AND procedures (prokind: f=function, p=procedure, a=aggregate, w=window).
-- Excludes objects owned by an installed extension (extconfig/pg_depend
-- 'e' dependency) — those are never ARGUS residue, they belong to
-- postgis/pgcrypto/etc and are correctly left alone by rollback.
SELECT 'FUNCTION|' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND NOT EXISTS (
    SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'
  )
ORDER BY 1;

SELECT 'TRIGGER|' || n.nspname || '.' || c.relname || '.' || t.tgname
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
ORDER BY 1;

SELECT 'POLICY|' || schemaname || '.' || tablename || '.' || policyname
FROM pg_policies
ORDER BY 1;

-- Enums/composite types/domains — excludes extension-owned types (postgis geometry/geography etc).
SELECT 'TYPE|' || n.nspname || '.' || t.typname
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND t.typtype IN ('e', 'c', 'd')
  AND NOT EXISTS (
    SELECT 1 FROM pg_depend d WHERE d.objid = t.oid AND d.deptype = 'e'
  )
  -- Composite types auto-created alongside every table (typrelid matches a
  -- real table's row type) are not independent objects — already covered
  -- by the TABLE rows above.
  AND NOT EXISTS (
    SELECT 1 FROM pg_class c WHERE c.oid = t.typrelid AND c.relkind = 'r'
  )
ORDER BY 1;

SELECT 'SEQUENCE|' || sequence_schema || '.' || sequence_name
FROM information_schema.sequences
WHERE sequence_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY 1;

-- Indexes NOT backing a PRIMARY KEY/UNIQUE constraint (those are already
-- implied by the constraint itself and would double-count residue) and NOT
-- owned by an extension.
SELECT 'INDEX|' || n.nspname || '.' || c.relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_index i ON i.indexrelid = c.oid
WHERE c.relkind = 'i'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND NOT EXISTS (SELECT 1 FROM pg_constraint co WHERE co.conindid = c.oid)
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
ORDER BY 1;

SELECT 'ROLE|' || rolname
FROM pg_roles
WHERE rolname NOT LIKE 'pg\_%'
ORDER BY 1;

SELECT 'EXTENSION|' || extname
FROM pg_extension
ORDER BY 1;

-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 080 — Validation. SELECT-only.

SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'geo' AND table_type = 'BASE TABLE';
-- Expected: 8.

-- D-07: administrative_areas has the 6 provenance columns and is empty
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'geo' AND table_name = 'administrative_areas'
  AND column_name IN ('source_id','source_version','effective_from','effective_to',
                       'acquisition_method','geometry_validation_status');
-- Expected: 6 rows.
SELECT COUNT(*) AS row_count FROM geo.administrative_areas;
-- Expected: 0 (D-07 CREATE_EMPTY — nonzero here means synthetic geometry was
-- inserted in violation of D-07, STOP and investigate).

-- Deferred FKs resolved
SELECT conname FROM pg_constraint WHERE conname IN
  ('fk_jurisdictions_primary_administrative_area','fk_exposed_populations_administrative_area',
   'fk_exposed_populations_operational_zone','fk_mmpa_meeting_point');
-- Expected: 4 rows.

-- GIST indexes present (7 expected — administrative_areas + 6 more; meeting/
-- extraction/reception all have one each)
SELECT indexname FROM pg_indexes WHERE schemaname = 'geo' AND indexname LIKE 'gix_%';
-- Expected: 8 rows.

-- RLS coverage — administrative_areas deliberately exempt (PUBLIC, Access
-- Control v1.1 §7), the other 7 tables must all have RLS + policy
SELECT c.relname, c.relrowsecurity, COUNT(p.polname) AS policy_count
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'geo' AND c.relkind = 'r'
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relname;
-- Expected: administrative_areas shows rowsecurity=false, policy_count=0 (by
-- design); the other 7 rows show rowsecurity=true, policy_count>=1.

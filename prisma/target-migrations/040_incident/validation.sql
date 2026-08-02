-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 040 — Validation. SELECT-only.

SELECT table_schema, COUNT(*) FROM information_schema.tables
WHERE table_schema IN ('incident','risk','command') AND table_type = 'BASE TABLE'
GROUP BY table_schema ORDER BY table_schema;
-- Expected: incident=17, risk=6, command=6.

-- D-02: 5 dimensions present and independently nullable/typed (never collapsed)
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'incident' AND table_name = 'incidents'
  AND column_name IN ('verification_status','operational_status','preventive_status','trend','structural_status');
-- Expected: 5 rows, 5 distinct udt_name values (5 distinct enum types) —
-- if any two share a udt_name, D-02's dimension separation was violated.

-- Deferred FK resolved
SELECT conname FROM pg_constraint WHERE conname = 'fk_audit_logs_incident';
-- Expected: 1 row.

-- RLS coverage across all 29 tables
SELECT n.nspname, c.relname, c.relrowsecurity, COUNT(p.polname) AS policy_count
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname IN ('incident','risk','command') AND c.relkind = 'r'
GROUP BY n.nspname, c.relname, c.relrowsecurity
HAVING c.relrowsecurity = false OR COUNT(p.polname) = 0;
-- Expected: 0 rows.

-- FK circular check — confirm NO circular FK exists in this wave (the only
-- documented cycle in the whole model is alert.critical_instructions, Wave 070)
SELECT conname, conrelid::regclass, confrelid::regclass
FROM pg_constraint c1
WHERE c1.contype = 'f' AND c1.connamespace IN ('incident'::regnamespace,'risk'::regnamespace,'command'::regnamespace)
  AND EXISTS (
    SELECT 1 FROM pg_constraint c2
    WHERE c2.contype = 'f' AND c2.confrelid = c1.conrelid AND c2.conrelid = c1.confrelid
  );
-- Expected: 0 rows.

-- GIST indexes present
SELECT indexname FROM pg_indexes
WHERE schemaname IN ('incident','risk') AND indexname LIKE 'gix_%';
-- Expected: 2 rows (gix_affected_area_versions_geometry, gix_risk_area_versions_geometry).
-- incident.incidents has no geography column of its own (not in the frozen
-- physical ficha, ARGUS_PHYSICAL_TABLE_CATALOG_v1.0.md §incident.incidents)
-- — geography lives on the child incident.affected_area_versions table.

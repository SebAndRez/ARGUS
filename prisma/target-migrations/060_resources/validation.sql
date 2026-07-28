-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 060 — Validation. SELECT-only.

SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'resource' AND table_type = 'BASE TABLE';
-- Expected: 10.

-- Single-extension trigger present
SELECT tgname FROM pg_trigger WHERE tgname = 'trg_resource_reservations_single_extension';
-- Expected: 1 row.

-- Anti-double-reservation partial unique index present
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'resource' AND indexname = 'uq_resource_reservations_active_resource';
-- Expected: 1 row, indexdef containing "WHERE" clause referencing status.

-- ck_resource_reservations_extension_bounds present
SELECT conname FROM pg_constraint WHERE conname = 'ck_resource_reservations_extension_bounds';
-- Expected: 1 row.

-- D-06: every resource.resources row has legacy_source='CriticalPoi' or is
-- a genuinely new resource (post-cutover) — no silent unattributed row
SELECT COUNT(*) FILTER (WHERE legacy_source IS NULL) AS new_resources,
       COUNT(*) FILTER (WHERE legacy_source = 'CriticalPoi') AS from_critical_poi
FROM resource.resources;
-- Informational — human review of the split ratio, not a pass/fail gate by itself.

-- RLS coverage
SELECT n.nspname, c.relname, c.relrowsecurity, COUNT(p.polname) AS policy_count
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'resource' AND c.relkind = 'r'
GROUP BY n.nspname, c.relname, c.relrowsecurity
HAVING c.relrowsecurity = false OR COUNT(p.polname) = 0;
-- Expected: 0 rows.

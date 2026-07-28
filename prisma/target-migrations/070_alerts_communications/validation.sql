-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 070 — Validation. SELECT-only.

SELECT table_schema, COUNT(*) FROM information_schema.tables
WHERE table_schema IN ('comms','alert') AND table_type = 'BASE TABLE'
GROUP BY table_schema ORDER BY table_schema;
-- Expected: comms=7, alert=8.

-- Circular FK fully resolved (both directions present)
SELECT conname, conrelid::regclass, confrelid::regclass FROM pg_constraint
WHERE conname IN ('fk_civ_critical_instruction','fk_critical_instructions_current_version');
-- Expected: 2 rows.

-- Both triggers present
SELECT tgname, tgrelid::regclass FROM pg_trigger
WHERE tgname IN ('trg_messages_content_kind_consistency','trg_critical_instructions_version_consistency');
-- Expected: 2 rows.

-- D-01 integrity chain columns match security.audit_logs column-for-column
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'alert' AND table_name = 'critical_instruction_versions'
  AND column_name IN ('integrity_algorithm','canonicalization_version','integrity_key_id')
ORDER BY column_name;
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'security' AND table_name = 'audit_logs'
  AND column_name IN ('integrity_algorithm','canonicalization_version','integrity_key_id')
ORDER BY column_name;
-- Expected: both queries return 3 rows each, with matching data_type per column name.

-- content_kind CHECK constraints present on all 4 delivery-chain tables
SELECT conname FROM pg_constraint
WHERE conname LIKE '%civ_required' OR conname LIKE '%civ_exclusive';
-- Expected: 6 rows (delivery_attempts x2, acknowledgements x2, comprehension_confirmations x2).

-- RLS coverage
SELECT n.nspname, c.relname, c.relrowsecurity, COUNT(p.polname) AS policy_count
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname IN ('comms','alert') AND c.relkind = 'r'
GROUP BY n.nspname, c.relname, c.relrowsecurity
HAVING c.relrowsecurity = false OR COUNT(p.polname) = 0;
-- Expected: 0 rows.

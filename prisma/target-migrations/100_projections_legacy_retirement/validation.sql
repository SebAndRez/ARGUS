-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 100 — Validation. SELECT-only.

SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'knowledge' AND table_type = 'BASE TABLE';
-- Expected: 11.

SELECT COUNT(*) FROM pg_matviews WHERE schemaname = 'proj';
-- Expected: 3 (trust_profiles, public_map_feed, _notification_feed_internal).
SELECT COUNT(*) FROM pg_views WHERE schemaname = 'proj';
-- Expected: 3 (trust_profile_detail, incident_timelines, mission_timelines,
-- public_alert_feed, operational_unit_member_counts,
-- legacy_vesta_preparedness_profiles) -- NOTE: 6 plain views + 3
-- materialized + 7 SECURITY DEFINER functions is the true physical
-- composition of the "11" logical proj.* entries; this query only counts
-- plain views, cross-check against pg_proc for the function-based ones below.
SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'proj' AND p.prosecdef = true;
-- Expected: 7 (notification_feed_for_actor, nearby_professional_feed,
-- institutional_view, assigned_unit_view, requester_view,
-- operational_context, incident_cards).

-- No application role may write to proj.* (transversal rule, Executable Plan
-- "Ola 10" §4).
SELECT grantee, table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'proj' AND privilege_type IN ('INSERT','UPDATE','DELETE')
  AND grantee IN ('app_api','ingest_worker','jobs_worker');
-- Expected: 0 rows.

-- P1-06: proj.public_map_feed must apply ST_Simplify before exposing
-- geometry — confirmed structurally by checking the view/matview definition
-- text contains 'ST_Simplify' (a text-search proxy since pg_matviews stores
-- the reconstructed SQL).
SELECT definition FROM pg_matviews WHERE schemaname = 'proj' AND matviewname = 'public_map_feed';
-- Expected: definition text contains 'ST_Simplify'.

-- D-03: proj.legacy_vesta_preparedness_profiles exists and performs zero
-- transformation (column-for-column passthrough, no CASE/computed columns
-- beyond straight SELECT of source columns).
SELECT COUNT(*) FROM pg_views WHERE schemaname = 'proj' AND viewname = 'legacy_vesta_preparedness_profiles';
-- Expected: 1.

-- knowledge.* — RLS coverage, all 11 tables.
SELECT c.relname, c.relrowsecurity, COUNT(p.polname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'knowledge' AND c.relkind = 'r'
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relname;
-- Expected: 11 rows, every one rowsecurity=true AND policy_count>=1.

-- Row-count parity check for the 3 knowledge.* tables with real backfill
-- (see backfill.sql / backfill-plan.md): lessons_learned should equal
-- KnowledgeLesson's current row count (0); knowledge_documents should equal
-- HazardKnowledgeDocument+KnowledgeDocument (59+0=59, pending dedup);
-- knowledge_facts should equal HazardKnowledgeFact (41).
SELECT
  (SELECT COUNT(*) FROM knowledge.lessons_learned) AS lessons_learned_count,
  (SELECT COUNT(*) FROM knowledge.knowledge_documents) AS knowledge_documents_count,
  (SELECT COUNT(*) FROM knowledge.knowledge_facts) AS knowledge_facts_count;
-- Expected (pre-backfill / structural-only check): all 0. Post-backfill.sql
-- (once run for real): 0, <=59 (dedup pending), 41 respectively.

-- The 2 confirmed-dead current tables must NOT have been dropped by this
-- draft package (retirement is documentary only, §5 of migration.sql).
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('ExternalEventCorrelation','KnowledgeEmbeddingRecord');
-- Expected: 2 rows (both still present — this migration package never
-- executes DDL against the current/public schema).

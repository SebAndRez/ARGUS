-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 090 — Validation. SELECT-only.

SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'ice' AND table_type = 'BASE TABLE';
-- Expected: 8.
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'media' AND table_type = 'BASE TABLE';
-- Expected: 8.
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'community' AND table_type = 'BASE TABLE';
-- Expected: 4.

-- D-08 / P2-09: emergency_profiles.id defaults to gen_random_uuid() (UUIDv4),
-- NOT the UUIDv7 dbgenerated() default used everywhere else in the target
-- schema — the one deliberate structural exception in the whole model,
-- to avoid a temporal metadata leak on the most sensitive table in the system.
SELECT column_default FROM information_schema.columns
WHERE table_schema = 'ice' AND table_name = 'emergency_profiles' AND column_name = 'id';
-- Expected: contains 'gen_random_uuid()', NOT 'uuid_generate_v7' or equivalent.

-- D-08: emergency_accesses carries all 10 audit-grade concepts required by
-- the Decision Register (actor type+id, purpose, basis, incident, mission,
-- data disclosed, granted_at, expires_at, revoked_at, plus the row's own
-- existence as the audit record).
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'ice' AND table_name = 'emergency_accesses'
  AND column_name IN ('actor_type','actor_id','purpose','emergency_basis_id',
                       'incident_id','mission_id','data_disclosed','granted_at',
                       'expires_at','revoked_at');
-- Expected: 10 rows.

-- emergency_accesses is append-only: INSERT policy exists, no UPDATE/DELETE
-- policy of any kind (revocation is modeled as a later INSERT-visible state,
-- never an UPDATE of a past row — see migration.sql comment).
SELECT polname, polcmd FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'ice' AND c.relname = 'emergency_accesses';
-- Expected: 2 rows, polcmd IN ('r','a') only ('r'=SELECT, 'a'=INSERT) —
-- 'w' (UPDATE) and 'd' (DELETE) must NOT appear.

-- RLS coverage — all 20 tables in this wave must have RLS enabled with >=1 policy.
SELECT n.nspname AS schema_name, c.relname, c.relrowsecurity, COUNT(p.polname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname IN ('ice','media','community') AND c.relkind = 'r'
GROUP BY n.nspname, c.relname, c.relrowsecurity
ORDER BY n.nspname, c.relname;
-- Expected: 20 rows, every one rowsecurity=true AND policy_count>=1 — no
-- exemption in this wave (unlike Wave 080's administrative_areas).

-- Zero rows in every table — this wave is CREATE_EMPTY end to end (D-08,
-- D-03, and media.* being a wholly new domain).
SELECT
  (SELECT COUNT(*) FROM ice.emergency_profiles) +
  (SELECT COUNT(*) FROM ice.medical_conditions) +
  (SELECT COUNT(*) FROM ice.allergies) +
  (SELECT COUNT(*) FROM ice.current_medications) +
  (SELECT COUNT(*) FROM ice.medical_devices) +
  (SELECT COUNT(*) FROM ice.special_needs) +
  (SELECT COUNT(*) FROM ice.emergency_accesses) +
  (SELECT COUNT(*) FROM ice.emergency_contact_designations) +
  (SELECT COUNT(*) FROM media.publications) +
  (SELECT COUNT(*) FROM media.live_streams) +
  (SELECT COUNT(*) FROM media.content_moderations) +
  (SELECT COUNT(*) FROM media.anonymizations) +
  (SELECT COUNT(*) FROM media.redactions) +
  (SELECT COUNT(*) FROM media.visual_maskings) +
  (SELECT COUNT(*) FROM media.usage_licenses) +
  (SELECT COUNT(*) FROM media.publication_authorizations) +
  (SELECT COUNT(*) FROM community.family_networks) +
  (SELECT COUNT(*) FROM community.dependents) +
  (SELECT COUNT(*) FROM community.community_groups) +
  (SELECT COUNT(*) FROM community.volunteers) AS total_rows_all_20_tables;
-- Expected: 0 (nonzero here means an unauthorized backfill ran against
-- D-08/D-03's explicit CREATE_EMPTY mandate — STOP and investigate).

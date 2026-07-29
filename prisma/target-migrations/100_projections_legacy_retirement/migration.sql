-- NOT EXECUTED
-- TARGET MIGRATION DRAFT
-- HUMAN REVIEW REQUIRED
--
-- Wave 100 — Projections & Legacy Retirement
-- Schemas: proj (11 views/materialized views — see §3 for the counting
-- convention, Table Catalog v1.1 §proj), knowledge (11 tables, all
-- CREATE_EMPTY — no knowledge.* schema exists in any prior wave's
-- migration.sql; see README.md for why all 11 land here rather than split
-- 3/8 against 090_ice_media as the executable plan's Wave 9 section had
-- originally sketched). Legacy retirement notes for the 33 current tables
-- per the frozen mapping's per-table "Retiro" column are in §6 (documentary
-- only — this package never modifies prisma/schema.prisma or
-- prisma/migrations/, per this session's hard constraint).
--
-- Authority: ARGUS_PHYSICAL_TABLE_CATALOG_v1.1_FROZEN.md §proj/§knowledge,
-- ARGUS_TARGET_CURRENT_MAPPING_v1.1_FROZEN.md §2 (Retiro column),
-- ARGUS_MIGRATION_DECISION_REGISTER_v1.0_FROZEN.md D-03, D-05,
-- ARGUS_EXECUTABLE_DATABASE_MIGRATION_PLAN_v1.0.md "Ola 10".
--
-- VERIFY_AGAINST_V1.0: proj.* view bodies are structural drafts derived from
-- Physical Table Catalog v1.1's source-column table (§proj) — the exact
-- SELECT list/joins are NOT given verbatim in any frozen document (views
-- are described by "fed by" + "refresh strategy" only), so every view body
-- below is a best-effort reconstruction, flagged individually, and MUST be
-- reviewed against the application's actual read patterns before use.

CREATE SCHEMA IF NOT EXISTS knowledge;
CREATE SCHEMA IF NOT EXISTS proj;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- 1. Local enums — knowledge.*
-- ============================================================
DO $$ BEGIN CREATE TYPE knowledge.aar_status_enum AS ENUM ('IN_PROGRESS','COMPLETED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE knowledge.finding_status_enum AS ENUM ('DRAFT','PUBLISHED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE knowledge.recommendation_review_status_enum AS ENUM ('PROPOSED','APPROVED','REJECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE knowledge.corrective_action_status_enum AS ENUM ('ADOPTED','IN_PROGRESS','COMPLETED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE knowledge.lesson_status_enum AS ENUM ('PENDING','APPROVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- VALUES_INFERRED — "Vigente" + default DRAFT, 3 values per Enums Reference Data #98
DO $$ BEGIN CREATE TYPE knowledge.procedure_status_enum AS ENUM ('DRAFT','ACTIVE','DEPRECATED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- VALUES_INFERRED — default DRAFT, 3 values per Enums Reference Data #99
DO $$ BEGIN CREATE TYPE knowledge.knowledge_document_status_enum AS ENUM ('DRAFT','PUBLISHED','DEPRECATED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE knowledge.fact_kind_enum AS ENUM ('FACT','EVIDENCE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE knowledge.simulation_status_enum AS ENUM ('PLANNED','EXECUTED','CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 2. knowledge schema — 11 tables
--    3 of these (lessons_learned, knowledge_documents, knowledge_facts)
--    receive REAL backfill (KnowledgeLesson=0, HazardKnowledgeDocument=59 +
--    KnowledgeDocument=0 fused, HazardKnowledgeFact=41) — see backfill.sql
--    and backfill-plan.md. The other 8 are CREATE_EMPTY, no current source.
-- ============================================================

-- AfterActionReview — structured post-incident evaluation. Never writes back to Layers 4-7.
CREATE TABLE IF NOT EXISTS knowledge.after_action_reviews (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(), -- UUIDv7 in production (dbgenerated), gen_random_uuid() here as portable draft placeholder
  incident_id  uuid NULL,
  status       knowledge.aar_status_enum NOT NULL DEFAULT 'IN_PROGRESS',
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  CONSTRAINT fk_aar_incident FOREIGN KEY (incident_id) REFERENCES incident.incidents(id) ON DELETE SET NULL
);

-- VERIFY_AGAINST_V1.0. Corrects HN-05 (own row, not embedded JSON).
CREATE TABLE IF NOT EXISTS knowledge.findings (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  after_action_review_id uuid NOT NULL,
  description            text NOT NULL,
  status                 knowledge.finding_status_enum NOT NULL DEFAULT 'DRAFT',
  published_at           timestamptz NULL,
  CONSTRAINT fk_findings_aar FOREIGN KEY (after_action_review_id) REFERENCES knowledge.after_action_reviews(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS knowledge.improvement_recommendations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id  uuid NOT NULL,
  description text NOT NULL,
  status      knowledge.recommendation_review_status_enum NOT NULL DEFAULT 'PROPOSED',
  CONSTRAINT fk_improvement_recommendations_finding FOREIGN KEY (finding_id) REFERENCES knowledge.findings(id) ON DELETE CASCADE
);

-- LessonLearned — validated, independent knowledge; can consolidate several Findings. Real backfill source: KnowledgeLesson (0 rows).
CREATE TABLE IF NOT EXISTS knowledge.lessons_learned (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description             text NOT NULL,
  status                  knowledge.lesson_status_enum NOT NULL DEFAULT 'PENDING',
  version                 int NOT NULL DEFAULT 1,
  legacy_status           text NULL,
  legacy_source           varchar(100) NULL,
  legacy_record_id        text NULL,
  migration_confidence    varchar(10) NULL,
  migration_review_status varchar(30) NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lessons_learned_legacy ON knowledge.lessons_learned (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS knowledge.corrective_actions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_learned_id uuid NOT NULL,
  description       text NOT NULL,
  status            knowledge.corrective_action_status_enum NOT NULL DEFAULT 'ADOPTED',
  CONSTRAINT fk_corrective_actions_lesson FOREIGN KEY (lesson_learned_id) REFERENCES knowledge.lessons_learned(id) ON DELETE CASCADE
);

-- NEW v1.1 — P1-01. Link table LessonLearned<->Finding, allows one LessonLearned to consolidate multiple Findings.
CREATE TABLE IF NOT EXISTS knowledge.lesson_learned_findings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_learned_id uuid NOT NULL,
  finding_id        uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_llf_lesson FOREIGN KEY (lesson_learned_id) REFERENCES knowledge.lessons_learned(id) ON DELETE CASCADE,
  CONSTRAINT fk_llf_finding FOREIGN KEY (finding_id) REFERENCES knowledge.findings(id) ON DELETE RESTRICT,
  CONSTRAINT uq_llf_lesson_finding UNIQUE (lesson_learned_id, finding_id)
);

-- Procedure — formalized operational steps (approval lives in Governance).
CREATE TABLE IF NOT EXISTS knowledge.procedures (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title   varchar(255) NOT NULL,
  version int NOT NULL DEFAULT 1,
  status  knowledge.procedure_status_enum NOT NULL DEFAULT 'DRAFT'
);

-- KnowledgeDocument — curated doctrinal/technical content (Aggregate Root, corrects P2-03). Real backfill source: HazardKnowledgeDocument(59)+KnowledgeDocument(0), FUSIONAR.
CREATE TABLE IF NOT EXISTS knowledge.knowledge_documents (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                   varchar(255) NOT NULL,
  version                 int NOT NULL DEFAULT 1,
  status                  knowledge.knowledge_document_status_enum NOT NULL DEFAULT 'DRAFT',
  legacy_status           text NULL,
  legacy_source           varchar(100) NULL,
  legacy_record_id        text NULL,
  migration_confidence    varchar(10) NULL,
  migration_review_status varchar(30) NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_documents_legacy ON knowledge.knowledge_documents (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL;
-- SQL_COMPLEMENTARY_REQUIRED (per schema.target.prisma comment): pg_trgm GIN index for title search.
CREATE INDEX IF NOT EXISTS ix_knowledge_documents_title_trgm ON knowledge.knowledge_documents USING GIN (title gin_trgm_ops);

-- KnowledgeFact/KnowledgeEvidence — structured assertion and its backing, grouped by discriminator. Real backfill source: HazardKnowledgeFact (41 rows), TRANSFORMAR.
CREATE TABLE IF NOT EXISTS knowledge.knowledge_facts (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_document_id   uuid NOT NULL,
  fact_kind               knowledge.fact_kind_enum NOT NULL,
  content                 text NOT NULL,
  legacy_status           text NULL,
  legacy_source           varchar(100) NULL,
  legacy_record_id        text NULL,
  migration_confidence    varchar(10) NULL,
  migration_review_status varchar(30) NULL,
  CONSTRAINT fk_knowledge_facts_document FOREIGN KEY (knowledge_document_id) REFERENCES knowledge.knowledge_documents(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_facts_legacy ON knowledge.knowledge_facts (legacy_source, legacy_record_id) WHERE legacy_record_id IS NOT NULL;

-- Simulation/Exercise — controlled scenario (Aggregate Root, corrects P2-03).
CREATE TABLE IF NOT EXISTS knowledge.simulations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      varchar(255) NOT NULL,
  status     knowledge.simulation_status_enum NOT NULL DEFAULT 'PLANNED',
  planned_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge.simulation_results (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id uuid NOT NULL,
  outcome       text NOT NULL,
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_simulation_results_simulation FOREIGN KEY (simulation_id) REFERENCES knowledge.simulations(id) ON DELETE RESTRICT
);

-- ============================================================
-- 3. proj schema — 11 views/materialized views (Table Catalog v1.1 §proj
--    counting convention: 9 named + the 5 role-parametric views grouped as
--    2 of the 11) + proj.legacy_vesta_preparedness_profiles (D-03, a 12th,
--    permanent, view — not counted in the "11" because it is not part of
--    the target model's own catalog, it is a transition-only artifact).
-- ============================================================

-- 3.1 proj.trust_profiles — materialized, refreshed by periodic job.
-- VERIFY_AGAINST_V1.0: exact banding thresholds not given in any frozen
-- document; drafted as a plausible aggregate, flagged for human review.
-- identity.reputation_events' column is trust_domain, not domain
-- (020_identity/migration.sql:188-201); it also has no evidence_id column -
-- removed from 3.2 below.
CREATE MATERIALIZED VIEW IF NOT EXISTS proj.trust_profiles AS
SELECT
  re.person_id,
  re.trust_domain,
  SUM(re.delta) AS aggregate_score,
  COUNT(*) AS event_count,
  MAX(re.occurred_at) AS last_event_at
FROM identity.reputation_events re
GROUP BY re.person_id, re.trust_domain
WITH NO DATA;
CREATE UNIQUE INDEX IF NOT EXISTS uq_trust_profiles_person_domain ON proj.trust_profiles (person_id, trust_domain);
-- SQL_COMPLEMENTARY_REQUIRED: REFRESH MATERIALIZED VIEW CONCURRENTLY proj.trust_profiles,
-- scheduled via jobs_worker on a periodic cadence (frequency not fixed by any frozen doc).

-- 3.2 proj.trust_profile_detail — simple view, always fresh. NEW v1.1 (P1-07).
CREATE OR REPLACE VIEW proj.trust_profile_detail AS
SELECT re.id, re.person_id, re.trust_domain, re.delta, re.reason, re.occurred_at
FROM identity.reputation_events re;

-- 3.3 proj.incident_timelines — simple view, always fresh.
-- incident.incident_transitions' columns are from_value/to_value, not
-- previous_value/new_value (040_incident/migration.sql:226-240).
CREATE OR REPLACE VIEW proj.incident_timelines AS
SELECT it.incident_id, it.dimension, it.from_value, it.to_value, it.transitioned_at
FROM incident.incident_transitions it;

-- 3.4 proj.mission_timelines — simple view, always fresh.
-- VERIFY_AGAINST_V1.0: "eventos de mission.*" is not enumerated verbatim in
-- any frozen document; drafted over the mission lifecycle columns available
-- on mission.missions itself pending a dedicated mission-event table design.
CREATE OR REPLACE VIEW proj.mission_timelines AS
SELECT m.id AS mission_id, m.status, m.created_at AS event_at, 'STATUS'::text AS event_kind
FROM mission.missions m;

-- 3.5 proj.public_map_feed — materialized, P1-06: ST_Simplify mandatory
-- before exposing any geometry. Job SELECTs only rows already in a public
-- state (Access Control v1.1 §9) — never applies its own authorization.
-- incident.incidents has no title column (040_incident/migration.sql:116-135) - removed.
CREATE MATERIALIZED VIEW IF NOT EXISTS proj.public_map_feed AS
SELECT
  i.id AS incident_id,
  i.operational_status,
  ST_Simplify(aav.geometry::geometry, 0.001)::geography AS simplified_geometry
FROM incident.incidents i
JOIN incident.affected_area_versions aav ON aav.incident_id = i.id
WHERE i.classification = 'PUBLIC'
WITH NO DATA;
-- SQL_COMPLEMENTARY_REQUIRED: tolerance_by_zoom (a single fixed 0.001 tolerance
-- is a placeholder — the real design needs one simplification tolerance per
-- zoom level, not given verbatim in any frozen document) + periodic refresh
-- job + event-driven invalidation (Table Catalog v1.1 §proj).

-- 3.6 proj.public_alert_feed — simple view, always fresh.
CREATE OR REPLACE VIEW proj.public_alert_feed AS
SELECT a.id, a.alert_kind, a.incident_id, a.audience, a.created_at
FROM alert.alerts a
JOIN alert.alert_authorizations aa ON aa.alert_id = a.id
WHERE a.classification = 'PUBLIC';

-- 3.7 proj.notification_feed_for_actor(actor_id) — RESTRUCTURADA v1.1
-- (P1-07): internal materialized view refreshed by job, exposed only via a
-- SECURITY DEFINER function that filters by recipient_actor_id per call —
-- replaces direct client exposure of a raw proj.notification_feed table.
-- VERIFY_AGAINST_V1.0: comms.messages/recipient columns are drafted from
-- Wave 070's migration.sql shape, not given verbatim in a Catalog ficha here.
-- Neither comms.messages nor the closest related table, comms.delivery_attempts
-- (070_alerts_communications/migration.sql:99-121), has a recipient_actor_id
-- or sent_at column - delivery_attempts only has endpoint_snapshot (jsonb)
-- and emergency_contact_id, neither of which is a queryable actor_id.
-- Disabled rather than guessed at a join, per the same "never guess"
-- precedent as D-06/D-07 elsewhere in this package - real design work is
-- needed to resolve recipient identity before this view/function can exist.
-- CREATE MATERIALIZED VIEW IF NOT EXISTS proj._notification_feed_internal AS
-- SELECT m.id AS message_id, m.recipient_actor_id, m.content_kind, m.sent_at
-- FROM comms.messages m
-- WITH NO DATA;
-- CREATE INDEX IF NOT EXISTS ix_notification_feed_internal_recipient ON proj._notification_feed_internal (recipient_actor_id);
--
-- CREATE OR REPLACE FUNCTION proj.notification_feed_for_actor(p_actor_id uuid)
-- RETURNS TABLE(message_id uuid, content_kind text, sent_at timestamptz)
-- LANGUAGE sql SECURITY DEFINER
-- SET search_path = pg_catalog, public
-- AS $$
--   SELECT nf.message_id, nf.content_kind, nf.sent_at
--   FROM proj._notification_feed_internal nf
--   WHERE nf.recipient_actor_id = p_actor_id;
-- $$;

-- 3.8 proj.nearby_professional_feed — parametric view, always fresh,
-- evaluated per actor.
CREATE OR REPLACE FUNCTION proj.nearby_professional_feed(p_actor_id uuid)
RETURNS TABLE(collaboration_invitation_id uuid, help_request_id uuid, status text)
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT ci.id, ci.help_request_id, ci.status::text
  FROM help.collaboration_invitations ci
  WHERE ci.status = 'OFFERED' AND ci.invited_person_id = p_actor_id;
$$;

-- 3.9 proj.operational_unit_member_counts — NEW v1.1 (P2-12), simple view,
-- always fresh. Substitutes the retired operational_units.member_count
-- stored column (never the source of truth going forward).
CREATE OR REPLACE VIEW proj.operational_unit_member_counts AS
SELECT oum.operational_unit_id, COUNT(*) AS member_count
FROM resource.operational_unit_members oum
GROUP BY oum.operational_unit_id;

-- 3.10 5 role-parametric views, grouped as 2 of the 11 per the Table Catalog
-- v1.1 counting convention. Each is a SECURITY DEFINER function, not a bare
-- view, since each filters by the calling actor's role/assignment.
-- VERIFY_AGAINST_V1.0: none of the 5 bodies is given verbatim in any frozen
-- document beyond the one-line "fed by" descriptions in Relational Model
-- v1.0 §"Vistas paramétricas de rol" — every body below is illustrative,
-- not a confirmed transcription.
-- incident.incidents has no title column (040_incident/migration.sql:116-135) - removed.
CREATE OR REPLACE FUNCTION proj.institutional_view(p_actor_id uuid, p_organization_id uuid)
RETURNS TABLE(incident_id uuid, operational_status text)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT i.id, i.operational_status::text FROM incident.incidents i
  WHERE security.fn_has_active_membership(p_actor_id, p_organization_id);
$$;

-- resource.operational_unit_members has no person_id column
-- (060_resources/migration.sql:71-83) - its person link is member_id,
-- discriminated by member_type = 'PERSON'.
CREATE OR REPLACE FUNCTION proj.assigned_unit_view(p_actor_id uuid)
RETURNS TABLE(operational_unit_id uuid, mission_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT oum.operational_unit_id, m.id FROM resource.operational_unit_members oum
  JOIN mission.missions m ON true
  WHERE oum.member_type = 'PERSON' AND oum.member_id = p_actor_id;
$$;

CREATE OR REPLACE FUNCTION proj.requester_view(p_actor_id uuid)
RETURNS TABLE(help_request_id uuid, status text)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT hr.id, hr.status::text FROM help.help_requests hr
  WHERE hr.requester_person_id = p_actor_id;
$$;

-- mission.missions has no incident_id column (050_help_mission/migration.sql:
-- 241-252) - incident_id is only reachable via operational_need_id ->
-- help.operational_needs.incident_id.
CREATE OR REPLACE FUNCTION proj.operational_context(p_actor_id uuid, p_mission_id uuid)
RETURNS TABLE(mission_id uuid, incident_id uuid, status text)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT m.id, on_.incident_id, m.status::text
  FROM mission.missions m
  JOIN help.operational_needs on_ ON on_.id = m.operational_need_id
  WHERE m.id = p_mission_id AND security.fn_has_active_assignment(p_actor_id, p_mission_id);
$$;

-- incident.incidents has no title column (040_incident/migration.sql:116-135) - removed.
CREATE OR REPLACE FUNCTION proj.incident_cards(p_incident_id uuid)
RETURNS TABLE(incident_id uuid, operational_status text, trend text)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT i.id, i.operational_status::text, i.trend::text FROM incident.incidents i
  WHERE i.id = p_incident_id;
$$;

-- 3.11 proj.legacy_vesta_preparedness_profiles — D-03, permanent read-only
-- projection of the 5 current VESTA tables, WITHOUT transformation. Not
-- counted in the "11" (transition artifact, not part of the target
-- catalog's own count) — exists so the VESTA UI never breaks during the
-- (indefinite, D-03-open) transition. References the CURRENT database's
-- public schema tables verbatim; this view definition does not require any
-- change to prisma/schema.prisma or prisma/migrations/ (it is a new object
-- in the target database, reading across into the still-untouched current
-- schema via a foreign/cross-schema reference at deploy time).
CREATE OR REPLACE VIEW proj.legacy_vesta_preparedness_profiles AS
SELECT
  pp.id AS preparedness_profile_id,
  pp."userId" AS legacy_user_id,
  fp.id AS family_plan_id,
  fp."medicalNeedsNotes" AS medical_needs_notes_unconverted,
  fp."primaryMeetingPoint" AS primary_meeting_point_unconverted
FROM public."PreparednessProfile" pp
-- FamilyPlan's FK field is "profileId", not "preparednessProfileId"
-- (prisma/schema.prisma: model FamilyPlan { profileId String @unique ... }).
LEFT JOIN public."FamilyPlan" fp ON fp."profileId" = pp.id;
-- SQL_COMPLEMENTARY_REQUIRED: EmergencyContact(VESTA)/PreparednessChecklistItem/
-- PreparednessReminder joins, omitted from this draft for brevity — same
-- "no transformation" principle applies to all 5 tables per D-03.

-- ============================================================
-- 4. RLS / grants for knowledge.* (proj.* has no RLS of its own — it
--    inherits from the underlying tables via SECURITY DEFINER + RLS on the
--    base relations; views/materialized views cannot carry RLS policies
--    directly in PostgreSQL)
-- ============================================================
ALTER TABLE knowledge.after_action_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.after_action_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY aar_institutional ON knowledge.after_action_reviews
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE knowledge.findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.findings FORCE ROW LEVEL SECURITY;
CREATE POLICY findings_inherit ON knowledge.findings
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN')
    OR EXISTS (SELECT 1 FROM knowledge.findings f WHERE f.id = id AND f.status = 'PUBLISHED') );

ALTER TABLE knowledge.improvement_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.improvement_recommendations FORCE ROW LEVEL SECURITY;
CREATE POLICY improvement_recommendations_institutional ON knowledge.improvement_recommendations
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE knowledge.lessons_learned ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.lessons_learned FORCE ROW LEVEL SECURITY;
CREATE POLICY lessons_learned_readable ON knowledge.lessons_learned
  FOR SELECT USING ( status = 'APPROVED' OR current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );
CREATE POLICY lessons_learned_write_institutional ON knowledge.lessons_learned
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE knowledge.corrective_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.corrective_actions FORCE ROW LEVEL SECURITY;
CREATE POLICY corrective_actions_institutional ON knowledge.corrective_actions
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE knowledge.lesson_learned_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.lesson_learned_findings FORCE ROW LEVEL SECURITY;
CREATE POLICY llf_institutional ON knowledge.lesson_learned_findings
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE knowledge.procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.procedures FORCE ROW LEVEL SECURITY;
CREATE POLICY procedures_public_active_or_institutional ON knowledge.procedures
  FOR SELECT USING ( status = 'ACTIVE' OR current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );
CREATE POLICY procedures_write_institutional ON knowledge.procedures
  FOR INSERT WITH CHECK ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );
CREATE POLICY procedures_update_institutional ON knowledge.procedures
  FOR UPDATE USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE knowledge.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.knowledge_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY knowledge_documents_published_or_institutional ON knowledge.knowledge_documents
  FOR SELECT USING ( status = 'PUBLISHED' OR current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );
CREATE POLICY knowledge_documents_write_institutional ON knowledge.knowledge_documents
  FOR INSERT WITH CHECK ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );
CREATE POLICY knowledge_documents_update_institutional ON knowledge.knowledge_documents
  FOR UPDATE USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE knowledge.knowledge_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.knowledge_facts FORCE ROW LEVEL SECURITY;
CREATE POLICY knowledge_facts_inherit ON knowledge.knowledge_facts
  FOR ALL USING ( EXISTS (SELECT 1 FROM knowledge.knowledge_documents kd WHERE kd.id = knowledge_document_id
    AND (kd.status = 'PUBLISHED' OR current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN'))) );

ALTER TABLE knowledge.simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.simulations FORCE ROW LEVEL SECURITY;
CREATE POLICY simulations_institutional ON knowledge.simulations
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

ALTER TABLE knowledge.simulation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.simulation_results FORCE ROW LEVEL SECURITY;
CREATE POLICY simulation_results_institutional ON knowledge.simulation_results
  FOR ALL USING ( current_setting('argus.actor_role', true) IN ('OPERATIONAL','ADMIN') );

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA knowledge TO app_api;
GRANT SELECT ON ALL TABLES IN SCHEMA knowledge TO readonly_inspector, jobs_worker;

-- Transversal rule (Executable Plan "Ola 10" §4): no application role has
-- write privilege on proj.* — it is a read-only projection layer end to end.
GRANT SELECT ON ALL TABLES IN SCHEMA proj TO app_api, ingest_worker, jobs_worker, readonly_inspector;
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA proj FROM app_api, ingest_worker, jobs_worker;
-- proj.notification_feed_for_actor(uuid) is disabled above (no recipient
-- identity column exists to support it) - its GRANT is removed too.
GRANT EXECUTE ON FUNCTION proj.nearby_professional_feed(uuid) TO app_api;
GRANT EXECUTE ON FUNCTION proj.institutional_view(uuid, uuid) TO app_api;
GRANT EXECUTE ON FUNCTION proj.assigned_unit_view(uuid) TO app_api;
GRANT EXECUTE ON FUNCTION proj.requester_view(uuid) TO app_api;
GRANT EXECUTE ON FUNCTION proj.operational_context(uuid, uuid) TO app_api;
GRANT EXECUTE ON FUNCTION proj.incident_cards(uuid) TO app_api;

-- ============================================================
-- 5. Retirement of confirmed-dead current tables (documentary DRAFT only —
--    NOT EXECUTED against prisma/schema.prisma or prisma/migrations/ by
--    this session or any artifact in this package; execution requires a
--    separate, human-run Prisma migration against the CURRENT schema,
--    outside this target-migrations tree, once the 4 acceptance criteria
--    in README.md §"Retirement acceptance criteria" are individually met)
-- ============================================================
-- ExternalEventCorrelation: 0 lectores, 0 escritores, 0 filas — confirmado
-- inerte por 2 verificaciones independientes (Baseline §1, §9). Su
-- propósito ya está cubierto por incident.incident_relations (Wave 040).
--   DRAFT (do not run): DROP TABLE IF EXISTS public."ExternalEventCorrelation";
--
-- KnowledgeEmbeddingRecord: 0 lectores, 0 escritores, 0 filas — confirmado
-- muerta (la "búsqueda semántica" real usa un array en memoria con tipo TS
-- del mismo nombre, nunca esta tabla). El objetivo tampoco modela embeddings.
--   DRAFT (do not run): DROP TABLE IF EXISTS public."KnowledgeEmbeddingRecord";

-- ============================================================
-- 6. Legacy retirement notes for the remaining 31 current tables — see
--    README.md §"Legacy retirement notes (33 current tables)" for the full
--    per-table transcription of ARGUS_TARGET_CURRENT_MAPPING_v1.1_FROZEN.md
--    §2's "Retiro" column. D-03 (VESTA's 5 tables) and D-05 (Sanction)
--    both stay LEGACY_READ_ONLY — this migration retires nothing from
--    either subtree, by design, not by omission.
-- ============================================================

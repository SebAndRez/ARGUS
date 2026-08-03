-- NOT EXECUTED IN THIS SESSION (no local PostgreSQL/PostGIS engine available)
-- Synthetic fixtures for the ARGUS full local migration rehearsal (Fase 10).
--
-- Runs ONLY after all 11 waves (000..100) have applied successfully — every
-- table and every FK, including the deliberately deferred
-- governance.jurisdictions -> geo.administrative_areas FK (added by Wave 080,
-- confirmed by reading prisma/target-migrations/010_foundation/migration.sql
-- and prisma/target-migrations/080_geography/migration.sql), exists by then.
-- This is why fixtures are NOT interleaved per-wave: object dependency order
-- and wave-application order diverge for exactly that one FK, and running
-- fixtures only at the end sidesteps the divergence entirely.
--
-- Every value below is fictitious: no real names, emails, national IDs,
-- phone numbers, or coordinates of real people or real incidents. Locations
-- use a synthetic point in the Pacific Ocean (0,0-ish offset grid) with no
-- correspondence to any real place.
--
-- Idempotent: fixed UUIDs + `ON CONFLICT (id) DO NOTHING` on every insert,
-- so re-running this script (e.g. after Fase 7's reapplication, or as part
-- of Fase 15's from-scratch reinstall) is safe and produces zero duplicates.
--
-- Wrapped in a single transaction: partial application of fixtures would
-- leave dangling FK targets for later statements in this same file, which is
-- strictly worse than an all-or-nothing failure surfaced by ON_ERROR_STOP.

BEGIN;

-- =============================================================================
-- 1. Governance lookups (no FK dependencies beyond each other)
-- =============================================================================

INSERT INTO governance.incident_categories (id, code, name) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'FIRE_HAZARD', 'Incendio (categoría sintética de ensayo)')
ON CONFLICT (id) DO NOTHING;

INSERT INTO governance.incident_types (id, code, incident_category_id, elevates_classification_to, version, effective_from) VALUES
  ('a0000000-0000-0000-0000-000000000011', 'WILDFIRE_TEST', 'a0000000-0000-0000-0000-000000000001', 'CRITICAL', 1, now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO governance.emergency_bases (id, category, description, max_access_duration, version, status) VALUES
  ('a0000000-0000-0000-0000-000000000021', 'LIFE_THREATENING', 'Base sintética de ensayo — riesgo vital', interval '2 hours', 1, 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

INSERT INTO governance.administrative_area_kinds (id, code, name, hierarchy_level, version, status, effective_from) VALUES
  ('a0000000-0000-0000-0000-000000000031', 'TEST_REGION', 'Región (sintética de ensayo)', 1, 1, 'ACTIVE', now())
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 2. Identity (schema identity) — Person, UserAccount, ReputationEvent (feeds TrustProfile projection)
-- =============================================================================
-- TrustProfile itself has no physical table in schema.target.prisma — it is
-- a read-time projection computed from identity.reputation_events (see
-- ARGUS_LOGICAL_ENTITY_CATALOG_v1.2_FROZEN.md, "TrustProfile" entry: "No —
-- Projection materializada... toda actualización proviene exclusivamente del
-- recálculo desde ReputationEvent"). These two ReputationEvent rows are what
-- exercises that projection at query time; there is no separate INSERT for
-- "TrustProfile" because there is no such table to insert into.

-- identity.people has no classification column (020_identity/migration.sql:90-104)
INSERT INTO identity.people (id, legal_name, display_alias, national_id_hash, contact_info, updated_at) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'Persona de Ensayo Uno', 'ensayo.uno', 'synthetic-hash-0000001', '{"note":"synthetic fixture, not a real person"}'::jsonb, now()),
  ('b0000000-0000-0000-0000-000000000002', 'Persona de Ensayo Dos', 'ensayo.dos', 'synthetic-hash-0000002', '{"note":"synthetic fixture, not a real person"}'::jsonb, now())
ON CONFLICT (id) DO NOTHING;

-- email is NOT NULL with no default (020_identity/migration.sql:110-128).
-- Distinct from fixtures/000_legacy_synthetic_fixtures.sql's User rows,
-- whose emails already flow into identity.user_accounts via Wave 020's real
-- backfill by the time this file runs.
INSERT INTO identity.user_accounts (id, person_id, email, status, auth_provider, updated_at) VALUES
  ('b0000000-0000-0000-0000-000000000011', 'b0000000-0000-0000-0000-000000000001', 'fixture-001-ensayo-uno@example.invalid', 'ACTIVE', 'synthetic-local', now())
ON CONFLICT (id) DO NOTHING;

-- column is trust_domain, not domain (020_identity/migration.sql:188-201)
INSERT INTO identity.reputation_events (id, person_id, trust_domain, delta, reason, occurred_at) VALUES
  ('b0000000-0000-0000-0000-000000000021', 'b0000000-0000-0000-0000-000000000001', 'GENERAL', 1.500, 'Ensayo local — evento sintético de reputación', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO identity.consents (id, person_id, purpose, version, granted_at) VALUES
  ('b0000000-0000-0000-0000-000000000031', 'b0000000-0000-0000-0000-000000000001', 'EMERGENCY_ACCESS', 1, now())
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 3. Institution (schema institution) — Organization ("Institution" logical name), InstitutionalMembership
-- =============================================================================

-- institution.organizations has "name" (not legal_name), no
-- has_formal_authority, and only created_at (not updated_at)
-- (020_identity/migration.sql:241-248)
INSERT INTO institution.organizations (id, name, registration_identifier, status, created_at) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'Organización de Ensayo', 'TEST-ORG-0001', 'ACTIVE', now())
ON CONFLICT (id) DO NOTHING;

-- column is role_label, not role_title (020_identity/migration.sql:261-273)
INSERT INTO institution.institutional_memberships (id, person_id, organization_id, role_label, status, effective_from) VALUES
  ('c0000000-0000-0000-0000-000000000011', 'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Coordinador de Ensayo', 'ACTIVE', now())
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 4. Geography (schema geo) — AdministrativeArea, MeetingPoint (must exist before Jurisdiction, per the deferred-FK note above)
-- =============================================================================

INSERT INTO geo.administrative_areas (id, name, area_kind_id, boundary, version) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'Área Administrativa de Ensayo',
   'a0000000-0000-0000-0000-000000000031',
   ST_GeogFromText('MULTIPOLYGON(((0 0, 0 0.01, 0.01 0.01, 0.01 0, 0 0)))'),
   1)
ON CONFLICT (id) DO NOTHING;

-- geo.meeting_points has no capacity/version columns
-- (080_geography/migration.sql:126-138); status default is 'PLANNED', enum
-- has no 'VIABLE' label - see geo.meeting_point_status_enum.
INSERT INTO geo.meeting_points (id, location, status) VALUES
  ('d0000000-0000-0000-0000-000000000011',
   ST_GeogFromText('POINT(0.005 0.005)'),
   'PLANNED')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 5. Jurisdiction (schema governance, but depends on geo.administrative_areas above)
-- =============================================================================

INSERT INTO governance.jurisdictions (id, name, primary_administrative_area_id, declaring_organization_id, version, effective_from) VALUES
  ('a0000000-0000-0000-0000-000000000041', 'Jurisdicción de Ensayo',
   'd0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000001',
   1, now())
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 6. Ingestion (schema ingest) — Provider("Institution" origin), Source, SourceConnector, IngestionRun, SourceRecord
-- =============================================================================

INSERT INTO ingest.providers (id, organization_id, name, status) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Proveedor de Ensayo', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

INSERT INTO ingest.sources (id, provider_id, endpoint_signature, name, status) VALUES
  ('e0000000-0000-0000-0000-000000000011', 'e0000000-0000-0000-0000-000000000001', 'synthetic://rehearsal-source', 'Fuente de Ensayo', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- connector_kind removed (030_ingestion.../migration.sql was reconciled
-- against schema.target.prisma's SourceConnector model, which has no such
-- field — config/status are the only non-key columns).
INSERT INTO ingest.source_connectors (id, source_id, config, status) VALUES
  ('e0000000-0000-0000-0000-000000000021', 'e0000000-0000-0000-0000-000000000011', '{"kind":"synthetic","note":"rehearsal fixture"}'::jsonb, 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- ingest.ingestion_runs, post-reconciliation: idempotency_key is uuid NOT
-- NULL (part of uq_ingestion_runs_source_idempotency); column is
-- completed_at (not finished_at); ingest.ingestion_run_status_enum is
-- RUNNING/COMPLETED/FAILED (not SUCCEEDED).
INSERT INTO ingest.ingestion_runs (id, source_id, idempotency_key, origin_kind, status, started_at, completed_at) VALUES
  ('e0000000-0000-0000-0000-000000000031', 'e0000000-0000-0000-0000-000000000011', 'e0000000-0000-0000-0000-000000000032', 'EXTERNAL_EVENT_PIPELINE', 'COMPLETED', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ingest.source_records, post-reconciliation: column is origin_kind (not
-- origin); provenance/content_hash are real NOT NULL columns now;
-- ingest.source_record_origin_enum is EXTERNAL_EVENT/DIRECT_CAPTURE/DERIVED
-- (matches schema.target.prisma's SourceRecordOrigin) — DIRECT_CAPTURE is
-- the closest fit for a manually-inserted fixture row.
INSERT INTO ingest.source_records (id, ingestion_run_id, source_id, origin_kind, external_id, provenance, raw_content, content_hash) VALUES
  ('e0000000-0000-0000-0000-000000000041', 'e0000000-0000-0000-0000-000000000031', 'e0000000-0000-0000-0000-000000000011',
   'DIRECT_CAPTURE', 'synthetic-ext-0001',
   '{"chain":[{"step_kind":"synthetic_fixture"}]}'::jsonb,
   '{"note":"synthetic fixture raw content, not real external data"}'::jsonb,
   'synthetic-fixture-content-hash-0001')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 7. Evidence (schema evidence) — Observation ("Report" logical name), EvidenceRecord
-- =============================================================================

-- evidence.observation_origin_enum, post-reconciliation: PRIMARY/DERIVED
-- (matches schema.target.prisma's OriginType) — a citizen-authored row is
-- PRIMARY (author_type carries the CITIZEN/PROFESSIONAL/INSTITUTIONAL
-- distinction separately).
INSERT INTO evidence.observations (
  id, origin_type, author_type, author_person_id, source_record_id,
  claim_text, claim_structured, provenance, location, occurred_at, reported_at,
  verification_status, confidence_level
) VALUES (
  'f0000000-0000-0000-0000-000000000001', 'PRIMARY', 'CITIZEN', 'b0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000041',
  'Observación sintética de ensayo — humo visible en zona de prueba',
  '{"domain":"fire"}'::jsonb,
  '{"chain":[{"step_kind":"synthetic_fixture"}],"depth":1}'::jsonb,
  ST_GeogFromText('POINT(0.004 0.004)'),
  now(), now(),
  'UNVERIFIED', 'MEDIUM'
)
ON CONFLICT (id) DO NOTHING;

-- evidence.evidence_records, post-reconciliation: column is chain_of_custody
-- (jsonb NOT NULL, not structured_content); evidence.evidence_origin_enum is
-- PRIMARY/DERIVED (matches schema.target.prisma's OriginType, not
-- INTERNAL/EXTERNAL).
INSERT INTO evidence.evidence_records (id, evidence_origin, classification, chain_of_custody) VALUES
  ('f0000000-0000-0000-0000-000000000011', 'PRIMARY', 'OPERATIONAL',
   '{"chain":[{"step_kind":"synthetic_fixture","actor_type":"PERSON"}]}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 8. Incident (schema incident) — IncidentCandidate, Incident
-- =============================================================================

-- incident.incident_candidates, post-reconciliation: correlation_key/
-- classification/promotion_started_at are real columns now (all
-- nullable/defaulted), so the minimal (id, status) insert below still
-- succeeds unchanged.
INSERT INTO incident.incident_candidates (id, status) VALUES
  ('10000000-0000-0000-0000-000000000001', 'PROMOTED')
ON CONFLICT (id) DO NOTHING;

INSERT INTO incident.incident_candidate_observations (id, incident_candidate_id, observation_id, correlation_confidence) VALUES
  ('10000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'MEDIUM')
ON CONFLICT (id) DO NOTHING;

-- incident.incidents, post-reconciliation: title is a real NOT NULL column
-- now (added); incident_verification_status_enum is
-- UNCONFIRMED/PARTIALLY_CONFIRMED/CONFIRMED/DISPUTED (matches
-- schema.target.prisma, not UNVERIFIED/PENDING/VERIFIED/DISPUTED);
-- incident_structural_status_enum is INDEPENDENT/PARENT/CHILD/MERGED/SPLIT
-- (matches schema.target.prisma, not SINGLE/MERGED/SPLIT/SUB_INCIDENT/RELATED).
INSERT INTO incident.incidents (
  id, verification_status, operational_status, preventive_status, trend, structural_status,
  incident_type_id, classification, title
) VALUES (
  '10000000-0000-0000-0000-000000000021',
  'UNCONFIRMED', 'ACTIVE', 'NONE', 'UNKNOWN', 'INDEPENDENT',
  'a0000000-0000-0000-0000-000000000011', 'CRITICAL', 'Incidente sintético de ensayo'
)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 9. Help / Mission (schemas help, mission) — HelpRequest, AffectedPerson, OperationalNeed, Mission
-- =============================================================================

INSERT INTO help.help_requests (id, incident_id, requester_person_id, status, classification, location) VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000021', 'b0000000-0000-0000-0000-000000000002',
   'RECEIVED', 'SENSITIVE', ST_GeogFromText('POINT(0.003 0.003)'))
ON CONFLICT (id) DO NOTHING;

-- column is status (not affectation_status), and help.affected_people has no
-- classification column (050_help_mission/migration.sql:185-193)
INSERT INTO help.affected_people (id, help_request_id, person_id, status) VALUES
  ('20000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'AT_RISK')
ON CONFLICT (id) DO NOTHING;

-- help.operational_needs has no help_request_id/classification columns
-- (050_help_mission/migration.sql:175-182); help.operational_need_status_enum
-- has no 'IDENTIFIED' label (OPEN/IN_PROGRESS/FULFILLED/CANCELLED only).
INSERT INTO help.operational_needs (id, incident_id, description, status) VALUES
  ('20000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000021',
   'Necesidad sintética de ensayo — evacuación', 'OPEN')
ON CONFLICT (id) DO NOTHING;

INSERT INTO mission.missions (id, operational_need_id, status, classification, objective) VALUES
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000021', 'CREATED', 'CRITICAL',
   '{"mission_kind":"EVACUATION","success_criteria":"synthetic fixture — evacuate test zone"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 10. Resource (schema resource) — Resource, ResourceReservation
-- =============================================================================

-- resource.resources has no institutional_identifier/location/classification
-- columns (060_resources/migration.sql:44-56)
INSERT INTO resource.resources (id, resource_type, owner_organization_id, status) VALUES
  ('40000000-0000-0000-0000-000000000001', 'VEHICLE', 'c0000000-0000-0000-0000-000000000001',
   'AVAILABLE')
ON CONFLICT (id) DO NOTHING;

INSERT INTO resource.resource_reservations (id, mission_id, resource_id, status, expires_at, idempotency_key) VALUES
  ('40000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
   'PENDING_CONFIRMATION', now() + interval '15 minutes', '40000000-0000-0000-0000-000000000011')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 11. Alert / CriticalInstruction (schema alert) — circular FK resolved via 2-step insert + UPDATE
-- =============================================================================

INSERT INTO alert.critical_instructions (id, current_version_id, status, incident_id) VALUES
  ('50000000-0000-0000-0000-000000000001', NULL, 'ACTIVE', '10000000-0000-0000-0000-000000000021')
ON CONFLICT (id) DO NOTHING;

-- alert.directive_kind_enum has no 'ORDER' label (MANDATORY/RECOMMENDED only)
INSERT INTO alert.critical_instruction_versions (
  id, critical_instruction_id, version_number, content, directive_kind, audience,
  authority_jurisdiction_id, signed_by_actor_type, signed_by_actor_id, signature_integrity_value
) VALUES (
  '50000000-0000-0000-0000-000000000011', '50000000-0000-0000-0000-000000000001', 1,
  'Instrucción crítica sintética de ensayo — evacuar zona de prueba', 'MANDATORY',
  '{"scope":"AREA"}'::jsonb,
  'a0000000-0000-0000-0000-000000000041', 'PERSON', 'b0000000-0000-0000-0000-000000000001',
  'synthetic-hmac-not-a-real-signature'
)
ON CONFLICT (id) DO NOTHING;

UPDATE alert.critical_instructions
   SET current_version_id = '50000000-0000-0000-0000-000000000011'
 WHERE id = '50000000-0000-0000-0000-000000000001'
   AND current_version_id IS NULL;

-- alert.alert_kind_enum has no 'EMERGENCY' label (WARNING/EVACUATION/ALL_CLEAR only)
INSERT INTO alert.alerts (id, alert_kind, incident_id, audience, related_instruction_id, classification) VALUES
  ('50000000-0000-0000-0000-000000000021', 'EVACUATION', '10000000-0000-0000-0000-000000000021',
   '{"scope":"AREA"}'::jsonb, '50000000-0000-0000-0000-000000000001', 'RESTRICTED')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 12. Communications (schema comms) — CommunicationPlan, Message, DeliveryAttempt, Acknowledgement
-- =============================================================================
-- content_kind on messages/delivery_attempts/acknowledgements is expected to
-- be enforced/overwritten by trg_messages_content_kind_consistency and the
-- application-copy pattern documented in schema.target.prisma; the values
-- below are chosen to already match what that trigger should produce for
-- owner_table='missions' (content_kind='MESSAGE'), so the fixture is
-- consistent even if the trigger is a strict CHECK rather than a rewrite.

INSERT INTO comms.communication_plans (id, owner_table, owner_id, status) VALUES
  ('60000000-0000-0000-0000-000000000001', 'missions', '30000000-0000-0000-0000-000000000001', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

INSERT INTO comms.messages (id, communication_plan_id, content_kind, content, classification, status) VALUES
  ('60000000-0000-0000-0000-000000000011', '60000000-0000-0000-0000-000000000001', 'MESSAGE',
   'Mensaje sintético de ensayo', 'OPERATIONAL', 'SENT')
ON CONFLICT (id) DO NOTHING;

INSERT INTO comms.delivery_attempts (id, message_id, content_kind, critical_instruction_version_id, endpoint_snapshot, status) VALUES
  ('60000000-0000-0000-0000-000000000021', '60000000-0000-0000-0000-000000000011', 'MESSAGE', NULL,
   '{"channel":"synthetic","address":"synthetic-endpoint"}'::jsonb, 'DELIVERED')
ON CONFLICT (id) DO NOTHING;

INSERT INTO comms.acknowledgements (id, delivery_attempt_id, content_kind, critical_instruction_version_id) VALUES
  ('60000000-0000-0000-0000-000000000031', '60000000-0000-0000-0000-000000000021', 'MESSAGE', NULL)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 13. ICE (schema ice) — EmergencyProfile, EmergencyAccess (also exercises EmergencyConsent via identity.consents above)
-- =============================================================================

-- ice.emergency_profiles has no classification/updated_at columns
-- (090_ice_media/migration.sql:47-53)
INSERT INTO ice.emergency_profiles (id, person_id) VALUES
  ('70000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ice.emergency_accesses has no jurisdiction_id/institution_id columns, and
-- the disclosed-data column is data_disclosed, not information_disclosed
-- (090_ice_media/migration.sql:118-135)
INSERT INTO ice.emergency_accesses (
  id, emergency_profile_id, actor_type, actor_id, emergency_basis_id, purpose,
  mission_id, data_disclosed, expires_at
) VALUES (
  '70000000-0000-0000-0000-000000000011', '70000000-0000-0000-0000-000000000001',
  'PERSON', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000021',
  'Acceso sintético de ensayo — verificación de RLS bajo EmergencyBasis',
  '30000000-0000-0000-0000-000000000001',
  '{"disclosed":["synthetic field only"]}'::jsonb,
  now() + interval '2 hours'
)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- security.access_subjects / security.access_role_assignments
-- =============================================================================
-- The authorization substrate. Without these rows the rehearsal database has
-- schemas and policies but nobody authorized by anything, and every RLS
-- positive case would be indistinguishable from a deny-everything suite.
--
-- Created through the canonical SECURITY DEFINER functions rather than by
-- direct INSERT, so the fixtures exercise the same validated, audited path the
-- administration API uses — and so a broken grant function fails the rehearsal
-- here instead of silently later.
--
-- Deliberately spans the cases the classification matrix needs: a
-- CRITICAL-ceiling operator, a PUBLIC-only one, a machine identity, an
-- institution-scoped grant, and one already-expired grant.
DO $$
DECLARE
  v_one uuid;
  v_two uuid;
  v_sys uuid;
BEGIN
  IF to_regclass('security.access_subjects') IS NULL THEN
    RAISE NOTICE 'ARGUS_FIXTURE_ACCESS_SUBJECTS_SKIPPED (wave 020 not applied)';
    RETURN;
  END IF;

  v_one := security.fn_register_access_subject('PERSON', 'b0000000-0000-0000-0000-000000000001');
  v_two := security.fn_register_access_subject('PERSON', 'b0000000-0000-0000-0000-000000000002');
  v_sys := security.fn_register_access_subject('SYSTEM', NULL, NULL, NULL, 'ARGUS_REHEARSAL_RUNTIME');

  -- Persona Uno: full operational clearance (ceiling CRITICAL), global, any
  -- purpose. This is the subject the RLS positives resolve against.
  PERFORM security.fn_grant_access_role(v_one, 'OPERATIONAL', NULL, 'GENERAL', now() - interval '1 day', NULL,
                                        NULL, 'REHEARSAL_FIXTURE', 'c0000000-0000-0000-0000-0000000000a1');
  -- Persona Dos: PUBLIC only, so "insufficient clearance" is a real state and
  -- not merely "unknown actor".
  PERFORM security.fn_grant_access_role(v_two, 'PUBLIC_VIEWER', NULL, 'GENERAL', now() - interval '1 day', NULL,
                                        NULL, 'REHEARSAL_FIXTURE', 'c0000000-0000-0000-0000-0000000000a2');
  -- The service identity the canonical audit writer runs as. SYSTEM is what
  -- security.audit_logs' INSERT policy requires.
  PERFORM security.fn_grant_access_role(v_sys, 'SYSTEM', NULL, 'GENERAL', now() - interval '1 day', NULL,
                                        NULL, 'REHEARSAL_FIXTURE', 'c0000000-0000-0000-0000-0000000000a3');
  -- Institution-scoped grant: authorizes only while the session declares this
  -- institution.
  PERFORM security.fn_grant_access_role(v_two, 'RESTRICTED_ANALYST', 'c0000000-0000-0000-0000-000000000001', 'GENERAL',
                                        now() - interval '1 day', NULL, v_one, 'REHEARSAL_FIXTURE',
                                        'c0000000-0000-0000-0000-0000000000a4');
  -- Already expired: must never authorize.
  PERFORM security.fn_grant_access_role(v_two, 'SENSITIVE_HANDLER', NULL, 'GENERAL',
                                        now() - interval '10 days', now() - interval '1 day', v_one,
                                        'REHEARSAL_FIXTURE', 'c0000000-0000-0000-0000-0000000000a5');

  RAISE NOTICE 'ARGUS_FIXTURE_ACCESS_SUBJECTS_OK subjects=3 assignments=5';
END $$;

COMMIT;

-- Post-insert sanity notes (verified by
-- scripts/migration-rehearsal/Test-ArgusRehearsal.ps1, not by this file):
--   - Re-running this entire script must produce zero duplicate rows and zero
--     errors (ON CONFLICT (id) DO NOTHING on every table above).
--   - This file has never been executed against any database in this
--     session — no local PostgreSQL/PostGIS engine was available. First real
--     execution should be treated as a first draft: column/constraint
--     mismatches surfaced by ON_ERROR_STOP are real errors to fix here, not
--     to explain away.

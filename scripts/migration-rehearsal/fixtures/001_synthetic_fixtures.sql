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

INSERT INTO identity.people (id, legal_name, display_alias, national_id_hash, contact_info, classification, updated_at) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'Persona de Ensayo Uno', 'ensayo.uno', 'synthetic-hash-0000001', '{"note":"synthetic fixture, not a real person"}'::jsonb, 'OPERATIONAL', now()),
  ('b0000000-0000-0000-0000-000000000002', 'Persona de Ensayo Dos', 'ensayo.dos', 'synthetic-hash-0000002', '{"note":"synthetic fixture, not a real person"}'::jsonb, 'OPERATIONAL', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO identity.user_accounts (id, person_id, status, auth_provider, updated_at) VALUES
  ('b0000000-0000-0000-0000-000000000011', 'b0000000-0000-0000-0000-000000000001', 'ACTIVE', 'synthetic-local', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO identity.reputation_events (id, person_id, domain, delta, reason, occurred_at) VALUES
  ('b0000000-0000-0000-0000-000000000021', 'b0000000-0000-0000-0000-000000000001', 'GENERAL', 1.500, 'Ensayo local — evento sintético de reputación', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO identity.consents (id, person_id, purpose, version, granted_at) VALUES
  ('b0000000-0000-0000-0000-000000000031', 'b0000000-0000-0000-0000-000000000001', 'EMERGENCY_ACCESS', 1, now())
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 3. Institution (schema institution) — Organization ("Institution" logical name), InstitutionalMembership
-- =============================================================================

INSERT INTO institution.organizations (id, legal_name, registration_identifier, has_formal_authority, status, updated_at) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'Organización de Ensayo', 'TEST-ORG-0001', true, 'ACTIVE', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO institution.institutional_memberships (id, person_id, organization_id, role_title, status, effective_from) VALUES
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

INSERT INTO geo.meeting_points (id, location, capacity, status, version) VALUES
  ('d0000000-0000-0000-0000-000000000011',
   ST_GeogFromText('POINT(0.005 0.005)'),
   50, 'VIABLE', 1)
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

INSERT INTO ingest.source_connectors (id, source_id, config, status) VALUES
  ('e0000000-0000-0000-0000-000000000021', 'e0000000-0000-0000-0000-000000000011', '{"kind":"synthetic","note":"rehearsal fixture"}'::jsonb, 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

INSERT INTO ingest.ingestion_runs (id, source_id, idempotency_key, status, started_at, completed_at) VALUES
  ('e0000000-0000-0000-0000-000000000031', 'e0000000-0000-0000-0000-000000000011', 'e0000000-0000-0000-0000-000000000031', 'COMPLETED', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO ingest.source_records (id, ingestion_run_id, source_id, origin_kind, external_id, provenance, raw_content, content_hash, classification) VALUES
  ('e0000000-0000-0000-0000-000000000041', 'e0000000-0000-0000-0000-000000000031', 'e0000000-0000-0000-0000-000000000011',
   'DIRECT_CAPTURE', 'synthetic-ext-0001',
   '{"chain":[{"step_kind":"synthetic_fixture"}]}'::jsonb,
   '{"note":"synthetic fixture raw content, not real external data"}'::jsonb,
   'synthetic-hash-source-record-0001', 'OPERATIONAL')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 7. Evidence (schema evidence) — Observation ("Report" logical name), EvidenceRecord
-- =============================================================================

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

INSERT INTO evidence.evidence_records (id, origin_type, classification, chain_of_custody, consent_id) VALUES
  ('f0000000-0000-0000-0000-000000000011', 'PRIMARY', 'OPERATIONAL',
   '{"chain":[{"step_kind":"synthetic_fixture","actor_type":"PERSON"}]}'::jsonb,
   'b0000000-0000-0000-0000-000000000031')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 8. Incident (schema incident) — IncidentCandidate, Incident
-- =============================================================================

INSERT INTO incident.incident_candidates (id, status, correlation_key, classification) VALUES
  ('10000000-0000-0000-0000-000000000001', 'PROMOTED', 'synthetic-correlation-0001', 'OPERATIONAL')
ON CONFLICT (id) DO NOTHING;

INSERT INTO incident.incident_candidate_observations (id, incident_candidate_id, observation_id, correlation_confidence) VALUES
  ('10000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'MEDIUM')
ON CONFLICT (id) DO NOTHING;

INSERT INTO incident.incidents (
  id, origin_candidate_id, verification_status, operational_status, preventive_status, trend, structural_status,
  incident_type_id, classification, title, description
) VALUES (
  '10000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000001',
  'UNCONFIRMED', 'ACTIVE', 'NONE', 'UNKNOWN', 'INDEPENDENT',
  'a0000000-0000-0000-0000-000000000011', 'CRITICAL',
  'Incidente de Ensayo', 'Incidente sintético creado por el ensayo local de migración — no representa un evento real'
)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 9. Help / Mission (schemas help, mission) — HelpRequest, AffectedPerson, OperationalNeed, Mission
-- =============================================================================

INSERT INTO help.help_requests (id, incident_id, requester_person_id, status, classification, location) VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000021', 'b0000000-0000-0000-0000-000000000002',
   'RECEIVED', 'SENSITIVE', ST_GeogFromText('POINT(0.003 0.003)'))
ON CONFLICT (id) DO NOTHING;

INSERT INTO help.affected_people (id, help_request_id, person_id, affectation_status, classification) VALUES
  ('20000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'AT_RISK', 'SENSITIVE')
ON CONFLICT (id) DO NOTHING;

INSERT INTO help.operational_needs (id, incident_id, help_request_id, description, status, classification) VALUES
  ('20000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000001',
   'Necesidad sintética de ensayo — evacuación', 'IDENTIFIED', 'OPERATIONAL')
ON CONFLICT (id) DO NOTHING;

INSERT INTO mission.missions (id, operational_need_id, status, classification, objective) VALUES
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000021', 'CREATED', 'CRITICAL',
   '{"mission_kind":"EVACUATION","success_criteria":"synthetic fixture — evacuate test zone"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 10. Resource (schema resource) — Resource, ResourceReservation
-- =============================================================================

INSERT INTO resource.resources (id, resource_type, institutional_identifier, owner_organization_id, status, location, classification) VALUES
  ('40000000-0000-0000-0000-000000000001', 'VEHICLE', 'TEST-VEH-0001', 'c0000000-0000-0000-0000-000000000001',
   'AVAILABLE', ST_GeogFromText('POINT(0.002 0.002)'), 'OPERATIONAL')
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

INSERT INTO alert.critical_instruction_versions (
  id, critical_instruction_id, version_number, content, directive_kind, audience,
  authority_jurisdiction_id, signed_by_actor_type, signed_by_actor_id, signature_integrity_value
) VALUES (
  '50000000-0000-0000-0000-000000000011', '50000000-0000-0000-0000-000000000001', 1,
  'Instrucción crítica sintética de ensayo — evacuar zona de prueba', 'ORDER',
  '{"scope":"AREA"}'::jsonb,
  'a0000000-0000-0000-0000-000000000041', 'PERSON', 'b0000000-0000-0000-0000-000000000001',
  'synthetic-hmac-not-a-real-signature'
)
ON CONFLICT (id) DO NOTHING;

UPDATE alert.critical_instructions
   SET current_version_id = '50000000-0000-0000-0000-000000000011'
 WHERE id = '50000000-0000-0000-0000-000000000001'
   AND current_version_id IS NULL;

INSERT INTO alert.alerts (id, alert_kind, incident_id, audience, related_instruction_id, classification) VALUES
  ('50000000-0000-0000-0000-000000000021', 'EMERGENCY', '10000000-0000-0000-0000-000000000021',
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

INSERT INTO ice.emergency_profiles (id, person_id, classification, updated_at) VALUES
  ('70000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'CRITICAL', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO ice.emergency_accesses (
  id, emergency_profile_id, actor_type, actor_id, emergency_basis_id, purpose,
  mission_id, jurisdiction_id, institution_id, information_disclosed, expires_at
) VALUES (
  '70000000-0000-0000-0000-000000000011', '70000000-0000-0000-0000-000000000001',
  'PERSON', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000021',
  'Acceso sintético de ensayo — verificación de RLS bajo EmergencyBasis',
  '30000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000041', 'c0000000-0000-0000-0000-000000000001',
  '{"disclosed":["synthetic field only"]}'::jsonb,
  now() + interval '2 hours'
)
ON CONFLICT (id) DO NOTHING;

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

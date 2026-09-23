-- scripts/migration-rehearsal/sql/legacy-data-invariants.sql
--
-- BLOCKING data invariants for the realistic legacy baseline
-- (legacy-baseline/20_realistic_data.sql), run after waves 000-100 and their
-- backfills. Every check runs; failures are collected and raised together as
-- LEGACY_DATA_INVARIANTS_FAIL, so one run shows every problem at once.
-- Emits LEGACY_INVARIANT|<check>|<detail> per check and
-- LEGACY_DATA_INVARIANTS_PASS only when all of them hold.
--
-- These assert properties of the MIGRATION, derived from the source rows at
-- run time — never constants copied from a fixture — so they keep their
-- meaning if the baseline volumes change.

DO $$
DECLARE
  failures text[] := ARRAY[]::text[];
  r record;
  n bigint;
  m bigint;
  overlap_n bigint;
BEGIN
  ----------------------------------------------------------------------------
  -- 1. Reconciliation: every legacy row is accounted for exactly once.
  --    (source_table, target) pairs; `deferred` = migration_meta.legacy_deferred_rows.
  ----------------------------------------------------------------------------
  FOR r IN
    SELECT * FROM (VALUES
      ('AuditLog',                  'security.audit_logs',           'AuditLog',               false),
      ('User',                      'identity.people',               'User',                   false),
      ('User',                      'identity.user_accounts',        'User',                   false),
      ('Report',                    'evidence.observations',         'Report',                 false),
      ('IngestionRun',              'ingest.ingestion_runs',         'IngestionRun',           false),
      ('KnowledgeIngestionRun',     'ingest.ingestion_runs',         'KnowledgeIngestionRun',  false),
      ('ExternalEvent',             'ingest.source_records',         'ExternalEvent',          false),
      ('ExternalEvent',             'evidence.observations',         'ExternalEvent',          false),
      ('KnowledgeEvidence',         'evidence.evidence_records',     'KnowledgeEvidence',      false),
      ('IncidentTransition',        'incident.incident_transitions', 'IncidentTransition',     true),
      ('RiskAssessment',            'risk.risk_assessments',         'RiskAssessment',         true),
      ('RiskAssessmentRevision',    'risk.risk_assessment_revisions','RiskAssessmentRevision', true),
      ('HelpRequest',               'help.help_requests',            'HelpRequest',            true),
      ('HelpRequest',               'help.affected_people',          'HelpRequest',            true),
      ('HazardKnowledgeFact',       'knowledge.knowledge_facts',     'HazardKnowledgeFact',    true),
      ('HazardKnowledgeDocument',   'knowledge.knowledge_documents', 'HazardKnowledgeDocument',false),
      ('CriticalPoiStatusEvidence', NULL,                            NULL,                     true)
    ) v(src, tgt, legacy_source, uses_deferred)
  LOOP
    EXECUTE format('SELECT count(*) FROM %I', r.src) INTO n;
    IF r.tgt IS NULL THEN
      m := 0;
    ELSE
      -- duplicates: a legacy row must never produce two target rows
      EXECUTE format('SELECT count(*) - count(DISTINCT legacy_record_id) FROM %s WHERE legacy_source = %L', r.tgt, r.legacy_source) INTO m;
      IF m <> 0 THEN failures := failures || format('%s->%s: %s duplicate target rows', r.src, r.tgt, m); END IF;
      -- phantom: every target legacy id exists in the source
      EXECUTE format('SELECT count(*) FROM %s t WHERE t.legacy_source = %L AND NOT EXISTS (SELECT 1 FROM %I s WHERE s.id = t.legacy_record_id)',
                     r.tgt, r.legacy_source, r.src) INTO m;
      IF m <> 0 THEN failures := failures || format('%s->%s: %s target rows point at no legacy row', r.src, r.tgt, m); END IF;
      EXECUTE format('SELECT count(DISTINCT legacy_record_id) FROM %s WHERE legacy_source = %L', r.tgt, r.legacy_source) INTO m;
    END IF;
    IF r.uses_deferred THEN
      m := m + (SELECT count(*) FROM migration_meta.legacy_deferred_rows d WHERE d.source_table = r.src);
      IF r.tgt IS NOT NULL THEN
        EXECUTE format('SELECT count(*) FROM migration_meta.legacy_deferred_rows d WHERE d.source_table = %L AND EXISTS (SELECT 1 FROM %s t WHERE t.legacy_source = %L AND t.legacy_record_id = d.legacy_record_id)',
                       r.src, r.tgt, r.legacy_source) INTO overlap_n;
        IF overlap_n <> 0 THEN failures := failures || format('%s: %s rows both migrated and deferred', r.src, overlap_n); END IF;
      END IF;
    END IF;
    IF m <> n THEN
      failures := failures || format('%s->%s: source %s, accounted %s', r.src, coalesce(r.tgt, 'deferred'), n, m);
    END IF;
    RAISE NOTICE 'LEGACY_INVARIANT|reconcile|%->% source=% accounted=%', r.src, coalesce(r.tgt, 'deferred'), n, m;
  END LOOP;

  -- deferred rows must reference real legacy rows (no phantom deferrals)
  FOR r IN SELECT DISTINCT source_table FROM migration_meta.legacy_deferred_rows LOOP
    EXECUTE format('SELECT count(*) FROM migration_meta.legacy_deferred_rows d WHERE d.source_table = %L AND NOT EXISTS (SELECT 1 FROM %I s WHERE s.id = d.legacy_record_id)',
                   r.source_table, r.source_table) INTO n;
    IF n <> 0 THEN failures := failures || format('deferred %s: %s rows point at no legacy row', r.source_table, n); END IF;
  END LOOP;

  -- Derived identity rows: one consent per (User, accepted purpose), one
  -- reputation snapshot per User. A second backfill pass used to duplicate
  -- both (no unique index covered the legacy identity).
  SELECT (SELECT count(*) FILTER (WHERE "termsAcceptedAt" IS NOT NULL) + count(*) FILTER (WHERE "privacyAcceptedAt" IS NOT NULL) FROM "User"),
         (SELECT count(*) FROM identity.consents WHERE legacy_source = 'User') INTO n, m;
  IF n <> m THEN failures := failures || format('identity.consents: expected %s, found %s', n, m); END IF;
  RAISE NOTICE 'LEGACY_INVARIANT|reconcile|User->identity.consents expected=% found=%', n, m;
  SELECT (SELECT count(*) FROM "User"), (SELECT count(*) FROM identity.reputation_events WHERE legacy_source = 'User') INTO n, m;
  IF n <> m THEN failures := failures || format('identity.reputation_events: expected %s, found %s', n, m); END IF;
  RAISE NOTICE 'LEGACY_INVARIANT|reconcile|User->identity.reputation_events expected=% found=%', n, m;

  -- KnowledgeIncident: exactly one of incidents / incident_candidates
  SELECT count(*) INTO n FROM "KnowledgeIncident" ki
  WHERE (EXISTS (SELECT 1 FROM incident.incidents i WHERE i.legacy_source = 'KnowledgeIncident' AND i.legacy_record_id = ki.id))
      = (EXISTS (SELECT 1 FROM incident.incident_candidates c WHERE c.legacy_source = 'KnowledgeIncident' AND c.legacy_record_id = ki.id));
  IF n <> 0 THEN failures := failures || format('KnowledgeIncident: %s rows in both or neither of incidents/candidates', n); END IF;
  RAISE NOTICE 'LEGACY_INVARIANT|reconcile|KnowledgeIncident exactly-once violations=%', n;

  -- CriticalPoi: exactly one of route A (resources) / review queue
  SELECT count(*) INTO n FROM "CriticalPoi" cp
  WHERE (EXISTS (SELECT 1 FROM resource.resources x WHERE x.legacy_source = 'CriticalPoi' AND x.legacy_record_id = cp.id))
      = (EXISTS (SELECT 1 FROM migration_meta.critical_poi_review_queue q WHERE q.critical_poi_id = cp.id));
  IF n <> 0 THEN failures := failures || format('CriticalPoi: %s rows in both or neither of resources/review queue', n); END IF;
  SELECT (SELECT count(DISTINCT "poiId") FROM "CriticalPoiOperationalStatus"), (SELECT count(*) FROM resource.facilities WHERE legacy_source = 'CriticalPoi') INTO n, m;
  IF n <> m THEN failures := failures || format('CriticalPoiOperationalStatus: %s POIs, %s facilities', n, m); END IF;
  RAISE NOTICE 'LEGACY_INVARIANT|reconcile|CriticalPoi exactly-once, facilities=% of %', m, n;

  ----------------------------------------------------------------------------
  -- 2. Classification
  ----------------------------------------------------------------------------
  SELECT count(*) INTO n FROM incident.incidents i JOIN "KnowledgeIncident" ki ON ki.id = i.legacy_record_id
  WHERE i.legacy_source = 'KnowledgeIncident' AND upper(ki."verificationStatus") IN ('CANDIDATE','UNVERIFIED');
  IF n <> 0 THEN failures := failures || format('%s CANDIDATE/UNVERIFIED legacy incidents were promoted to incident.incidents', n); END IF;
  SELECT (SELECT count(*) FROM "KnowledgeIncident" WHERE upper("verificationStatus") IN ('CANDIDATE','UNVERIFIED')),
         (SELECT count(*) FROM incident.incident_candidates WHERE legacy_source = 'KnowledgeIncident') INTO n, m;
  IF n <> m THEN failures := failures || format('candidates: legacy %s, incident_candidates %s', n, m); END IF;
  RAISE NOTICE 'LEGACY_INVARIANT|classify|candidates legacy=% target=%', n, m;
  SELECT count(*) INTO n FROM incident.incidents i JOIN "KnowledgeIncident" ki ON ki.id = i.legacy_record_id
  WHERE i.legacy_source = 'KnowledgeIncident' AND upper(ki."verificationStatus") = 'OFFICIAL' AND i.verification_status::text <> 'CONFIRMED';
  IF n <> 0 THEN failures := failures || format('%s OFFICIAL legacy incidents not CONFIRMED', n); END IF;
  SELECT count(*) INTO n FROM incident.incidents i JOIN "KnowledgeIncident" ki ON ki.id = i.legacy_record_id
  WHERE i.legacy_source = 'KnowledgeIncident' AND ki.status IS NULL AND i.migration_review_status <> 'REQUIRES_REVIEW';
  IF n <> 0 THEN failures := failures || format('%s incidents with NULL legacy status not flagged REQUIRES_REVIEW', n); END IF;

  SELECT count(*) INTO n FROM help.help_requests h JOIN "HelpRequest" hr ON hr.id = h.legacy_record_id
  WHERE h.legacy_source = 'HelpRequest' AND (h.legacy_status IS DISTINCT FROM hr.status
     OR (upper(hr.status) IN ('RECEIVED','ASSIGNED','RESOLVED','CLOSED','CANCELLED') AND h.status::text <> upper(hr.status))
     OR (upper(hr.status) NOT IN ('RECEIVED','ASSIGNED','RESOLVED','CLOSED','CANCELLED') AND h.migration_review_status <> 'REQUIRES_REVIEW'));
  IF n <> 0 THEN failures := failures || format('%s help requests misclassified', n); END IF;
  RAISE NOTICE 'LEGACY_INVARIANT|classify|help_requests misclassified=%', n;

  SELECT count(*) INTO n FROM ingest.ingestion_runs t
  LEFT JOIN "IngestionRun" ir ON t.legacy_source = 'IngestionRun' AND ir.id = t.legacy_record_id
  LEFT JOIN "KnowledgeIngestionRun" k ON t.legacy_source = 'KnowledgeIngestionRun' AND k.id = t.legacy_record_id
  WHERE t.legacy_source IN ('IngestionRun','KnowledgeIngestionRun')
    AND (t.legacy_status IS DISTINCT FROM coalesce(ir.status, k.status)
      OR (lower(coalesce(ir.status, k.status)) IN ('success','completed') AND t.status::text <> 'COMPLETED')
      OR (lower(coalesce(ir.status, k.status)) IN ('error','failed') AND t.status::text <> 'FAILED')
      OR (lower(coalesce(ir.status, k.status)) = 'partial' AND (t.status::text <> 'COMPLETED' OR t.migration_review_status <> 'REQUIRES_REVIEW')));
  IF n <> 0 THEN failures := failures || format('%s ingestion runs misclassified', n); END IF;
  RAISE NOTICE 'LEGACY_INVARIANT|classify|ingestion_runs misclassified=%', n;

  SELECT count(*) INTO n FROM migration_meta.critical_poi_review_queue q JOIN "CriticalPoi" cp ON cp.id = q.critical_poi_id
  WHERE q.poi_category IS DISTINCT FROM cp.category;
  IF n <> 0 THEN failures := failures || format('%s review-queue rows with a category that is not the POI category', n); END IF;
  RAISE NOTICE 'LEGACY_INVARIANT|classify|critical_poi_review_queue wrong category=%', n;

  ----------------------------------------------------------------------------
  -- 3. Timestamps: target instant = legacy UTC wall time, exactly.
  ----------------------------------------------------------------------------
  SELECT count(*) INTO n FROM security.audit_logs a JOIN "AuditLog" al ON al.id = a.legacy_record_id
  WHERE a.legacy_source = 'AuditLog' AND a.occurred_at <> al."createdAt" AT TIME ZONE 'UTC';
  IF n <> 0 THEN failures := failures || format('%s audit rows with a shifted occurred_at', n); END IF;
  SELECT count(*) INTO n FROM security.audit_logs a JOIN "AuditLog" al ON al.id = a.legacy_record_id
  WHERE a.legacy_source = 'AuditLog' AND a.tableoid::regclass::text <> 'security.audit_logs_y' || to_char(al."createdAt", 'YYYY') || 'm' || to_char(al."createdAt", 'MM');
  IF n <> 0 THEN failures := failures || format('%s audit rows routed to a partition of another month', n); END IF;
  RAISE NOTICE 'LEGACY_INVARIANT|utc|audit_logs shifted-or-wrong-partition=%', n;
  SELECT
    (SELECT count(*) FROM incident.incident_candidates c JOIN "KnowledgeIncident" ki ON ki.id = c.legacy_record_id WHERE c.legacy_source = 'KnowledgeIncident' AND c.created_at <> ki."createdAt" AT TIME ZONE 'UTC')
  + (SELECT count(*) FROM incident.incidents i JOIN "KnowledgeIncident" ki ON ki.id = i.legacy_record_id WHERE i.legacy_source = 'KnowledgeIncident' AND i.created_at <> ki."createdAt" AT TIME ZONE 'UTC')
  + (SELECT count(*) FROM incident.incident_transitions t JOIN "IncidentTransition" it ON it.id = t.legacy_record_id WHERE t.legacy_source = 'IncidentTransition' AND t.occurred_at <> it."createdAt" AT TIME ZONE 'UTC')
  + (SELECT count(*) FROM evidence.observations o JOIN "ExternalEvent" ee ON ee.id = o.legacy_record_id WHERE o.legacy_source = 'ExternalEvent' AND o.occurred_at <> coalesce(ee."occurredAt", ee."fetchedAt", ee."createdAt") AT TIME ZONE 'UTC')
  + (SELECT count(*) FROM ingest.ingestion_runs t JOIN "IngestionRun" ir ON ir.id = t.legacy_record_id WHERE t.legacy_source = 'IngestionRun' AND t.started_at <> ir."fetchedAt" AT TIME ZONE 'UTC')
  + (SELECT count(*) FROM ingest.ingestion_runs t JOIN "KnowledgeIngestionRun" k ON k.id = t.legacy_record_id WHERE t.legacy_source = 'KnowledgeIngestionRun' AND t.started_at <> k."startedAt" AT TIME ZONE 'UTC')
  + (SELECT count(*) FROM identity.people p JOIN "User" u ON u.id = p.legacy_record_id WHERE p.legacy_source = 'User' AND p.created_at <> u."createdAt" AT TIME ZONE 'UTC')
  + (SELECT count(*) FROM help.help_requests h JOIN "HelpRequest" hr ON hr.id = h.legacy_record_id WHERE h.legacy_source = 'HelpRequest' AND h.created_at <> hr."createdAt" AT TIME ZONE 'UTC')
  + (SELECT count(*) FROM evidence.evidence_records e JOIN "KnowledgeEvidence" ke ON ke.id = e.legacy_record_id WHERE e.legacy_source = 'KnowledgeEvidence' AND e.created_at <> ke."createdAt" AT TIME ZONE 'UTC')
  INTO n;
  IF n <> 0 THEN failures := failures || format('%s migrated timestamps differ from the legacy UTC instant', n); END IF;
  RAISE NOTICE 'LEGACY_INVARIANT|utc|other tables shifted=%', n;

  ----------------------------------------------------------------------------
  -- 4. CUIDs: raw ids preserved, derived uuids reproducible, no uuid-casting.
  ----------------------------------------------------------------------------
  SELECT count(*) INTO n FROM security.audit_logs a JOIN "AuditLog" al ON al.id = a.legacy_record_id
  WHERE a.legacy_source = 'AuditLog' AND (
       a.context->>'legacyTargetId' IS DISTINCT FROM al."targetId"
    OR a.context->>'legacyActorUserId' IS DISTINCT FROM al."actorUserId"
    OR a.target_id <> CASE WHEN al."targetId" IS NULL THEN migration_meta.fn_legacy_uuid('legacy:AuditLog:no-target:' || al.id)
                           ELSE migration_meta.fn_legacy_uuid('legacy:' || al."targetType" || ':' || al."targetId") END
    OR a.actor_id <> CASE WHEN al."actorUserId" IS NULL THEN migration_meta.fn_legacy_uuid('legacy:AuditLog:unrecorded-actor')
                          ELSE migration_meta.fn_legacy_uuid('legacy:User:' || al."actorUserId") END);
  IF n <> 0 THEN failures := failures || format('%s audit rows lost or mis-derived a legacy cuid', n); END IF;
  SELECT count(*) INTO n FROM (
    SELECT legacy_record_id FROM identity.people WHERE legacy_source = 'User'
    UNION ALL SELECT legacy_record_id FROM incident.incidents WHERE legacy_source = 'KnowledgeIncident'
    UNION ALL SELECT legacy_record_id FROM incident.incident_candidates WHERE legacy_source = 'KnowledgeIncident'
    UNION ALL SELECT legacy_record_id FROM ingest.source_records WHERE legacy_source = 'ExternalEvent'
    UNION ALL SELECT legacy_record_id FROM security.audit_logs WHERE legacy_source = 'AuditLog'
  ) x WHERE legacy_record_id !~ '^c[a-z0-9]{24}$';
  IF n <> 0 THEN failures := failures || format('%s legacy_record_id values are not the original cuid', n); END IF;
  RAISE NOTICE 'LEGACY_INVARIANT|cuid|violations=%', n;

  ----------------------------------------------------------------------------
  -- 5. Audit preservation
  ----------------------------------------------------------------------------
  SELECT count(*) INTO n FROM security.audit_logs a JOIN "AuditLog" al ON al.id = a.legacy_record_id
  WHERE a.legacy_source = 'AuditLog' AND (a.action <> al.action OR a.target_table <> al."targetType"
     OR a.result <> coalesce(al.metadata, '{}') OR a.integrity_value !~ '^[0-9a-f]{64}$' OR a.integrity_key_id IS NULL);
  IF n <> 0 THEN failures := failures || format('%s audit rows changed content or lack a real integrity value/key id', n); END IF;
  RAISE NOTICE 'LEGACY_INVARIANT|audit|content-or-integrity violations=%', n;

  ----------------------------------------------------------------------------
  -- 6. D-08: no medical free text reaches any target schema; ice.* stays empty
  ----------------------------------------------------------------------------
  n := 0;
  FOR r IN
    SELECT c.table_schema, c.table_name, c.column_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema NOT IN ('public','pg_catalog','information_schema','extensions','migration_meta')
      AND c.data_type IN ('text','character varying','jsonb','json')
  LOOP
    EXECUTE format('SELECT count(*) FROM %I.%I WHERE %I::text LIKE %L', r.table_schema, r.table_name, r.column_name, '%SYNTHETIC-MEDICAL-NOTE%') INTO m;
    n := n + m;
  END LOOP;
  IF n <> 0 THEN failures := failures || format('%s target values contain legacy medical free text', n); END IF;
  SELECT (SELECT count(*) FROM ice.emergency_profiles) INTO m;
  IF m <> 0 THEN failures := failures || format('ice.emergency_profiles has %s rows (D-08: must stay empty)', m); END IF;
  RAISE NOTICE 'LEGACY_INVARIANT|d08|medical-text-in-target=% ice_rows=%', n, m;

  IF array_length(failures, 1) > 0 THEN
    RAISE EXCEPTION 'LEGACY_DATA_INVARIANTS_FAIL (%): %', array_length(failures, 1), array_to_string(failures, ' ; ');
  END IF;
  RAISE NOTICE 'LEGACY_DATA_INVARIANTS_PASS';
END $$;

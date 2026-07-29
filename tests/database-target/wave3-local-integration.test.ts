import { afterAll, describe, expect, it } from "vitest";
import { closeTargetPrismaClient, getTargetPrismaClient, type TargetPrismaClientLike } from "../../src/lib/database-target/client/targetPrismaClient";
import {
  externalEventToPrimaryObservation,
  externalEventToSourceRecord,
  ingestionExecutionToIngestionRun,
  sourceRegistryEntryToSource,
  sourceRegistryIntegrationToConnector,
  telecomConnectivityEvidenceToEvidence,
  knowledgeIncidentToIncidentCandidateResult,
  type LegacyExternalEventRecordFull,
  type LegacyIngestionExecution,
  type LegacyTelecomConnectivityEvidenceRecord,
} from "../../src/lib/database-target/adapters/wave3Transformers";
import type { LegacyKnowledgeIncidentRecord, LegacyStatusMappingTable } from "../../src/lib/database-target/adapters/incident";
import type { CanonicalSourceEntry } from "../../src/lib/database-target/adapters/sourceRegistryConsolidation";
import {
  linkObservationToIncidentCandidate,
  upsertConnector,
  upsertEvidence,
  upsertEvidenceAsset,
  upsertIncidentCandidate,
  upsertIngestionRun,
  upsertObservation,
  upsertProvider,
  upsertSource,
  upsertSourceRecord,
} from "../../src/lib/database-target/repositories/wave3Repository";

/**
 * Real Docker/Postgres+PostGIS integration test (Fase 11 of the wave-3
 * mandate). Skipped by default — `npm run db:target:test` stays
 * Docker-independent, matching every other file in this directory.
 * Runs only when BOTH `ARGUS_WAVE3_INTEGRATION_TEST=true` and
 * `TARGET_DATABASE_URL` (pointed at a local rehearsal database that has
 * already applied waves 000/010/020/030/040) are set — see
 * `scripts/migration-rehearsal/README.md` for how to bring that database
 * up, or the wave-3 progress doc for the exact commands used to verify
 * this test the first time.
 */
const shouldRun = process.env.ARGUS_WAVE3_INTEGRATION_TEST === "true" && Boolean(process.env.TARGET_DATABASE_URL);

describe.skipIf(!shouldRun)("wave3 local Docker integration — synthetic flow x2", () => {
  let client: TargetPrismaClientLike;

  afterAll(async () => {
    await closeTargetPrismaClient();
  });

  it("runs the full synthetic flow twice with zero duplicates and zero Incident promotion", async () => {
    client = await getTargetPrismaClient();

    // Baseline BEFORE running anything — the wave-040 migration rehearsal's
    // own synthetic backfill fixtures may already have promoted an
    // unrelated legacy row into incident.incidents as part of validating
    // wave 040's OWN backfill.sql (confirmed: legacy_record_id
    // 99000000-0000-0000-0000-000000000002, nothing to do with this test's
    // "ki_wave3_test" data). This test proves THIS FLOW never adds to that
    // count, not that the table is empty in absolute terms.
    const incidentCountBefore = await (client as unknown as { incident: { count: () => Promise<number> } }).incident.count();

    async function runFlow() {
      // 1. SourceRegistry entry (synthetic, deterministic — not dependent on live app registry contents).
      const entry: CanonicalSourceEntry = {
        id: "wave3_test_source",
        origins: ["vigia"],
        vigia: {
          id: "wave3_test_source",
          name: "Wave3 Test Source",
          coverage: "global",
          threatTypes: ["WILDFIRE"],
          reliabilityScore: 90,
          isOfficial: true,
          refreshIntervalMinutes: 15,
          endpoint: "https://example.test/feed",
          role: "incident",
          enabled: true,
        },
        knowledgeIntake: null,
        hasEnabledStateDrift: false,
      };

      // 2. Source
      const providerResult = await upsertProvider(client, { name: "Wave3 Test Provider" });
      const sourceResult = sourceRegistryEntryToSource(entry, { providerId: providerResult.targetId });
      expect(sourceResult.status).toBe("READY");
      const sourcePersist = await upsertSource(client, sourceResult.value!, sourceResult.idempotencyKey);

      // 3. Connector
      const connectorResult = sourceRegistryIntegrationToConnector(entry, sourcePersist.targetId);
      expect(connectorResult.status).toBe("READY");
      const connectorPersist = await upsertConnector(client, connectorResult.value!, connectorResult.idempotencyKey);

      // 4. IngestionRun
      const execution: LegacyIngestionExecution = {
        originKind: "LEGACY_INGESTION_RUN",
        id: "wave3_test_run",
        sourceId: sourcePersist.targetId,
        status: "success",
        fetchedAt: new Date("2026-01-01T00:00:00Z"),
        completedAt: new Date("2026-01-01T00:05:00Z"),
      };
      const runResult = ingestionExecutionToIngestionRun(execution, "cycle_wave3_test");
      expect(runResult.status).toBe("READY");
      const runPersist = await upsertIngestionRun(client, runResult.value!, runResult.idempotencyKey);

      // 5-6. ExternalEvent legacy synthetic -> SourceRecord
      const externalEvent: LegacyExternalEventRecordFull = {
        id: "ee_wave3_test",
        sourceId: sourcePersist.targetId,
        externalId: "ext_wave3_test",
        category: "wildfire",
        title: "Synthetic wildfire test event",
        description: "synthetic integration test content",
        severity: "high",
        confidence: 85,
        latitude: -33.45,
        longitude: -70.66,
        occurredAt: new Date("2026-01-01T00:00:00Z"),
        fetchedAt: new Date("2026-01-01T00:01:00Z"),
        raw: { synthetic: true },
        createdAt: new Date("2026-01-01T00:01:30Z"),
        ingestionRunId: runPersist.targetId,
      };
      const sourceRecordResult = externalEventToSourceRecord(externalEvent);
      expect(sourceRecordResult.status).toBe("READY");
      const sourceRecordPersist = await upsertSourceRecord(client, sourceRecordResult.value!, sourceRecordResult.idempotencyKey);

      // 7. PrimaryObservation
      const observationResult = externalEventToPrimaryObservation(externalEvent, sourceRecordPersist.targetId);
      expect(["READY", "REQUIRES_REVIEW"]).toContain(observationResult.status);
      const observationPersist = await upsertObservation(client, observationResult.value!, observationResult.idempotencyKey);

      // 8. Evidence (+ EvidenceAsset)
      const telecomEvidence: LegacyTelecomConnectivityEvidenceRecord = {
        id: "tce_wave3_test",
        subjectType: "region",
        regionKey: "CL:RM::all_carriers",
        poiId: null,
        eventType: "activated",
        sourceType: "official",
        sourceName: "Wave3 Test Authority",
        sourceUrl: "https://example.test/evidence",
        confidenceScore: 90,
        createdAt: new Date("2026-01-01T00:02:00Z"),
      };
      const evidenceResult = telecomConnectivityEvidenceToEvidence(telecomEvidence);
      expect(evidenceResult.status).toBe("READY");
      const evidencePersist = await upsertEvidence(client, evidenceResult.value!.evidence, evidenceResult.idempotencyKey);
      let assetPersist = null;
      if (evidenceResult.value!.asset) {
        assetPersist = await upsertEvidenceAsset(client, { ...evidenceResult.value!.asset, evidenceId: evidencePersist.targetId }, `${evidenceResult.idempotencyKey}:asset`);
      }

      // 9-10. KnowledgeIncident legacy synthetic -> 11. IncidentCandidate
      const knowledgeIncident: LegacyKnowledgeIncidentRecord = {
        id: "ki_wave3_test",
        title: "Synthetic wildfire incident",
        summary: "synthetic integration test summary",
        status: "active",
        verificationStatus: "confirmed",
        effectiveSeverity: "high",
        incidentTypeId: "wave3_test_incident_type",
        domain: "wildfire",
        subtype: null,
        confidenceLevel: "high",
        sourceId: sourcePersist.targetId,
        externalId: externalEvent.externalId,
        latitude: -33.45,
        longitude: -70.66,
        occurredAt: new Date("2026-01-01T00:00:00Z"),
        createdAt: new Date("2026-01-01T00:03:00Z"),
      };
      const mappingTable: LegacyStatusMappingTable = new Map([
        ["active|confirmed", { operationalStatus: "ACTIVE", verificationStatus: "CONFIRMED", preventiveStatus: "NONE", trend: "STABLE", structuralStatus: "INDEPENDENT" }],
      ]);
      const candidateResult = knowledgeIncidentToIncidentCandidateResult(knowledgeIncident, mappingTable);
      expect(candidateResult.status).toBe("READY");
      const candidatePersist = await upsertIncidentCandidate(client, candidateResult.value!, candidateResult.idempotencyKey);

      const linkResult = await linkObservationToIncidentCandidate(client, {
        incidentCandidateId: candidatePersist.targetId,
        observationId: observationPersist.targetId,
        correlationConfidence: "HIGH",
      });

      return {
        providerId: providerResult.targetId,
        sourceId: sourcePersist.targetId,
        sourceCreated: sourcePersist.created,
        connectorId: connectorPersist.targetId,
        connectorCreated: connectorPersist.created,
        runId: runPersist.targetId,
        runCreated: runPersist.created,
        sourceRecordId: sourceRecordPersist.targetId,
        sourceRecordCreated: sourceRecordPersist.created,
        observationId: observationPersist.targetId,
        observationCreated: observationPersist.created,
        evidenceId: evidencePersist.targetId,
        evidenceCreated: evidencePersist.created,
        assetId: assetPersist?.targetId ?? null,
        assetCreated: assetPersist?.created ?? null,
        candidateId: candidatePersist.targetId,
        candidateCreated: candidatePersist.created,
        linkId: linkResult.targetId,
        linkCreated: linkResult.created,
      };
    }

    const first = await runFlow();
    const second = await runFlow();

    // Same target ids across both runs (deterministic ids from stable idempotency keys).
    expect(second.sourceId).toBe(first.sourceId);
    expect(second.connectorId).toBe(first.connectorId);
    expect(second.runId).toBe(first.runId);
    expect(second.sourceRecordId).toBe(first.sourceRecordId);
    expect(second.observationId).toBe(first.observationId);
    expect(second.evidenceId).toBe(first.evidenceId);
    expect(second.candidateId).toBe(first.candidateId);

    // First run creates; second run is a pure idempotent hit — zero duplicates.
    expect(first.sourceCreated).toBe(true);
    expect(second.sourceCreated).toBe(false);
    expect(first.candidateCreated).toBe(true);
    expect(second.candidateCreated).toBe(false);
    expect(first.observationCreated).toBe(true);
    expect(second.observationCreated).toBe(false);
    expect(first.linkCreated).toBe(true);
    expect(second.linkCreated).toBe(false);

    // Zero Incident promotion caused by THIS flow, ever — the single most important safety property.
    const incidentCountAfter = await (client as unknown as { incident: { count: () => Promise<number> } }).incident.count();
    expect(incidentCountAfter).toBe(incidentCountBefore);

    // Exactly one row per table — the second run never inserted a duplicate.
    const sourceCount = await (client as unknown as { source: { count: (args: unknown) => Promise<number> } }).source.count({ where: { id: first.sourceId } });
    expect(sourceCount).toBe(1);
    const candidateCount = await (client as unknown as { incidentCandidate: { count: (args: unknown) => Promise<number> } }).incidentCandidate.count({ where: { id: first.candidateId } });
    expect(candidateCount).toBe(1);
  }, 30_000);
});

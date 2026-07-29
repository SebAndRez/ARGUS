import { describe, expect, it, vi } from "vitest";
import {
  shadowWriteExternalEventWave3,
  shadowWriteKnowledgeIncidentToCandidateWave3,
  shadowWriteReportWave3,
  shadowWriteTelecomConnectivityEvidenceWave3,
  shadowWriteTelecomConnectivityStatusWave3,
} from "../../src/lib/database-target/shadow-write/wave3Domains";
import type { LegacyExternalEventRecordFull, LegacyReportRecordFull, LegacyTelecomConnectivityEvidenceRecord, LegacyTelecomConnectivityStatusRecord } from "../../src/lib/database-target/adapters/wave3Transformers";
import type { LegacyKnowledgeIncidentRecord, LegacyStatusMappingTable } from "../../src/lib/database-target/adapters/incident";

const DISABLED = { shadowWriteEnabled: false };

describe("wave3 shadow write — all flags off (Fase 12.A / Fase 8.4)", () => {
  it("ExternalEvent: never opens a client, never calls persist, returns SKIPPED", async () => {
    const persist = vi.fn();
    const record: LegacyExternalEventRecordFull = {
      id: "ee_1", sourceId: "src_1", externalId: "ext_1", category: "wildfire", title: "t", description: null,
      severity: null, confidence: null, latitude: null, longitude: null, occurredAt: null, fetchedAt: null,
      raw: null, createdAt: new Date(), ingestionRunId: "run_1",
    };
    const result = await shadowWriteExternalEventWave3(record, DISABLED, persist);
    expect(result).toEqual({ kind: "SKIPPED" });
    expect(persist).not.toHaveBeenCalled();
  });

  it("Report: never calls persist, returns SKIPPED", async () => {
    const persist = vi.fn();
    const record: LegacyReportRecordFull = {
      id: "report_1", userId: "user_1", title: "t", description: "d", latitude: 0, longitude: 0, status: "NEW", createdAt: new Date(),
    };
    const result = await shadowWriteReportWave3(record, DISABLED, persist);
    expect(result).toEqual({ kind: "SKIPPED" });
    expect(persist).not.toHaveBeenCalled();
  });

  it("KnowledgeIncident->IncidentCandidate: never calls persist, returns SKIPPED", async () => {
    const persist = vi.fn();
    const record: LegacyKnowledgeIncidentRecord = {
      id: "ki_1", title: "t", summary: "s", status: "active", verificationStatus: "confirmed", effectiveSeverity: "high",
      incidentTypeId: "type_1", domain: "wildfire", subtype: null, confidenceLevel: "high", sourceId: "src_1",
      externalId: "ext_1", latitude: null, longitude: null, occurredAt: null, createdAt: new Date(),
    };
    const mappingTable: LegacyStatusMappingTable = new Map();
    const result = await shadowWriteKnowledgeIncidentToCandidateWave3(record, mappingTable, DISABLED, persist);
    expect(result).toEqual({ kind: "SKIPPED" });
    expect(persist).not.toHaveBeenCalled();
  });

  it("TelecomConnectivityStatus: never calls persist, returns SKIPPED", async () => {
    const persist = vi.fn();
    const record: LegacyTelecomConnectivityStatusRecord = {
      id: "tcs_1", countryCode: "CL", adminLevel1: "RM", adminLevel2: null, carrierScope: "all_carriers",
      networkState: "normal", activationScope: null, centroidLatitude: null, centroidLongitude: null,
      startedAt: null, createdAt: new Date(),
    };
    const result = await shadowWriteTelecomConnectivityStatusWave3(record, DISABLED, persist);
    expect(result).toEqual({ kind: "SKIPPED" });
    expect(persist).not.toHaveBeenCalled();
  });

  it("TelecomConnectivityEvidence: never calls persist, returns SKIPPED", async () => {
    const persist = vi.fn();
    const record: LegacyTelecomConnectivityEvidenceRecord = {
      id: "tce_1", subjectType: "region", regionKey: null, poiId: null, eventType: "activated",
      sourceType: "official", sourceName: "SUBTEL", sourceUrl: null, confidenceScore: 80, createdAt: new Date(),
    };
    const result = await shadowWriteTelecomConnectivityEvidenceWave3(record, DISABLED, persist);
    expect(result).toEqual({ kind: "SKIPPED" });
    expect(persist).not.toHaveBeenCalled();
  });
});

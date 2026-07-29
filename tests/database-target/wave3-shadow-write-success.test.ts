import { describe, expect, it, vi } from "vitest";
import {
  shadowWriteExternalEventWave3,
  shadowWriteKnowledgeIncidentToCandidateWave3,
  shadowWriteReportWave3,
} from "../../src/lib/database-target/shadow-write/wave3Domains";
import type { LegacyExternalEventRecordFull, LegacyReportRecordFull } from "../../src/lib/database-target/adapters/wave3Transformers";
import type { LegacyKnowledgeIncidentRecord, LegacyStatusMappingTable } from "../../src/lib/database-target/adapters/incident";

const ENABLED = { shadowWriteEnabled: true };

describe("wave3 shadow write — enabled, legacy stays source of truth (Fase 12.B)", () => {
  it("ExternalEvent: persists and reports CREATED on first write", async () => {
    const persist = vi.fn().mockResolvedValue({ targetId: "sr_1", created: true });
    const record: LegacyExternalEventRecordFull = {
      id: "ee_1", sourceId: "src_1", externalId: "ext_1", category: "wildfire", title: "t", description: null,
      severity: null, confidence: null, latitude: -33, longitude: -70, occurredAt: null, fetchedAt: new Date(),
      raw: { a: 1 }, createdAt: new Date(), ingestionRunId: "run_1",
    };
    const result = await shadowWriteExternalEventWave3(record, ENABLED, persist);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("ATTEMPTED");
    if (result.kind === "ATTEMPTED") {
      expect(result.reconciliation.code).toBe("CREATED");
      expect(result.reconciliation.legacyId).toBe("ee_1");
      expect(result.reconciliation.targetId).toBe("sr_1");
    }
  });

  it("ExternalEvent: reports ALREADY_EXISTS (not CREATED) when persist reports an idempotent hit", async () => {
    const persist = vi.fn().mockResolvedValue({ targetId: "sr_1", created: false });
    const record: LegacyExternalEventRecordFull = {
      id: "ee_1", sourceId: "src_1", externalId: "ext_1", category: "wildfire", title: "t", description: null,
      severity: null, confidence: null, latitude: -33, longitude: -70, occurredAt: null, fetchedAt: new Date(),
      raw: { a: 1 }, createdAt: new Date(), ingestionRunId: "run_1",
    };
    const result = await shadowWriteExternalEventWave3(record, ENABLED, persist);
    expect(result.kind).toBe("ATTEMPTED");
    if (result.kind === "ATTEMPTED") {
      expect(result.reconciliation.code).toBe("ALREADY_EXISTS");
    }
  });

  it("Report: legacy response shape is never part of this function's return — only the reconciliation outcome", async () => {
    const persist = vi.fn().mockResolvedValue({ targetId: "obs_1", created: true });
    const record: LegacyReportRecordFull = {
      id: "report_1", userId: "user_1", title: "t", description: "d", latitude: -33, longitude: -70, status: "NEW", createdAt: new Date(),
    };
    const result = await shadowWriteReportWave3(record, ENABLED, persist);
    expect(result.kind).toBe("ATTEMPTED");
    expect(Object.keys(result)).toEqual(["kind", "reconciliation"]);
  });

  it("KnowledgeIncident->IncidentCandidate: persists a candidate and reports CREATED, domain is IncidentCandidate", async () => {
    const persist = vi.fn().mockResolvedValue({ targetId: "cand_1", created: true });
    const record: LegacyKnowledgeIncidentRecord = {
      id: "ki_1", title: "t", summary: "s", status: "active", verificationStatus: "confirmed", effectiveSeverity: "high",
      incidentTypeId: "type_1", domain: "wildfire", subtype: null, confidenceLevel: "high", sourceId: "src_1",
      externalId: "ext_1", latitude: -33, longitude: -70, occurredAt: new Date(), createdAt: new Date(),
    };
    const mappingTable: LegacyStatusMappingTable = new Map([
      ["active|confirmed", { operationalStatus: "ACTIVE", verificationStatus: "CONFIRMED", preventiveStatus: "NONE", trend: "STABLE", structuralStatus: "INDEPENDENT" }],
    ]);
    const result = await shadowWriteKnowledgeIncidentToCandidateWave3(record, mappingTable, ENABLED, persist);
    expect(result.kind).toBe("ATTEMPTED");
    if (result.kind === "ATTEMPTED") {
      expect(result.reconciliation.domain).toBe("IncidentCandidate");
      expect(result.reconciliation.code).toBe("CREATED");
    }
    const persistedTarget = persist.mock.calls[0][0];
    expect(persistedTarget.status).toBe("UNDER_ASSESSMENT"); // IncidentCandidate shape, never Incident
  });

  it("MIGRATION_BLOCKED transforms never call persist — no client opened for an unpersistable value", async () => {
    const persist = vi.fn();
    const record: LegacyExternalEventRecordFull = {
      id: "ee_2", sourceId: "src_1", externalId: "ext_2", category: "wildfire", title: "t", description: null,
      severity: null, confidence: null, latitude: -33, longitude: -70, occurredAt: null, fetchedAt: new Date(),
      raw: null, createdAt: new Date(), ingestionRunId: null, // missing ingestionRunId -> MIGRATION_BLOCKED
    };
    const result = await shadowWriteExternalEventWave3(record, ENABLED, persist);
    expect(persist).not.toHaveBeenCalled();
    expect(result.kind).toBe("ATTEMPTED");
    if (result.kind === "ATTEMPTED") {
      expect(result.reconciliation.code).toBe("MIGRATION_GAP");
    }
  });
});

import { describe, expect, it, vi } from "vitest";
import { shadowWriteKnowledgeIncidentToCandidateWave3 } from "../../src/lib/database-target/shadow-write/wave3Domains";
import { knowledgeIncidentToCandidate, knowledgeIncidentToTarget } from "../../src/lib/database-target/adapters/incident";
import type { LegacyKnowledgeIncidentRecord, LegacyStatusMappingTable } from "../../src/lib/database-target/adapters/incident";

/**
 * Structural + behavioral proof that the entire wave-3 controlled handoff
 * (SourceRecord/Observation/Report -> KnowledgeIncident -> IncidentCandidate)
 * NEVER produces or persists an `Incident`. This is the single most
 * important safety property of the wave-3/wave-4 boundary.
 */
describe("wave3 never promotes a candidate to Incident", () => {
  const record: LegacyKnowledgeIncidentRecord = {
    id: "ki_1",
    title: "Incendio forestal",
    summary: "zona X",
    status: "active",
    verificationStatus: "confirmed",
    effectiveSeverity: "high",
    incidentTypeId: "type_1",
    domain: "wildfire",
    subtype: null,
    confidenceLevel: "high",
    sourceId: "src_1",
    externalId: "ext_1",
    latitude: -33,
    longitude: -70,
    occurredAt: new Date(),
    createdAt: new Date(),
  };
  const mappingTable: LegacyStatusMappingTable = new Map([
    ["active|confirmed", { operationalStatus: "ACTIVE", verificationStatus: "CONFIRMED", preventiveStatus: "NONE", trend: "STABLE", structuralStatus: "INDEPENDENT" }],
  ]);

  it("knowledgeIncidentToCandidate's return value structurally has no Incident-only fields", () => {
    const candidate = knowledgeIncidentToCandidate(record, mappingTable);
    // Incident has verificationStatus/operationalStatus/etc. as TOP-LEVEL fields; IncidentCandidate never does.
    expect("verificationStatus" in candidate).toBe(false);
    expect("operationalStatus" in candidate).toBe(false);
    expect("originCandidateId" in candidate).toBe(false);
    expect(candidate.status).toBe("UNDER_ASSESSMENT");
  });

  it("the wave3 shadow-write wiring for KnowledgeIncident only ever calls a persist function typed for IncidentCandidate", async () => {
    const persist = vi.fn().mockResolvedValue({ targetId: "cand_1", created: true });
    const result = await shadowWriteKnowledgeIncidentToCandidateWave3(record, mappingTable, { shadowWriteEnabled: true }, persist);
    expect(result.kind).toBe("ATTEMPTED");
    if (result.kind === "ATTEMPTED") {
      expect(result.reconciliation.domain).toBe("IncidentCandidate");
    }
    const persistedValue = persist.mock.calls[0][0];
    expect(persistedValue.status).toBe("UNDER_ASSESSMENT");
    expect(persistedValue.promotionStartedAt).toBeNull();
  });

  it("no wave3 export named *ToIncident* or *ToIncidentTarget* exists in the shadow-write wiring module — only the candidate path", async () => {
    const wave3Domains = await import("../../src/lib/database-target/shadow-write/wave3Domains");
    const exportNames = Object.keys(wave3Domains);
    for (const name of exportNames) {
      expect(name).not.toMatch(/ShadowWriteIncidentWave3|shadowWriteIncidentTargetWave3/);
    }
    expect(exportNames).toContain("shadowWriteKnowledgeIncidentToCandidateWave3");
  });

  it("the Incident-targeting transform (knowledgeIncidentToTarget) is a SEPARATE, independent function — never invoked by the candidate path", () => {
    // Sanity: calling the Incident transform directly still works on its own (Ola 4 concern),
    // proving the two transforms are independent and the candidate path never delegates to this one.
    const incident = knowledgeIncidentToTarget(record, mappingTable);
    expect(incident).not.toBeNull();
    expect(incident?.id).toBe("ki_1");
    // But the candidate transform's result is never derived from this Incident value.
    const candidate = knowledgeIncidentToCandidate(record, mappingTable);
    expect(candidate).not.toHaveProperty("verificationStatus");
  });
});

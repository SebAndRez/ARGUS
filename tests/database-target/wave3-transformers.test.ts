import { describe, expect, it } from "vitest";
import {
  externalEventToPrimaryObservation,
  externalEventToSourceRecord,
  ingestionExecutionToIngestionRun,
  knowledgeIncidentToIncidentCandidateResult,
  reportToPrimaryObservation,
  reportToReportTarget,
  sourceRegistryEntryToSource,
  sourceRegistryIntegrationToConnector,
  telecomConnectivityEvidenceToEvidence,
  telecomConnectivityStatusToObservation,
  type LegacyExternalEventRecordFull,
  type LegacyIngestionExecution,
  type LegacyReportRecordFull,
  type LegacyTelecomConnectivityEvidenceRecord,
  type LegacyTelecomConnectivityStatusRecord,
} from "../../src/lib/database-target/adapters/wave3Transformers";
import type { LegacyKnowledgeIncidentRecord, LegacyStatusMappingTable } from "../../src/lib/database-target/adapters/incident";
import type { CanonicalSourceEntry } from "../../src/lib/database-target/adapters/sourceRegistryConsolidation";

describe("1. externalEventToSourceRecord", () => {
  const base: LegacyExternalEventRecordFull = {
    id: "ee_1",
    sourceId: "src_gdacs",
    externalId: "ext_1",
    category: "wildfire",
    title: "Incendio",
    description: "detalle",
    severity: "high",
    confidence: 80,
    latitude: -33.0,
    longitude: -70.0,
    occurredAt: new Date("2026-01-01T00:00:00Z"),
    fetchedAt: new Date("2026-01-01T01:00:00Z"),
    raw: { foo: "bar" },
    createdAt: new Date("2026-01-01T01:05:00Z"),
    ingestionRunId: "run_1",
  };

  it("returns MIGRATION_BLOCKED without a resolved ingestionRunId — never invents one", () => {
    const result = externalEventToSourceRecord({ ...base, ingestionRunId: null });
    expect(result.status).toBe("MIGRATION_BLOCKED");
    expect(result.value).toBeNull();
  });

  it("returns READY with rawContent preserved verbatim, never mutated", () => {
    const result = externalEventToSourceRecord(base);
    expect(result.status).toBe("READY");
    expect(result.value?.rawContent).toEqual({ foo: "bar" });
    expect(result.value?.originKind).toBe("EXTERNAL_EVENT");
    expect(result.value?.legacyRecordId).toBe("ee_1");
  });

  it("produces a deterministic contentHash for identical content", () => {
    const a = externalEventToSourceRecord(base);
    const b = externalEventToSourceRecord({ ...base, id: "ee_2" });
    expect(a.value?.contentHash).toBe(b.value?.contentHash);
  });
});

describe("2. externalEventToPrimaryObservation", () => {
  const base: LegacyExternalEventRecordFull = {
    id: "ee_1",
    sourceId: "src_gdacs",
    externalId: "ext_1",
    category: "wildfire",
    title: "Incendio",
    description: "detalle",
    severity: "high",
    confidence: 80,
    latitude: -33.0,
    longitude: -70.0,
    occurredAt: new Date("2026-01-01T00:00:00Z"),
    fetchedAt: new Date("2026-01-01T01:00:00Z"),
    raw: null,
    createdAt: new Date("2026-01-01T01:05:00Z"),
    ingestionRunId: "run_1",
  };

  it("returns READY with machine authorship (authorType null) when coordinates are present", () => {
    const result = externalEventToPrimaryObservation(base, "sr_1");
    expect(result.status).toBe("READY");
    expect(result.value?.originType).toBe("PRIMARY");
    expect(result.value?.authorType).toBeNull();
  });

  it("returns REQUIRES_REVIEW (not a fabricated success) when coordinates are missing", () => {
    const result = externalEventToPrimaryObservation({ ...base, latitude: null, longitude: null }, "sr_1");
    expect(result.status).toBe("REQUIRES_REVIEW");
    expect(result.missingFields).toContain("latitude/longitude");
    expect(result.value).not.toBeNull();
  });
});

describe("3-4. Report transformers", () => {
  const record: LegacyReportRecordFull = {
    id: "report_1",
    userId: "user_1",
    title: "Sin agua",
    description: "corte de suministro",
    latitude: -33.4,
    longitude: -70.6,
    status: "NEW",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };

  it("reportToReportTarget always produces authorType CITIZEN (D-01)", () => {
    const result = reportToReportTarget(record);
    expect(result.status).toBe("READY");
    expect(result.value?.authorType).toBe("CITIZEN");
    expect(result.value?.authorPersonId).toBe("user_1");
  });

  it("reportToPrimaryObservation returns the same underlying row — a Report IS a PrimaryObservation", () => {
    const result = reportToPrimaryObservation(record);
    expect(result.status).toBe("READY");
    expect(result.value?.originType).toBe("PRIMARY");
    expect(result.value?.id).toBe("report_1");
  });
});

describe("5. telecomConnectivityStatusToObservation (D-04 — evidence.*, never comms.*)", () => {
  const base: LegacyTelecomConnectivityStatusRecord = {
    id: "tcs_1",
    countryCode: "CL",
    adminLevel1: "Valparaíso",
    adminLevel2: null,
    carrierScope: "all_carriers",
    networkState: "outage",
    activationScope: "comunas costeras",
    centroidLatitude: -33.05,
    centroidLongitude: -71.6,
    startedAt: new Date("2026-01-01T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:05:00Z"),
  };

  it("returns READY and never targets a comms.* shape (D-04)", () => {
    const result = telecomConnectivityStatusToObservation(base);
    expect(result.status).toBe("READY");
    expect(result.value?.claimStructured?.domain).toBe("telecom_connectivity");
  });

  it("returns REQUIRES_REVIEW without a centroid, never a guessed location", () => {
    const result = telecomConnectivityStatusToObservation({ ...base, centroidLatitude: null, centroidLongitude: null });
    expect(result.status).toBe("REQUIRES_REVIEW");
    expect(result.value?.location).toBeNull();
  });
});

describe("6. telecomConnectivityEvidenceToEvidence", () => {
  const base: LegacyTelecomConnectivityEvidenceRecord = {
    id: "tce_1",
    subjectType: "region",
    regionKey: "CL:Valparaíso::all_carriers",
    poiId: null,
    eventType: "activated",
    sourceType: "official",
    sourceName: "SUBTEL",
    sourceUrl: "https://subtel.gob.cl/example",
    confidenceScore: 85,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };

  it("creates an EvidenceAsset metadata row when sourceUrl is present — no binary storage", () => {
    const result = telecomConnectivityEvidenceToEvidence(base);
    expect(result.status).toBe("READY");
    expect(result.value?.asset).not.toBeNull();
    expect(result.value?.asset?.storageRef).toBe("https://subtel.gob.cl/example");
  });

  it("creates Evidence without an EvidenceAsset when sourceUrl is absent — never fabricates a storage ref", () => {
    const result = telecomConnectivityEvidenceToEvidence({ ...base, sourceUrl: null });
    expect(result.status).toBe("READY");
    expect(result.value?.asset).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("7. knowledgeIncidentToIncidentCandidateResult — never creates an Incident", () => {
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
    latitude: -33.0,
    longitude: -70.0,
    occurredAt: new Date(),
    createdAt: new Date(),
  };

  it("returns REQUIRES_REVIEW (not blocked, not dropped) without an approved status mapping", () => {
    const emptyTable: LegacyStatusMappingTable = new Map();
    const result = knowledgeIncidentToIncidentCandidateResult(record, emptyTable);
    expect(result.status).toBe("REQUIRES_REVIEW");
    expect(result.value?.status).toBe("UNDER_ASSESSMENT");
  });

  it("returns READY with a fully proposed profile when the mapping resolves", () => {
    const table: LegacyStatusMappingTable = new Map([
      ["active|confirmed", { operationalStatus: "ACTIVE", verificationStatus: "CONFIRMED", preventiveStatus: "NONE", trend: "STABLE", structuralStatus: "INDEPENDENT" }],
    ]);
    const result = knowledgeIncidentToIncidentCandidateResult(record, table);
    expect(result.status).toBe("READY");
    expect(result.value?.proposedProfile?.operationalStatus).toBe("ACTIVE");
  });
});

describe("8-9. SourceRegistry -> Source / Connector", () => {
  const entry: CanonicalSourceEntry = {
    id: "gdacs",
    origins: ["vigia", "knowledge-intake"],
    vigia: {
      id: "gdacs",
      name: "GDACS",
      coverage: "global",
      threatTypes: ["EARTHQUAKE"],
      reliabilityScore: 92,
      isOfficial: true,
      refreshIntervalMinutes: 15,
      endpoint: "https://www.gdacs.org/xml/rss.xml",
      role: "incident",
      enabled: true,
    },
    knowledgeIntake: null,
    hasEnabledStateDrift: false,
  };

  it("sourceRegistryEntryToSource returns REQUIRES_REVIEW without a resolved providerId — never synthesizes one (D-01)", () => {
    const result = sourceRegistryEntryToSource(entry, { providerId: null });
    expect(result.status).toBe("REQUIRES_REVIEW");
    expect(result.missingFields).toContain("providerId");
  });

  it("sourceRegistryEntryToSource returns READY with a resolved providerId, preserving the endpoint verbatim", () => {
    const result = sourceRegistryEntryToSource(entry, { providerId: "prov_1" });
    expect(result.status).toBe("READY");
    expect(result.value?.endpointSignature).toBe("https://www.gdacs.org/xml/rss.xml");
    expect(result.value?.status).toBe("ACTIVE");
  });

  it("sourceRegistryEntryToSource flags enabled-state drift for REQUIRES_REVIEW, never silently picking one side", () => {
    const driftingEntry: CanonicalSourceEntry = { ...entry, hasEnabledStateDrift: true };
    const result = sourceRegistryEntryToSource(driftingEntry, { providerId: "prov_1" });
    expect(result.status).toBe("REQUIRES_REVIEW");
  });

  it("sourceRegistryIntegrationToConnector preserves the exact endpoint/cadence from the registry — never invents capabilities", () => {
    const result = sourceRegistryIntegrationToConnector(entry, "src_1");
    expect(result.status).toBe("READY");
    expect(result.value?.config.endpoint).toBe("https://www.gdacs.org/xml/rss.xml");
    expect(result.value?.config.refreshIntervalMinutes).toBe(15);
  });

  it("sourceRegistryIntegrationToConnector never activates a disabled source", () => {
    const disabledEntry: CanonicalSourceEntry = { ...entry, vigia: { ...entry.vigia!, enabled: false } };
    const result = sourceRegistryIntegrationToConnector(disabledEntry, "src_1");
    expect(result.value?.status).toBe("INACTIVE");
  });
});

describe("10. ingestionExecutionToIngestionRun", () => {
  it("returns NOT_RECONSTRUCTABLE when sourceId/status are insufficient", () => {
    const execution: LegacyIngestionExecution = {
      originKind: "LEGACY_INGESTION_RUN",
      id: "run_1",
      sourceId: "",
      status: "",
      fetchedAt: new Date(),
      completedAt: null,
    };
    const result = ingestionExecutionToIngestionRun(execution, "cycle_1");
    expect(result.status).toBe("NOT_RECONSTRUCTABLE");
    expect(result.value).toBeNull();
  });

  it("returns READY for a recognized legacy status", () => {
    const execution: LegacyIngestionExecution = {
      originKind: "LEGACY_INGESTION_RUN",
      id: "run_1",
      sourceId: "src_1",
      status: "success",
      fetchedAt: new Date("2026-01-01T00:00:00Z"),
      completedAt: new Date("2026-01-01T00:05:00Z"),
    };
    const result = ingestionExecutionToIngestionRun(execution, "cycle_1");
    expect(result.status).toBe("READY");
    expect(result.value?.status).toBe("COMPLETED");
  });

  it("fuses KnowledgeIngestionRun the same way, discriminated at the adapter layer only", () => {
    const execution: LegacyIngestionExecution = {
      originKind: "KNOWLEDGE_INGESTION_RUN",
      id: "kir_1",
      sourceId: "src_1",
      status: "failed",
      startedAt: new Date("2026-01-01T00:00:00Z"),
      finishedAt: new Date("2026-01-01T00:05:00Z"),
    };
    const result = ingestionExecutionToIngestionRun(execution, "cycle_1");
    expect(result.status).toBe("READY");
    expect(result.value?.status).toBe("FAILED");
    expect(result.value?.legacySource).toBe("KnowledgeIngestionRun");
  });

  it("returns REQUIRES_REVIEW for an unmapped legacy status, never a guessed default", () => {
    const execution: LegacyIngestionExecution = {
      originKind: "LEGACY_INGESTION_RUN",
      id: "run_2",
      sourceId: "src_1",
      status: "weird_unmapped_status",
      fetchedAt: new Date(),
      completedAt: null,
    };
    const result = ingestionExecutionToIngestionRun(execution, "cycle_1");
    expect(result.status).toBe("REQUIRES_REVIEW");
  });
});

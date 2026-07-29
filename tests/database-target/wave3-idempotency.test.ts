import { describe, expect, it } from "vitest";
import {
  connectorIdempotencyKey,
  externalEventIdempotencyKey,
  incidentCandidateIdempotencyKey,
  ingestionRunIdempotencyKey,
  knowledgeIncidentIdempotencyKey,
  observationIdempotencyKey,
  reportIdempotencyKey,
  sourceIdempotencyKey,
  sourceRecordIdempotencyKey,
  telecomConnectivityEvidenceIdempotencyKey,
  telecomConnectivityStatusIdempotencyKey,
} from "../../src/lib/database-target/adapters/wave3Idempotency";

describe("wave3 idempotency keys — never a bare random UUID", () => {
  it("ExternalEvent: first write and retry produce the identical key", () => {
    const input = { sourceId: "src_gdacs", externalId: "ext_1", stableVersion: "2026-01-01T00:00:00.000Z" };
    const first = externalEventIdempotencyKey(input);
    const retry = externalEventIdempotencyKey({ ...input });
    expect(first).toBe(retry);
  });

  it("ExternalEvent: duplicate detection is independent of the legacy row's own random id — same source/externalId/version always collides", () => {
    // Two DIFFERENT legacy `ExternalEvent.id` values (never part of the key) with the same logical identity must produce the SAME key.
    const keyA = externalEventIdempotencyKey({ sourceId: "src_gdacs", externalId: "ext_1", stableVersion: "v1" });
    const keyB = externalEventIdempotencyKey({ sourceId: "src_gdacs", externalId: "ext_1", stableVersion: "v1" });
    expect(keyA).toBe(keyB);
  });

  it("ExternalEvent: same externalId across DIFFERENT sources never collides (no false duplicate)", () => {
    const keyA = externalEventIdempotencyKey({ sourceId: "src_gdacs", externalId: "ext_1", stableVersion: "v1" });
    const keyB = externalEventIdempotencyKey({ sourceId: "src_usgs", externalId: "ext_1", stableVersion: "v1" });
    expect(keyA).not.toBe(keyB);
  });

  it("ExternalEvent: a content update (new stableVersion) produces a distinct key — versioned transformation, not silently deduplicated away", () => {
    const v1 = externalEventIdempotencyKey({ sourceId: "src_gdacs", externalId: "ext_1", stableVersion: "v1" });
    const v2 = externalEventIdempotencyKey({ sourceId: "src_gdacs", externalId: "ext_1", stableVersion: "v2" });
    expect(v1).not.toBe(v2);
  });

  it("Report: legacy table + legacy id, stable across retries", () => {
    expect(reportIdempotencyKey("report_1")).toBe(reportIdempotencyKey("report_1"));
    expect(reportIdempotencyKey("report_1")).not.toBe(reportIdempotencyKey("report_2"));
  });

  it("KnowledgeIncident: legacy table + legacy id, stable across retries", () => {
    expect(knowledgeIncidentIdempotencyKey("ki_1")).toBe(knowledgeIncidentIdempotencyKey("ki_1"));
  });

  it("SourceRecord: source + externalId + transformation version — a re-derivation (new version) never collides with the original", () => {
    const v1 = sourceRecordIdempotencyKey({ sourceId: "src_gdacs", externalId: "ext_1", transformationVersion: "v1" });
    const v2 = sourceRecordIdempotencyKey({ sourceId: "src_gdacs", externalId: "ext_1", transformationVersion: "v2" });
    expect(v1).not.toBe(v2);
    expect(sourceRecordIdempotencyKey({ sourceId: "src_gdacs", externalId: "ext_1", transformationVersion: "v1" })).toBe(v1);
  });

  it("Observation: origin + legacy id + derivation kind — distinguishes a PRIMARY derivation from a DERIVED one off the same legacy row", () => {
    const primary = observationIdempotencyKey({ originTable: "ExternalEvent", legacyId: "ee_1", derivationKind: "PRIMARY" });
    const derived = observationIdempotencyKey({ originTable: "ExternalEvent", legacyId: "ee_1", derivationKind: "DERIVED" });
    expect(primary).not.toBe(derived);
  });

  it("IncidentCandidate: legacy id takes precedence and is stable regardless of an unrelated correlationKey being passed too", () => {
    const withLegacyOnly = incidentCandidateIdempotencyKey({ legacyId: "ki_1" });
    const withBoth = incidentCandidateIdempotencyKey({ legacyId: "ki_1", correlationKey: "unrelated" });
    expect(withLegacyOnly).toBe(withBoth);
  });

  it("IncidentCandidate: falls back to correlationKey only when legacyId is absent", () => {
    const withCorrelation = incidentCandidateIdempotencyKey({ correlationKey: "src:ext" });
    expect(withCorrelation).toContain("correlation");
  });

  it("IncidentCandidate: throws rather than falling back to a random key when neither legacyId nor correlationKey is supplied", () => {
    expect(() => incidentCandidateIdempotencyKey({})).toThrow();
  });

  it("TelecomConnectivityStatus / TelecomConnectivityEvidence: legacy table + legacy id, stable across retries", () => {
    expect(telecomConnectivityStatusIdempotencyKey("tcs_1")).toBe(telecomConnectivityStatusIdempotencyKey("tcs_1"));
    expect(telecomConnectivityEvidenceIdempotencyKey("tce_1")).toBe(telecomConnectivityEvidenceIdempotencyKey("tce_1"));
  });

  it("Source: provider + endpoint signature — the table's own real unique pair", () => {
    const keyA = sourceIdempotencyKey({ providerId: "prov_1", endpointSignature: "https://a.example" });
    const keyB = sourceIdempotencyKey({ providerId: "prov_1", endpointSignature: "https://b.example" });
    expect(keyA).not.toBe(keyB);
  });

  it("Connector: source id (1:1 relationship)", () => {
    expect(connectorIdempotencyKey("src_1")).toBe(connectorIdempotencyKey("src_1"));
    expect(connectorIdempotencyKey("src_1")).not.toBe(connectorIdempotencyKey("src_2"));
  });

  it("IngestionRun: source id + stable cycle marker, never the run's own random id", () => {
    const keyA = ingestionRunIdempotencyKey({ sourceId: "src_1", cycleMarker: "2026-01-01T00:00Z" });
    const keyB = ingestionRunIdempotencyKey({ sourceId: "src_1", cycleMarker: "2026-01-01T00:00Z" });
    const keyC = ingestionRunIdempotencyKey({ sourceId: "src_1", cycleMarker: "2026-01-01T00:15Z" });
    expect(keyA).toBe(keyB);
    expect(keyA).not.toBe(keyC);
  });
});

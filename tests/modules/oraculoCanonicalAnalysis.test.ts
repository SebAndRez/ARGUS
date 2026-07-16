import { describe, expect, it } from "vitest";
import { buildOraculoCanonicalAnalysis } from "@/modules/oraculo/oraculoCanonicalAnalysis";
import type { ModuleIncidentSummary } from "@/types/moduleOperationalContext";

/**
 * ARGUS Prompt 17 §32 — 8 casos obligatorios de ORÁCULO sobre incidentes
 * canónicos.
 */

function buildSummary(overrides: Partial<ModuleIncidentSummary> = {}): ModuleIncidentSummary {
  return {
    id: "incident-1",
    type: "EARTHQUAKE",
    title: "M6.1 earthquake",
    summary: "Offshore earthquake",
    severity: "high",
    lifecycle: "active",
    verificationStatus: "official",
    confidence: "high",
    location: { latitude: -33.05, longitude: -71.62, geometry: { type: "point", coordinates: [-33.05, -71.62] }, countryCode: "CL", regionCode: "Valparaiso" },
    timing: { startedAt: "2026-07-14T10:00:00.000Z", updatedAt: "2026-07-14T10:05:00.000Z", expiresAt: null },
    sourceSummary: { primarySource: "USGS Earthquake Hazards", sourceCount: 1, isOfficial: true },
    isDemo: false,
    ...overrides,
  };
}

describe("buildOraculoCanonicalAnalysis", () => {
  it("recibe un incidente canónico y produce metadatos de análisis, nunca un hecho confirmado", () => {
    const analysis = buildOraculoCanonicalAnalysis(buildSummary());
    expect(analysis.basedOnIncidentId).toBe("incident-1");
    expect(analysis.isPrediction).toBe(false);
    expect(analysis.isOfficial).toBe(false);
    expect(analysis.analysisType).toBe("source_reliability_snapshot");
  });

  it("la salida se marca explícitamente como análisis, no como alerta oficial", () => {
    const analysis = buildOraculoCanonicalAnalysis(buildSummary({ verificationStatus: "official" }));
    expect(analysis.isOfficial).toBe(false);
  });

  it("predicción/análisis nunca es oficial incluso cuando el incidente subyacente sí lo es", () => {
    const official = buildOraculoCanonicalAnalysis(buildSummary({ verificationStatus: "official", confidence: "verified" }));
    expect(official.isOfficial).toBe(false);
  });

  it("conserva la confianza del incidente, derivada de ArgusConfidence sin inventar valores", () => {
    expect(buildOraculoCanonicalAnalysis(buildSummary({ confidence: "low" })).confidence).toBe(30);
    expect(buildOraculoCanonicalAnalysis(buildSummary({ confidence: "verified" })).confidence).toBe(97);
  });

  it("no altera el incidente de entrada (función pura)", () => {
    const summary = buildSummary();
    const frozen = Object.freeze({ ...summary });
    expect(() => buildOraculoCanonicalAnalysis(frozen)).not.toThrow();
  });

  it("no persiste otro evento — es una función pura sin efectos secundarios", () => {
    const first = buildOraculoCanonicalAnalysis(buildSummary());
    const second = buildOraculoCanonicalAnalysis(buildSummary());
    expect(first.basedOnIncidentId).toBe(second.basedOnIncidentId);
    expect(first.confidence).toBe(second.confidence);
  });

  it("basedOnEvidenceCount refleja el conteo de fuentes real del incidente", () => {
    const analysis = buildOraculoCanonicalAnalysis(buildSummary({ sourceSummary: { primarySource: "FIRMS", sourceCount: 3, isOfficial: false } }));
    expect(analysis.basedOnEvidenceCount).toBe(3);
  });

  it("un incidente candidato produce un resumen textual que refleja falta de corroboración", () => {
    const analysis = buildOraculoCanonicalAnalysis(buildSummary({ verificationStatus: "candidate" }));
    expect(analysis.summary.toLowerCase()).toContain("preliminar");
  });
});

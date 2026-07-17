import { describe, expect, it } from "vitest";
import { validateNormalizedObservation } from "@/lib/canonical/sourceAdapterContract";
import type { ArgusIncidentKnowledge } from "@/types/knowledgeIntake";

function buildObservation(overrides: Partial<ArgusIncidentKnowledge> = {}): ArgusIncidentKnowledge {
  return {
    id: "usgs-abc123",
    title: "M6.1 earthquake",
    summary: "Offshore earthquake reported by USGS",
    domain: "earthquake",
    severity: "high",
    confidenceScore: 92,
    actionabilityScore: 60,
    sourceReliabilityScore: 94,
    evidenceCount: 1,
    sourceIds: ["usgs_earthquake"],
    sourceNames: ["USGS Earthquake Hazards"],
    latitude: -33.05,
    longitude: -71.62,
    technicalFactors: {},
    causes: [],
    contributingFactors: [],
    responseActions: [],
    lessonsLearned: [],
    recommendedActions: [],
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: [],
    rawEvidenceRefs: ["https://earthquake.usgs.gov/x"],
    createdAt: "2026-07-17T10:00:00.000Z",
    updatedAt: "2026-07-17T10:00:00.000Z",
    ...overrides,
  };
}

describe("validateNormalizedObservation", () => {
  it("acepta una observación completa con coordenadas finitas", () => {
    const result = validateNormalizedObservation(buildObservation());
    expect(result).toEqual({ valid: true, reasons: [] });
  });

  it("acepta una observación sin coordenadas pero con geometría estructurada", () => {
    const observation = buildObservation({ latitude: undefined, longitude: undefined, geometry: { type: "Polygon", coordinates: [] } });
    const result = validateNormalizedObservation(observation);
    expect(result.valid).toBe(true);
  });

  it("rechaza una observación sin id", () => {
    const result = validateNormalizedObservation(buildObservation({ id: "" }));
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain("Falta un id estable.");
  });

  it("rechaza una observación sin procedencia (sourceIds vacío)", () => {
    const result = validateNormalizedObservation(buildObservation({ sourceIds: [] }));
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain("Falta procedencia (sourceIds vacío).");
  });

  it("rechaza una observación sin coordenadas finitas ni geometría", () => {
    const result = validateNormalizedObservation(buildObservation({ latitude: undefined, longitude: undefined }));
    expect(result.valid).toBe(false);
    expect(result.reasons.some((reason) => reason.includes("proyectable"))).toBe(true);
  });

  it("rechaza una observación con coordenadas no finitas (NaN)", () => {
    const result = validateNormalizedObservation(buildObservation({ latitude: Number.NaN, longitude: -71.62 }));
    expect(result.valid).toBe(false);
  });

  it("rechaza una observación sin título", () => {
    const result = validateNormalizedObservation(buildObservation({ title: "" }));
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain("Falta título.");
  });

  it("acumula múltiples motivos cuando fallan varias reglas a la vez", () => {
    const result = validateNormalizedObservation(buildObservation({ id: "", title: "", sourceIds: [] }));
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
  });
});

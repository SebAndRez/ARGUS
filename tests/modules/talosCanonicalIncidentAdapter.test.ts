import { describe, expect, it } from "vitest";
import {
  buildTalosAssessmentInputFromCanonicalIncident,
  buildTalosCanonicalAssessmentView,
  mapCanonicalIncidentToTalosCategory,
} from "@/modules/talos/talosCanonicalIncidentAdapter";
import type { ModuleIncidentSummary } from "@/types/moduleOperationalContext";

/**
 * ARGUS Prompt 17 §33 — 8 casos obligatorios de TALOS sobre incidentes
 * canónicos.
 */

function buildSummary(overrides: Partial<ModuleIncidentSummary> = {}): ModuleIncidentSummary {
  return {
    id: "incident-1",
    type: "WILDFIRE",
    title: "Incendio forestal en Valparaíso",
    summary: "Incendio activo",
    severity: "high",
    lifecycle: "active",
    verificationStatus: "corroborated",
    confidence: "high",
    location: { latitude: -33.4, longitude: -70.6, geometry: { type: "point", coordinates: [-33.4, -70.6] }, countryCode: "CL", regionCode: "Valparaiso" },
    timing: { startedAt: "2026-07-14T10:00:00.000Z", updatedAt: "2026-07-14T10:05:00.000Z", expiresAt: null },
    sourceSummary: { primarySource: "Copernicus EFFIS", sourceCount: 2, isOfficial: true },
    isDemo: false,
    ...overrides,
  };
}

describe("mapCanonicalIncidentToTalosCategory", () => {
  it("mapea tipos de amenaza conocidos a categorías TALOS", () => {
    expect(mapCanonicalIncidentToTalosCategory("WILDFIRE")).toBe("fire");
    expect(mapCanonicalIncidentToTalosCategory("EARTHQUAKE")).toBe("earthquake");
    expect(mapCanonicalIncidentToTalosCategory("TSUNAMI")).toBe("tsunami");
  });

  it("cae a 'other' para tipos sin mapeo específico de riesgo territorial", () => {
    expect(mapCanonicalIncidentToTalosCategory("CITIZEN_REPORT")).toBe("other");
  });
});

describe("buildTalosAssessmentInputFromCanonicalIncident — Caso 1/2 (recibe ID canónico, usa geometría real)", () => {
  it("preserva id, severidad y lifecycle del incidente canónico sin transformarlos", () => {
    const input = buildTalosAssessmentInputFromCanonicalIncident(buildSummary());
    expect(input.id).toBe("incident-1");
    expect(input.severity).toBe("high");
    expect(input.status).toBe("active");
  });

  it("usa la geometría real (lat/lng) del incidente, nunca coordenadas inventadas", () => {
    const input = buildTalosAssessmentInputFromCanonicalIncident(buildSummary());
    expect(input.location?.lat).toBe(-33.4);
    expect(input.location?.lng).toBe(-70.6);
  });
});

describe("buildTalosCanonicalAssessmentView — Caso 3-8", () => {
  it("Caso 3 — diferencia dato observado (incidentId) de estimación (assessment)", () => {
    const view = buildTalosCanonicalAssessmentView(buildSummary());
    expect(view.incidentId).toBe("incident-1");
    expect(view.assessment).not.toBeNull();
    expect(view.assumptions.length).toBeGreaterThan(0);
  });

  it("Caso 4/5 — datos insuficientes (sin geometría puntual) nunca se convierten en impacto cero", () => {
    const view = buildTalosCanonicalAssessmentView(buildSummary({ location: { latitude: null, longitude: null, geometry: { type: "point", coordinates: [0, 0] }, countryCode: null, regionCode: null } }));
    expect(view.status).toBe("insufficient_data");
    expect(view.assessment).toBeNull();
  });

  it("Caso 7 — nunca crea otro incidente: el incidentId de salida es el mismo que el de entrada", () => {
    const view = buildTalosCanonicalAssessmentView(buildSummary({ id: "incident-xyz" }));
    expect(view.incidentId).toBe("incident-xyz");
    expect(view.assessment?.id).not.toBe(view.incidentId); // el TalosRiskAssessment tiene su propio id de evaluación, no reemplaza al incidente
  });

  it("la vista nunca se marca como oficial (isOfficial: false)", () => {
    const view = buildTalosCanonicalAssessmentView(buildSummary());
    expect(view.isOfficial).toBe(false);
  });

  it("no expone ningún campo de HelpRequest (teléfono, dirección precisa) — el adaptador de entrada solo lee campos de ModuleIncidentSummary", () => {
    // El motor TALOS ya produce internamente un factor "impacto médico" (una
    // dimensión de riesgo, no un dato personal) independientemente de la
    // fuente — lo que esta prueba verifica es que el *adaptador* no
    // introduce ningún campo de HelpRequest (teléfono/dirección exacta) al
    // construir la entrada, no que la palabra "médico" nunca aparezca en la
    // explicación del motor.
    const input = buildTalosAssessmentInputFromCanonicalIncident(buildSummary());
    const serialized = JSON.stringify(input);
    expect(serialized).not.toContain("phone");
    expect(serialized).not.toMatch(/precise|exactAddress/i);
    expect(Object.keys(input)).toEqual(["id", "title", "category", "severity", "status", "createdAt", "updatedAt", "location"]);
  });

  it("determinismo: el mismo incidente produce el mismo nivel de riesgo/impacto", () => {
    const summary = buildSummary();
    const first = buildTalosCanonicalAssessmentView(summary);
    const second = buildTalosCanonicalAssessmentView(summary);
    expect(first.assessment?.riskLevel).toBe(second.assessment?.riskLevel);
    expect(first.assessment?.impact).toBe(second.assessment?.impact);
  });
});

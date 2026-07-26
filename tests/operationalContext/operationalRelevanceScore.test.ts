import { describe, expect, it } from "vitest";
import { scoreResource } from "@/lib/operationalContext/operationalRelevanceScore";
import { getThreatResourceProfile } from "@/data/threatResourceMatrix";
import type { OperationalResourceCandidate } from "@/types/operationalContext";

/**
 * Fase 5 — Operational Relevance Score. Pura, sin I/O: un recurso más
 * cercano, operativo y de mayor prioridad debe puntuar estrictamente más
 * alto que uno más lejano, saturado y de menor prioridad.
 */
function candidate(overrides: Partial<OperationalResourceCandidate>): OperationalResourceCandidate {
  return {
    id: "poi-1",
    kind: "critical_poi",
    category: "hospital",
    name: "Hospital de prueba",
    lat: 0,
    lng: 0,
    distanceKm: 1,
    priority: "P1",
    providerAvailable: true,
    ...overrides,
  };
}

describe("scoreResource", () => {
  const profile = getThreatResourceProfile("EARTHQUAKE");

  it("scores a closer, operational, higher-priority resource above a farther, saturated, lower-priority one", () => {
    const near = candidate({ distanceKm: 1, priority: "P0" });
    const far = candidate({ distanceKm: 25, priority: "P3" });

    const nearScore = scoreResource(near, { profile, state: "operational", radiusKm: 30, atRisk: false });
    const farScore = scoreResource(far, { profile, state: "saturated", radiusKm: 30, atRisk: false });

    expect(nearScore).toBeGreaterThan(farScore);
  });

  it("penalizes a resource that is itself inside the impact area (at risk)", () => {
    const base = candidate({ distanceKm: 5 });
    const safeScore = scoreResource(base, { profile, state: "operational", radiusKm: 30, atRisk: false });
    const atRiskScore = scoreResource(base, { profile, state: "operational", radiusKm: 30, atRisk: true });

    expect(atRiskScore).toBeLessThan(safeScore);
  });

  it("gives an unavailable external provider placeholder the lowest possible score", () => {
    const placeholder = candidate({ kind: "external", category: "mop_infrastructure", providerAvailable: false });
    const real = candidate({ distanceKm: 20, priority: "P4" });

    const placeholderScore = scoreResource(placeholder, { profile, state: "unconfirmed", radiusKm: 30, atRisk: false });
    const realScore = scoreResource(real, { profile, state: "unconfirmed", radiusKm: 30, atRisk: false });

    expect(placeholderScore).toBeLessThan(realScore);
  });
});

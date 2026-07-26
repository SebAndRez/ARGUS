import { describe, expect, it } from "vitest";
import { buildLayerActivationPatch } from "@/lib/operationalContext/operationalLayerActivation";
import { getThreatResourceProfile } from "@/data/threatResourceMatrix";
import type { OperationalResourceCandidate } from "@/types/operationalContext";

/**
 * Fase 6 — Automatic Layer Activation. Guarda de regresión explícita contra
 * "prender todas las capas": una categoría sin ningún recurso encontrado
 * nunca debe activar su capa, aunque el perfil de amenaza la declare.
 */
function poiCandidate(category: string): OperationalResourceCandidate {
  return {
    id: `poi-${category}`,
    kind: "critical_poi",
    category: category as OperationalResourceCandidate["category"],
    name: "Recurso de prueba",
    lat: 0,
    lng: 0,
    distanceKm: 1,
    providerAvailable: true,
  };
}

describe("buildLayerActivationPatch", () => {
  const profile = getThreatResourceProfile("FLOOD");

  it("activates criticalPois and medicalPoints when a hospital resource was found, but not shelters", () => {
    const patch = buildLayerActivationPatch(profile, [poiCandidate("hospital")]);
    expect(patch.criticalPois).toBe(true);
    expect(patch.medicalPoints).toBe(true);
    expect(patch.shelters).toBeUndefined();
  });

  it("activates shelters when a shelter resource was found", () => {
    const patch = buildLayerActivationPatch(profile, [poiCandidate("shelter")]);
    expect(patch.shelters).toBe(true);
  });

  it("never activates criticalPois/medicalPoints/shelters when no resource was found at all", () => {
    const patch = buildLayerActivationPatch(profile, []);
    expect(patch.criticalPois).toBeUndefined();
    expect(patch.medicalPoints).toBeUndefined();
    expect(patch.shelters).toBeUndefined();
  });

  it("always activates non-POI context layers declared by the profile (threat context, not resource count)", () => {
    const patch = buildLayerActivationPatch(profile, []);
    expect(patch.terrestrialRoutes).toBe(true);
  });

  it("never touches a MapLayerState key the profile did not declare", () => {
    const patch = buildLayerActivationPatch(profile, [poiCandidate("hospital")]);
    expect(patch.nasaFirms).toBeUndefined();
    expect(patch.usgsEarthquakes).toBeUndefined();
  });
});

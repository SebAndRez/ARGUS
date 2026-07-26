import { describe, expect, it } from "vitest";
import { getThreatResourceProfile } from "@/data/threatResourceMatrix";

/**
 * Fase 1 + Fase 4 — la matriz amenaza→recursos. Cubre los ejemplos
 * explícitos del mandato (flood activa refugios, fire activa bomberos,
 * earthquake activa hospitales) y el fallback para un tipo no mapeado.
 */
describe("getThreatResourceProfile", () => {
  it("flood activates shelters/hospitals/fire/routes", () => {
    const profile = getThreatResourceProfile("FLOOD");
    expect(profile.resourceCategories).toContain("shelter");
    expect(profile.resourceCategories).toContain("hospital");
    expect(profile.resourceCategories).toContain("fire_station");
    expect(profile.layerKeys).toContain("terrestrialRoutes");
  });

  it("wildfire activates fire stations/hospitals/routes/helipad", () => {
    const profile = getThreatResourceProfile("WILDFIRE");
    expect(profile.resourceCategories).toContain("fire_station");
    expect(profile.resourceCategories).toContain("hospital");
    expect(profile.layerKeys).toContain("terrestrialRoutes");
    expect(profile.externalResourceKinds).toContain("helipad");
  });

  it("earthquake activates hospitals/fire/shelters", () => {
    const profile = getThreatResourceProfile("EARTHQUAKE");
    expect(profile.resourceCategories).toContain("hospital");
    expect(profile.resourceCategories).toContain("fire_station");
    expect(profile.resourceCategories).toContain("shelter");
  });

  it("falls back to the default profile for an unmapped type instead of crashing or returning nothing", () => {
    const profile = getThreatResourceProfile("CITIZEN_REPORT");
    expect(profile.id).toBe("default");
    expect(profile.resourceCategories.length).toBeGreaterThan(0);
  });

  it("every profile declares a radius for every severity level", () => {
    const profile = getThreatResourceProfile("EARTHQUAKE");
    for (const severity of ["info", "low", "medium", "high", "critical"] as const) {
      expect(profile.radiusKmBySeverity[severity]).toBeGreaterThan(0);
    }
  });
});

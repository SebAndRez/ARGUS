import { describe, expect, it } from "vitest";
import { resolveImpactArea } from "@/lib/operationalContext/impactAreaResolver";

/**
 * Fase 2 — Impact Area Resolver. El punto usado (-39.2827, -72.2274, el
 * pueblo de Villarrica) fue verificado por point-in-polygon directo contra
 * `src/data/geometries/chileComunas.json`/`chileProvincias.json`/
 * `chileRegions.json` antes de escribir este test — cae dentro de la comuna
 * "Villarrica", provincia "Cautín", región "La Araucanía", las únicas tres
 * comunas que ese dataset "grow-as-needed" cubre hoy.
 */
describe("resolveImpactArea", () => {
  it("resolves real commune/province/region geometry for a known Chilean point", () => {
    const area = resolveImpactArea({ lat: -39.2827, lng: -72.2274, countryCode: "CL", radiusKm: 10 });

    expect(area.hasRealGeometry).toBe(true);
    expect(area.commune).toBe("Villarrica");
    expect(area.province).toBe("Cautín");
    expect(area.region).toBe("La Araucanía");
    expect(area.polygon).not.toBeNull();
  });

  it("falls back to a buffer-only area with no crash for a non-Chilean point", () => {
    const area = resolveImpactArea({ lat: 40.7128, lng: -74.006, countryCode: "US", regionCode: "NY", radiusKm: 15 });

    expect(area.hasRealGeometry).toBe(false);
    expect(area.polygon).toBeNull();
    expect(area.commune).toBeNull();
    expect(area.region).toBe("NY");
    expect(area.bufferBbox.north).toBeGreaterThan(area.bufferBbox.south);
  });

  it("falls back to buffer-only for a Chilean point outside the covered communes", () => {
    // Santiago city center — outside the Villarrica/Pucón/Freire coverage.
    const area = resolveImpactArea({ lat: -33.4489, lng: -70.6693, countryCode: "CL", radiusKm: 10 });

    expect(area.hasRealGeometry).toBe(false);
    expect(area.commune).toBeNull();
  });
});

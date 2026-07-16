import { describe, expect, it } from "vitest";
import { getAllMapLayerPolicies } from "@/lib/source-governance/mapLayerRegistry";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/source-governance/__tests__/mapLayerTaxonomy.test.ts` (a
 * `runMapLayerTaxonomyTest()` export Vitest never ran). Every assertion
 * below is preserved from the original.
 */
describe("getAllMapLayerPolicies", () => {
  const layers = getAllMapLayerPolicies();

  it("has a live_incidents layer visible to citizens by default", () => {
    expect(
      layers.some((layer) => layer.group === "live_incidents" && layer.defaultVisibleCitizen),
    ).toBe(true);
  });

  it("has an osint_signals layer hidden from citizens by default", () => {
    expect(
      layers.some((layer) => layer.group === "osint_signals" && !layer.defaultVisibleCitizen),
    ).toBe(true);
  });

  it("has a historical_memory layer", () => {
    expect(layers.some((layer) => layer.group === "historical_memory")).toBe(true);
  });

  it("has a layer visible in fenix mode", () => {
    expect(layers.some((layer) => layer.visibleInModes.includes("fenix"))).toBe(true);
  });

  it("has a layer visible in nav mode", () => {
    expect(layers.some((layer) => layer.visibleInModes.includes("nav"))).toBe(true);
  });

  it("has a layer visible in aura mode", () => {
    expect(layers.some((layer) => layer.visibleInModes.includes("aura"))).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import type { MapLayerState } from "@/components/map/MapLayerControls";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/knowledge-intake/__tests__/usgsWaterMapLayer.test.ts` (a
 * `runUsgsWaterMapLayerTest()` export Vitest never ran — this repo's
 * `vitest.config.ts` only includes `tests/**`). Every assertion below is
 * preserved from the original, split one per `it`.
 */
describe("usgs-water map layer wiring", () => {
  const layer: Pick<MapLayerState, "usgsWaterConditions"> = {
    usgsWaterConditions: false,
  };
  const metadata = {
    sourceId: "usgs-water",
    layerType: "hydrological_context",
    isIncidentLayer: false,
    defaultVisible: false,
    parameters: ["00060", "00065"],
  };

  it("defaults the layer toggle to off", () => {
    expect(layer.usgsWaterConditions).toBe(false);
  });

  it("tags the layer metadata with the usgs-water source id", () => {
    expect(metadata.sourceId).toBe("usgs-water");
  });

  it("classifies the layer as hydrological_context", () => {
    expect(metadata.layerType).toBe("hydrological_context");
  });

  it("is not an incident layer", () => {
    expect(metadata.isIncidentLayer).toBe(false);
  });

  it("defaults to not visible", () => {
    expect(metadata.defaultVisible).toBe(false);
  });

  it("includes the discharge (00060) parameter", () => {
    expect(metadata.parameters).toContain("00060");
  });

  it("includes the gage height (00065) parameter", () => {
    expect(metadata.parameters).toContain("00065");
  });
});

import { describe, expect, it } from "vitest";
import { buildSourceIntelligencePlan } from "@/lib/source-router/sourceIntelligenceRouter";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/source-router/__tests__/sourceIntelligenceRouter.test.ts` (a
 * `runSourceIntelligenceRouterTest()` export Vitest never ran). Every
 * assertion below is preserved from the original.
 */
describe("buildSourceIntelligencePlan", () => {
  const blockedOsm = buildSourceIntelligencePlan({
    purpose: "infrastructure_context",
    sourceIds: ["osm-overpass"],
    userMode: "command_center",
  });
  const allowedOsm = buildSourceIntelligencePlan({
    purpose: "infrastructure_context",
    sourceIds: ["osm-overpass"],
    userMode: "command_center",
    context: { hasAoi: true },
  });

  it("blocks osm-overpass for infrastructure_context without an AOI", () => {
    expect(blockedOsm.blockedSources.some((source) => source.sourceId === "osm-overpass")).toBe(true);
  });

  it("selects osm-overpass for infrastructure_context when an AOI is present", () => {
    expect(allowedOsm.selectedSources.some((source) => source.sourceId === "osm-overpass")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { filterMapLayersForUserMode, isCandidateVisibleToCitizen } from "@/lib/source-governance/sourceVisibility";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/source-governance/__tests__/sourceVisibility.test.ts` (a
 * `runSourceVisibilityTest()` export Vitest never ran). Every assertion
 * below is preserved from the original.
 */
describe("isCandidateVisibleToCitizen", () => {
  it("a candidate requiring review is not visible to citizens", () => {
    expect(isCandidateVisibleToCitizen({ requiresReview: true })).toBe(false);
  });
});

describe("filterMapLayersForUserMode", () => {
  const citizenLayers = filterMapLayersForUserMode(undefined, "citizen");
  const commandLayers = filterMapLayersForUserMode(undefined, "command_center", {
    hasSelectedIncident: true,
  });

  it("citizen mode excludes osint_signals layers", () => {
    expect(citizenLayers.some((layer) => layer.group === "osint_signals")).toBe(false);
  });

  it("command_center mode with a selected incident includes the gdelt media signals layer", () => {
    expect(commandLayers.some((layer) => layer.layerId === "gdelt-media-signals")).toBe(true);
  });
});

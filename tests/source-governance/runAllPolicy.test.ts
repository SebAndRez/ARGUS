import { describe, expect, it } from "vitest";
import { explainRunAllBlockedSources, getDefaultRunAllSources } from "@/lib/source-governance/runAllPolicy";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/source-governance/__tests__/runAllPolicy.test.ts` (a
 * `runRunAllPolicyTest()` export Vitest never ran). Every assertion below is
 * preserved from the original.
 */
describe("getDefaultRunAllSources", () => {
  const defaults = getDefaultRunAllSources();

  it("includes usgs-earthquake", () => {
    expect(defaults.includes("usgs-earthquake")).toBe(true);
  });

  it("includes gdacs", () => {
    expect(defaults.includes("gdacs")).toBe(true);
  });

  it("excludes gdelt", () => {
    expect(defaults.includes("gdelt")).toBe(false);
  });

  it("excludes osm-overpass", () => {
    expect(defaults.includes("osm-overpass")).toBe(false);
  });
});

describe("explainRunAllBlockedSources", () => {
  const blocked = explainRunAllBlockedSources(["gdelt", "osm-overpass", "noaa-ncei-tsunami"], {
    includeMediaSignals: true,
  });

  it("blocks gdelt", () => {
    expect(blocked.some((item) => item.sourceId === "gdelt")).toBe(true);
  });

  it("blocks osm-overpass", () => {
    expect(blocked.some((item) => item.sourceId === "osm-overpass")).toBe(true);
  });

  it("blocks noaa-ncei-tsunami", () => {
    expect(blocked.some((item) => item.sourceId === "noaa-ncei-tsunami")).toBe(true);
  });
});

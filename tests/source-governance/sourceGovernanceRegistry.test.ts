import { describe, expect, it } from "vitest";
import {
  canSourceCreateIncident,
  getSourceGovernancePolicy,
} from "@/lib/source-governance/sourceGovernanceRegistry";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/source-governance/__tests__/sourceGovernanceRegistry.test.ts` (a
 * `runSourceGovernanceRegistryTest()` export Vitest never ran). Every
 * assertion below is preserved from the original.
 */
describe("canSourceCreateIncident", () => {
  it("usgs-earthquake can create incidents", () => {
    expect(canSourceCreateIncident("usgs-earthquake")).toBeTruthy();
  });

  it("gdacs can create incidents", () => {
    expect(canSourceCreateIncident("gdacs")).toBeTruthy();
  });

  it("noaa-tsunami can create incidents", () => {
    expect(canSourceCreateIncident("noaa-tsunami")).toBeTruthy();
  });
});

describe("getSourceGovernancePolicy", () => {
  it("gdelt cannot create incidents", () => {
    expect(getSourceGovernancePolicy("gdelt")?.canCreateIncident).toBe(false);
  });

  it("osm-overpass cannot create incidents", () => {
    expect(getSourceGovernancePolicy("osm-overpass")?.canCreateIncident).toBe(false);
  });

  it("hdx-hapi cannot create incidents", () => {
    expect(getSourceGovernancePolicy("hdx-hapi")?.canCreateIncident).toBe(false);
  });

  it("noaa-ncei-tsunami has the historical_memory source role", () => {
    expect(getSourceGovernancePolicy("noaa-ncei-tsunami")?.sourceRole).toBe("historical_memory");
  });
});

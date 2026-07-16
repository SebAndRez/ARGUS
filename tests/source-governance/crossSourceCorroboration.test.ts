import { describe, expect, it } from "vitest";
import { getCorroborationLevel } from "@/lib/source-governance/crossSourceCorroboration";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/source-governance/__tests__/crossSourceCorroboration.test.ts` (a
 * `runCrossSourceCorroborationTest()` export Vitest never ran). Every
 * assertion below is preserved from the original.
 */
describe("getCorroborationLevel", () => {
  it("a single media-only source (gdelt) is media_only", () => {
    expect(getCorroborationLevel([{ sourceId: "gdelt" }])).toBe("media_only");
  });

  it("a single forecast source (copernicus-glofas) is forecast_only", () => {
    expect(getCorroborationLevel([{ sourceId: "copernicus-glofas" }])).toBe("forecast_only");
  });

  it("an official source plus an observed source is official_plus_observed", () => {
    expect(
      getCorroborationLevel([{ sourceId: "noaa-tsunami" }, { sourceId: "noaa-coops" }]),
    ).toBe("official_plus_observed");
  });

  it("an admin-validated source is admin_validated", () => {
    expect(getCorroborationLevel([{ sourceId: "gdelt", validatedByAdmin: true }])).toBe(
      "admin_validated",
    );
  });
});

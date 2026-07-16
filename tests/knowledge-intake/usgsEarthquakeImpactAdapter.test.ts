import { describe, expect, it } from "vitest";
import {
  buildEarthquakeOperationalImpactContext,
  buildPagerEvidence,
  buildShakeMapEvidence,
  extractPagerProducts,
  extractShakeMapProducts,
  normalizePagerProduct,
  normalizeShakeMapProduct,
  selectPreferredUsgsProduct,
} from "@/lib/knowledge-intake/adapters/usgsEarthquakeImpactAdapter";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/knowledge-intake/__tests__/usgsEarthquakeImpactAdapter.test.ts`.
 * That file already used describe/it/expect syntax, but declared
 * `describe`/`it`/`expect` as local ambient stubs instead of importing them
 * from a real test runner, so Vitest never executed it (this repo's
 * `vitest.config.ts` only includes `tests/**`).
 *
 * The original fixture also failed `tsc --noEmit`: `geometry.coordinates`
 * was written as a bare `number[]` literal (`[-70, -33, 20]`), which does
 * not satisfy the real (unexported) `UsgsEventDetail` type's
 * `coordinates?: [number, number, number?]` tuple. Fixed here by asserting
 * the literal as the `[lon, lat, depth]` tuple it actually represents —
 * this is a fixture-shape fix only, no production type or logic changed.
 */
const eventDetail = {
  id: "us-test",
  properties: {
    mag: 7.1,
    place: "test place",
    url: "https://earthquake.usgs.gov/earthquakes/eventpage/us-test",
    products: {
      shakemap: [{ id: "sm1", code: "us-test", updateTime: 2, properties: { version: "2", maxmmi: "8.1" }, contents: { "download/cont_mi.json": { url: "https://example.test/contours.json" } } }],
      losspager: [{ id: "pg1", code: "us-test", updateTime: 3, properties: { version: "3", alert: "orange" }, contents: {} }],
    },
  },
  geometry: { type: "Point", coordinates: [-70, -33, 20] as [number, number, number] },
};

describe("usgsEarthquakeImpactAdapter", () => {
  describe("product extraction and selection", () => {
    it("extracts exactly one shakemap product", () => {
      expect(extractShakeMapProducts(eventDetail).length).toBe(1);
    });

    it("extracts exactly one losspager product", () => {
      expect(extractPagerProducts(eventDetail).length).toBe(1);
    });

    it("selects the preferred shakemap product by id", () => {
      expect(selectPreferredUsgsProduct(extractShakeMapProducts(eventDetail), "shakemap")?.id).toBe("sm1");
    });
  });

  describe("context and evidence normalization, without confirming damage", () => {
    const shaking = normalizeShakeMapProduct(extractShakeMapProducts(eventDetail)[0], eventDetail)!;
    const pager = normalizePagerProduct(extractPagerProducts(eventDetail)[0], eventDetail)!;
    const operational = buildEarthquakeOperationalImpactContext({ eventId: "us-test", shakingContext: shaking, impactAssessmentContext: pager });

    it("normalizes the max MMI from the shakemap product", () => {
      expect(shaking.maxMmi).toBe(8.1);
    });

    it("normalizes the overall PAGER alert level", () => {
      expect(pager.overallPagerAlert).toBe("orange");
    });

    it("recommends P1 priority for the combined operational impact context", () => {
      expect(operational.recommendedPriority).toBe("P1");
    });

    it("builds shakemap evidence with the correct evidence type", () => {
      expect(buildShakeMapEvidence(shaking).evidenceType).toBe("earthquake_shaking_context");
    });

    it("builds PAGER evidence with the correct evidence type", () => {
      expect(buildPagerEvidence(pager).evidenceType).toBe("earthquake_impact_assessment_context");
    });
  });
});

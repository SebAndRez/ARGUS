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

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: {
  (value: unknown): {
    toBe: (expected: unknown) => void;
  };
};

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
  geometry: { type: "Point", coordinates: [-70, -33, 20] },
};

describe("usgsEarthquakeImpactAdapter", () => {
  it("extracts and selects preferred products", () => {
    expect(extractShakeMapProducts(eventDetail).length).toBe(1);
    expect(extractPagerProducts(eventDetail).length).toBe(1);
    expect(selectPreferredUsgsProduct(extractShakeMapProducts(eventDetail), "shakemap")?.id).toBe("sm1");
  });

  it("normalizes contexts and evidence without confirming damage", () => {
    const shaking = normalizeShakeMapProduct(extractShakeMapProducts(eventDetail)[0], eventDetail)!;
    const pager = normalizePagerProduct(extractPagerProducts(eventDetail)[0], eventDetail)!;
    const operational = buildEarthquakeOperationalImpactContext({ eventId: "us-test", shakingContext: shaking, impactAssessmentContext: pager });
    expect(shaking.maxMmi).toBe(8.1);
    expect(pager.overallPagerAlert).toBe("orange");
    expect(operational.recommendedPriority).toBe("P1");
    expect(buildShakeMapEvidence(shaking).evidenceType).toBe("earthquake_shaking_context");
    expect(buildPagerEvidence(pager).evidenceType).toBe("earthquake_impact_assessment_context");
  });
});

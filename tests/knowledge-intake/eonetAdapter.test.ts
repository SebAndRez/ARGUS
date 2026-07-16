import { describe, expect, it } from "vitest";
import {
  buildEonetExternalId,
  mapEonetCategoryToArgusDomain,
  normalizeEonetEvent,
} from "@/lib/knowledge-intake/adapters/eonetAdapter";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/knowledge-intake/__tests__/eonetAdapter.test.ts` (a
 * `runEonetAdapterTest()` export Vitest never ran — this repo's
 * `vitest.config.ts` only includes `tests/**`). Every assertion below is
 * preserved from the original; only the reporting shape changed.
 */

describe("normalizeEonetEvent — wildfire, plain (non-GeoJSON) shape with point geometry", () => {
  const wildfire = normalizeEonetEvent({
    id: "EONET_123",
    title: "Wildfire test",
    closed: null,
    categories: [{ id: "wildfires", title: "Wildfires" }],
    sources: [{ id: "NASA", title: "NASA EONET", url: "https://eonet.gsfc.nasa.gov/" }],
    geometry: [
      {
        date: "2026-07-02T00:00:00Z",
        type: "Point",
        coordinates: [-70.6, -33.4],
        magnitudeValue: 12,
        magnitudeUnit: "ha",
        magnitudeDescription: "Estimated area",
      },
    ],
    link: "https://eonet.gsfc.nasa.gov/api/v3/events/EONET_123",
  });

  it("maps the wildfires category to the wildfire ARGUS domain", () => {
    expect(wildfire?.domain).toBe("wildfire");
  });

  it("uses nasa-eonet as the primary sourceId", () => {
    expect(wildfire?.sourceIds[0]).toBe("nasa-eonet");
  });

  it("marks eonetStatus as open when closed is null", () => {
    expect(wildfire?.technicalFactors.eonetStatus).toBe("open");
  });
});

describe("normalizeEonetEvent — flood, GeoJSON Feature shape with polygon geometry, closed", () => {
  const polygon = normalizeEonetEvent({
    type: "Feature",
    id: "EONET_456",
    properties: {
      id: "EONET_456",
      title: "Flood polygon test",
      closed: "2026-07-03T00:00:00Z",
      categories: [{ id: "floods", title: "Floods" }],
      sources: [{ id: "NASA", title: "NASA EONET" }],
    },
    geometry: {
      type: "Polygon",
      coordinates: [[[-71, -34], [-70, -34], [-70, -33], [-71, -33], [-71, -34]]],
    },
  });

  it("maps the floods category to the flood ARGUS domain", () => {
    expect(polygon?.domain).toBe("flood");
  });

  it("defaults severity to low absent an explicit magnitude signal", () => {
    expect(polygon?.severity).toBe("low");
  });

  it("derives a numeric latitude from the polygon geometry", () => {
    expect(typeof polygon?.latitude).toBe("number");
  });
});

describe("buildEonetExternalId / mapEonetCategoryToArgusDomain", () => {
  it("builds the external id straight from the EONET numeric id", () => {
    expect(buildEonetExternalId({ id: "EONET_123" })).toBe("EONET_123");
  });

  it("maps the dustHaze category to the environmental_hazard ARGUS domain", () => {
    expect(mapEonetCategoryToArgusDomain("dustHaze")).toBe("environmental_hazard");
  });
});

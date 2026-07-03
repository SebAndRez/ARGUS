import {
  buildEonetExternalId,
  mapEonetCategoryToArgusDomain,
  normalizeEonetEvent,
} from "@/lib/knowledge-intake/adapters/eonetAdapter";

export function runEonetAdapterTest() {
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

  return {
    passed:
      wildfire?.domain === "wildfire" &&
      wildfire.sourceIds[0] === "nasa-eonet" &&
      wildfire.technicalFactors.eonetStatus === "open" &&
      polygon?.domain === "flood" &&
      polygon.severity === "low" &&
      typeof polygon.latitude === "number" &&
      buildEonetExternalId({ id: "EONET_123" }) === "EONET_123" &&
      mapEonetCategoryToArgusDomain("dustHaze") === "environmental_hazard",
    wildfire,
    polygon,
  };
}

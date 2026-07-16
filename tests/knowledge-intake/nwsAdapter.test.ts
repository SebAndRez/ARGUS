import { describe, expect, it } from "vitest";
import {
  buildNwsExternalId,
  getNwsUserAgent,
  mapNwsEventToArgusDomain,
  mapNwsSeverityToArgusSeverity,
  mapNwsSeverityUrgencyCertaintyToPriority,
  normalizeNwsAlert,
  normalizeNwsAlerts,
  type NwsAlertFeature,
} from "@/lib/knowledge-intake/adapters/nwsAdapter";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/knowledge-intake/__tests__/nwsAdapter.test.ts` (a
 * `runNwsAdapterTest()` export Vitest never ran). Every assertion below is
 * preserved from the original `passed:` chain, split into its own `it`.
 */

function baseAlert(event: string, overrides: Partial<NwsAlertFeature["properties"]> = {}): NwsAlertFeature {
  return {
    id: `https://api.weather.gov/alerts/${event.replace(/\s+/g, "-")}`,
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [[[-118.5, 34], [-118, 34], [-118, 34.4], [-118.5, 34.4], [-118.5, 34]]],
    },
    properties: {
      id: `https://api.weather.gov/alerts/${event.replace(/\s+/g, "-")}`,
      event,
      headline: `${event} headline`,
      description: `${event} description`,
      instruction: "Follow local official instructions.",
      areaDesc: "Los Angeles County",
      severity: "Severe",
      urgency: "Immediate",
      certainty: "Observed",
      messageType: "Alert",
      category: "Met",
      response: "Shelter",
      senderName: "National Weather Service",
      sent: "2026-07-02T12:00:00Z",
      effective: "2026-07-02T12:00:00Z",
      onset: "2026-07-02T12:10:00Z",
      expires: "2026-07-02T14:00:00Z",
      geocode: { UGC: ["CAZ041"] },
      web: "https://api.weather.gov/alerts/test",
      ...overrides,
    },
  };
}

describe("normalizeNwsAlert — domain/severity mapping per alert type", () => {
  const tornado = normalizeNwsAlert(baseAlert("Tornado Warning", { severity: "Extreme" }));
  const thunderstorm = normalizeNwsAlert(baseAlert("Severe Thunderstorm Warning"));
  const flood = normalizeNwsAlert(baseAlert("Flash Flood Warning"));
  const heat = normalizeNwsAlert(baseAlert("Heat Advisory", { severity: "Moderate", urgency: "Expected", certainty: "Likely" }));
  const winter = normalizeNwsAlert(baseAlert("Winter Storm Warning"));
  const redFlag = normalizeNwsAlert(baseAlert("Red Flag Warning"));
  const missingGeometry = normalizeNwsAlert({ ...baseAlert("Dense Fog Advisory", { severity: "Minor" }), geometry: null });

  it("Tornado Warning maps to the tornado domain", () => {
    expect(tornado?.domain).toBe("tornado");
  });

  it("Tornado Warning (Extreme) maps to critical severity", () => {
    expect(tornado?.severity).toBe("critical");
  });

  it("Tornado Warning gets a P0 priority hint", () => {
    expect(tornado?.technicalFactors.priorityHint).toBe("P0");
  });

  it("Severe Thunderstorm Warning maps to the storm domain", () => {
    expect(thunderstorm?.domain).toBe("storm");
  });

  it("Flash Flood Warning maps to the flood domain", () => {
    expect(flood?.domain).toBe("flood");
  });

  it("Heat Advisory maps to the heatwave domain", () => {
    expect(heat?.domain).toBe("heatwave");
  });

  it("Winter Storm Warning maps to the winter_storm domain", () => {
    expect(winter?.domain).toBe("winter_storm");
  });

  it("Red Flag Warning maps to the wildfire_weather domain", () => {
    expect(redFlag?.domain).toBe("wildfire_weather");
  });

  it("an alert with null geometry has no latitude", () => {
    expect(missingGeometry?.latitude).toBeUndefined();
  });
});

describe("normalizeNwsAlerts — deduplication", () => {
  const deduped = normalizeNwsAlerts([baseAlert("Tornado Warning"), baseAlert("Tornado Warning")]);

  it("dedupes identical alerts down to a single incident", () => {
    expect(deduped.incidents.length).toBe(1);
  });

  it("dedupes identical alerts down to a single evidence entry", () => {
    expect(deduped.evidence.length).toBe(1);
  });
});

describe("NWS adapter helper functions", () => {
  it("buildNwsExternalId produces an NWS-prefixed id", () => {
    expect(buildNwsExternalId(baseAlert("Tornado Warning")).startsWith("NWS:")).toBe(true);
  });

  it("mapNwsEventToArgusDomain maps Air Quality Alert to environmental_hazard", () => {
    expect(mapNwsEventToArgusDomain("Air Quality Alert")).toBe("environmental_hazard");
  });

  it("mapNwsSeverityToArgusSeverity maps Extreme to critical", () => {
    expect(mapNwsSeverityToArgusSeverity("Extreme")).toBe("critical");
  });

  it("mapNwsSeverityToArgusSeverity maps Minor to low", () => {
    expect(mapNwsSeverityToArgusSeverity("Minor")).toBe("low");
  });

  it("mapNwsSeverityUrgencyCertaintyToPriority computes P3 for Moderate/Expected/Possible", () => {
    expect(
      mapNwsSeverityUrgencyCertaintyToPriority({ severity: "Moderate", urgency: "Expected", certainty: "Possible" })
    ).toBe("P3");
  });

  it("getNwsUserAgent returns a non-empty user agent string", () => {
    expect(getNwsUserAgent().length > 0).toBe(true);
  });
});

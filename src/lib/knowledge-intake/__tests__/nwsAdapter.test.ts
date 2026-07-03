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

export function runNwsAdapterTest() {
  const tornado = normalizeNwsAlert(baseAlert("Tornado Warning", { severity: "Extreme" }));
  const thunderstorm = normalizeNwsAlert(baseAlert("Severe Thunderstorm Warning"));
  const flood = normalizeNwsAlert(baseAlert("Flash Flood Warning"));
  const heat = normalizeNwsAlert(baseAlert("Heat Advisory", { severity: "Moderate", urgency: "Expected", certainty: "Likely" }));
  const winter = normalizeNwsAlert(baseAlert("Winter Storm Warning"));
  const redFlag = normalizeNwsAlert(baseAlert("Red Flag Warning"));
  const missingGeometry = normalizeNwsAlert({ ...baseAlert("Dense Fog Advisory", { severity: "Minor" }), geometry: null });
  const deduped = normalizeNwsAlerts([baseAlert("Tornado Warning"), baseAlert("Tornado Warning")]);

  return {
    passed:
      tornado?.domain === "tornado" &&
      tornado.severity === "critical" &&
      tornado.technicalFactors.priorityHint === "P0" &&
      thunderstorm?.domain === "storm" &&
      flood?.domain === "flood" &&
      heat?.domain === "heatwave" &&
      winter?.domain === "winter_storm" &&
      redFlag?.domain === "wildfire_weather" &&
      missingGeometry?.latitude === undefined &&
      deduped.incidents.length === 1 &&
      deduped.evidence.length === 1 &&
      buildNwsExternalId(baseAlert("Tornado Warning")).startsWith("NWS:") &&
      mapNwsEventToArgusDomain("Air Quality Alert") === "environmental_hazard" &&
      mapNwsSeverityToArgusSeverity("Extreme") === "critical" &&
      mapNwsSeverityToArgusSeverity("Minor") === "low" &&
      mapNwsSeverityUrgencyCertaintyToPriority({ severity: "Moderate", urgency: "Expected", certainty: "Possible" }) === "P3" &&
      getNwsUserAgent().length > 0,
    tornado,
    thunderstorm,
    flood,
    heat,
    winter,
    redFlag,
    missingGeometry,
    deduped,
  };
}

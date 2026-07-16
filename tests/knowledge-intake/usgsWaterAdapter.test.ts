import { describe, expect, it } from "vitest";
import {
  buildUsgsWaterEvidence,
  buildUsgsWaterHydrologicalContext,
  getUsgsWaterAdapterStatus,
  normalizeUsgsWaterCondition,
  normalizeUsgsWaterLocation,
  validateUsgsWaterRequest,
} from "@/lib/knowledge-intake/adapters/usgsWaterAdapter";
import { buildUsgsWaterRiskContext } from "@/lib/risk/usgsWaterRiskContext";
import { buildUsgsWaterFenixContext } from "@/lib/fenix/usgsWaterFenixContext";
import { buildUsgsWaterRouteContext } from "@/lib/nav/usgsWaterRouteContext";
import { buildUsgsWaterMedicalContext } from "@/lib/aura/usgsWaterMedicalContext";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/knowledge-intake/__tests__/usgsWaterAdapter.test.ts` (a
 * `runUsgsWaterAdapterTest()` export Vitest never ran — this repo's
 * `vitest.config.ts` only includes `tests/**`). Every assertion below is
 * preserved from the original, split one per `it`.
 */
const sampleSeries = {
  sourceInfo: {
    siteName: "POTOMAC RIVER NEAR WASH, DC LITTLE FALLS PUMP STA",
    siteCode: [{ value: "01646500", agencyCode: "USGS" }],
    geoLocation: { geogLocation: { latitude: 38.94977778, longitude: -77.12763889 } },
  },
  variable: {
    variableCode: [{ value: "00060" }],
    variableName: "Discharge, cubic feet per second",
    unit: { unitCode: "ft3/s" },
  },
  values: [{ value: [{ value: "2650", dateTime: new Date().toISOString(), qualifiers: ["P"] }] }],
};

const sampleGageSeries = {
  ...sampleSeries,
  variable: {
    variableCode: [{ value: "00065" }],
    variableName: "Gage height, feet",
    unit: { unitCode: "ft" },
  },
  values: [{ value: [{ value: "4.8", dateTime: new Date().toISOString(), qualifiers: ["P"] }] }],
};

describe("validateUsgsWaterRequest", () => {
  it("rejects a request with no site, lat/lon or bbox", () => {
    const missingFilter = validateUsgsWaterRequest({});
    expect(missingFilter.valid).toBe(false);
    if (missingFilter.valid) throw new Error("expected validation to fail");
    expect(missingFilter.message).toBe("site, lat/lon or bbox required for USGS Water Data context");
  });

  it("rejects an out-of-range latitude", () => {
    expect(validateUsgsWaterRequest({ lat: 91, lon: 0 }).valid).toBe(false);
  });

  it("rejects an out-of-range longitude", () => {
    expect(validateUsgsWaterRequest({ lat: 0, lon: -181 }).valid).toBe(false);
  });

  it("rejects an invalid bbox", () => {
    expect(validateUsgsWaterRequest({ bbox: "10,10,0,0" }).valid).toBe(false);
  });

  it("rejects an unknown parameter code", () => {
    expect(validateUsgsWaterRequest({ site: "01646500", parameters: ["99999"] }).valid).toBe(false);
  });

  it("accepts a valid site request and defaults radiusKm to 50", () => {
    const validSite = validateUsgsWaterRequest({ site: "01646500", parameters: ["00060", "00065"], radiusKm: 99 });
    expect(validSite.valid).toBe(true);
    if (!validSite.valid) throw new Error("expected validation to succeed");
    expect(validSite.params.radiusKm).toBe(50);
  });

  it("accepts a valid lat/lon point request", () => {
    expect(validateUsgsWaterRequest({ lat: 38.9, lon: -77.1, radiusKm: 25 }).valid).toBe(true);
  });
});

describe("normalizeUsgsWaterLocation / normalizeUsgsWaterCondition", () => {
  it("normalizes the site location", () => {
    const location = normalizeUsgsWaterLocation(sampleSeries, { lat: 38.9, lon: -77.1 });
    expect(location?.siteId).toBe("01646500");
  });

  it("normalizes a streamflow (00060) condition", () => {
    const streamflow = normalizeUsgsWaterCondition(sampleSeries);
    expect(streamflow?.parameterCode).toBe("00060");
  });

  it("normalizes a gage height (00065) condition", () => {
    const gageHeight = normalizeUsgsWaterCondition(sampleGageSeries);
    expect(gageHeight?.parameterCode).toBe("00065");
  });
});

describe("buildUsgsWaterHydrologicalContext and downstream module contexts", () => {
  it("builds the hydrological context, evidence, adapter status and downstream contexts", async () => {
    const context = await buildUsgsWaterHydrologicalContext({ conditions: [sampleSeries, sampleGageSeries] }, {
      site: "01646500",
      purpose: "flood",
      parameters: ["00060", "00065"],
    });
    const evidence = buildUsgsWaterEvidence(context, { incidentId: "incident-1" });
    const status = getUsgsWaterAdapterStatus();
    const risk = buildUsgsWaterRiskContext(context);
    const fenix = buildUsgsWaterFenixContext(context);
    const nav = buildUsgsWaterRouteContext(context);
    const aura = buildUsgsWaterMedicalContext(context);

    expect(context.sourceId).toBe("usgs-water");
    expect(context.measurements.length).toBe(2);
    expect(context.riskFactors.floodContextAvailable).toBe(true);
    expect(evidence.sourceId).toBe("usgs-water");
    expect(evidence.incidentId).toBe("incident-1");
    expect(status.requiresApiKey).toBe(false);
    expect(status.apiKeyRequired).toBe(false);
    expect(status.isIncidentSource).toBe(false);
    expect(risk.hydrologicalRiskContext.sourceId).toBe("usgs-water");
    expect(fenix.sourceId).toBe("usgs-water");
    expect(nav.routeAnalysisContext).toBe("water_crossing_context");
    expect(aura.auraContext).toBe("flood_rescue_context");
  });
});

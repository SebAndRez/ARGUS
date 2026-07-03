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

export async function runUsgsWaterAdapterTest() {
  const missingFilter = validateUsgsWaterRequest({});
  const invalidLat = validateUsgsWaterRequest({ lat: 91, lon: 0 });
  const invalidLon = validateUsgsWaterRequest({ lat: 0, lon: -181 });
  const invalidBbox = validateUsgsWaterRequest({ bbox: "10,10,0,0" });
  const invalidParams = validateUsgsWaterRequest({ site: "01646500", parameters: ["99999"] });
  const validSite = validateUsgsWaterRequest({ site: "01646500", parameters: ["00060", "00065"], radiusKm: 99 });
  const validPoint = validateUsgsWaterRequest({ lat: 38.9, lon: -77.1, radiusKm: 25 });
  const location = normalizeUsgsWaterLocation(sampleSeries, { lat: 38.9, lon: -77.1 });
  const streamflow = normalizeUsgsWaterCondition(sampleSeries);
  const gageHeight = normalizeUsgsWaterCondition(sampleGageSeries);
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

  return {
    passed:
      !missingFilter.valid &&
      missingFilter.message === "site, lat/lon or bbox required for USGS Water Data context" &&
      !invalidLat.valid &&
      !invalidLon.valid &&
      !invalidBbox.valid &&
      !invalidParams.valid &&
      validSite.valid &&
      validSite.params.radiusKm === 50 &&
      validPoint.valid &&
      location?.siteId === "01646500" &&
      streamflow?.parameterCode === "00060" &&
      gageHeight?.parameterCode === "00065" &&
      context.sourceId === "usgs-water" &&
      context.measurements.length === 2 &&
      context.riskFactors.floodContextAvailable &&
      evidence.sourceId === "usgs-water" &&
      evidence.incidentId === "incident-1" &&
      status.requiresApiKey === false &&
      status.apiKeyRequired === false &&
      status.isIncidentSource === false &&
      risk.hydrologicalRiskContext.sourceId === "usgs-water" &&
      fenix.sourceId === "usgs-water" &&
      nav.routeAnalysisContext === "water_crossing_context" &&
      aura.auraContext === "flood_rescue_context",
    missingFilter,
    invalidLat,
    invalidLon,
    invalidBbox,
    invalidParams,
    validSite,
    validPoint,
    location,
    streamflow,
    gageHeight,
    context,
    evidence,
    status,
    risk,
    fenix,
    nav,
    aura,
  };
}

import {
  buildCoopsCoastalObservationContext,
  buildCoopsEvidence,
  getCoopsAdapterStatus,
  normalizeCoopsProduct,
  normalizeCoopsStation,
  validateNoaaCoopsRequest,
} from "@/lib/knowledge-intake/adapters/noaaCoopsAdapter";
import { buildNoaaCoopsCoastalRiskContext } from "@/lib/risk/noaaCoopsCoastalRiskContext";
import { buildNoaaCoopsFenixContext } from "@/lib/fenix/noaaCoopsFenixContext";
import { buildNoaaCoopsRouteContext } from "@/lib/nav/noaaCoopsRouteContext";
import { buildNoaaCoopsMedicalContext } from "@/lib/aura/noaaCoopsMedicalContext";

const sampleStation = {
  id: "9414290",
  name: "San Francisco",
  lat: "37.8063",
  lng: "-122.4659",
  state: "CA",
  timezone: "PST",
};

const sampleWaterLevel = {
  data: [{ t: new Date().toISOString(), v: "1.23", f: "0,0,0,0", q: "p" }],
};

const samplePredictions = {
  predictions: [
    { t: new Date(Date.now() + 60 * 60_000).toISOString(), v: "1.8", type: "H" },
    { t: new Date(Date.now() + 7 * 60 * 60_000).toISOString(), v: "0.2", type: "L" },
  ],
};

export async function runNoaaCoopsAdapterTest() {
  const missingFilter = validateNoaaCoopsRequest({});
  const invalidLat = validateNoaaCoopsRequest({ lat: 91, lon: 0 });
  const invalidLon = validateNoaaCoopsRequest({ lat: 0, lon: -181 });
  const invalidBbox = validateNoaaCoopsRequest({ bbox: "10,10,0,0" });
  const invalidUnits = validateNoaaCoopsRequest({ stationId: "9414290", units: "kelvin" });
  const valid = validateNoaaCoopsRequest({ stationId: "9414290", products: ["water_level", "predictions", "wind", "air_pressure", "air_gap"], radiusKm: 99 });
  const station = normalizeCoopsStation(sampleStation, { lat: 37.8, lon: -122.4 });
  const waterLevel = normalizeCoopsProduct("water_level", sampleWaterLevel, { stationId: "9414290", datum: "MLLW", units: "metric" });
  const predictions = normalizeCoopsProduct("predictions", samplePredictions, { stationId: "9414290", datum: "MLLW", units: "metric" });
  const context = await buildCoopsCoastalObservationContext(
    { stationId: "9414290", purpose: "coastal_monitoring", products: ["water_level", "predictions"], datum: "MLLW", includeMetadata: false },
    [
      { product: "water_level", response: sampleWaterLevel, endpoint: "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=9414290&product=water_level" },
      { product: "predictions", response: samplePredictions, endpoint: "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=9414290&product=predictions" },
    ]
  );
  const evidence = buildCoopsEvidence(context, { incidentId: "incident-1" });
  const status = getCoopsAdapterStatus();
  const risk = buildNoaaCoopsCoastalRiskContext(context);
  const fenix = buildNoaaCoopsFenixContext(context);
  const nav = buildNoaaCoopsRouteContext(context);
  const aura = buildNoaaCoopsMedicalContext(context);

  return {
    passed:
      !missingFilter.valid &&
      missingFilter.message === "stationId, lat/lon or bbox required for NOAA CO-OPS coastal context" &&
      !invalidLat.valid &&
      !invalidLon.valid &&
      !invalidBbox.valid &&
      !invalidUnits.valid &&
      valid.valid &&
      valid.params.radiusKm === 50 &&
      valid.params.datum === "MLLW" &&
      station?.stationId === "9414290" &&
      waterLevel[0]?.measurementType === "observed" &&
      waterLevel[0]?.datum === "MLLW" &&
      predictions[0]?.measurementType === "predicted" &&
      context.sourceId === "noaa-coops" &&
      context.riskFactors.datumExplicit &&
      context.riskFactors.observedVsPredictedSeparated &&
      evidence.sourceId === "noaa-coops" &&
      evidence.incidentId === "incident-1" &&
      status.requiresApiKey === false &&
      status.isIncidentSource === false &&
      status.defaultVisible === false &&
      risk.coastalObservationRiskContext.observedWaterLevelAvailability &&
      fenix.caveats.some((item) => item.includes("not an official inundation model")) &&
      nav.routeCaveats.some((item) => item.includes("does not officially close")) &&
      aura.caveats.some((item) => item.includes("does not diagnose")),
    details: {
      missingFilter,
      invalidLat,
      invalidLon,
      invalidBbox,
      invalidUnits,
      valid,
      station,
      waterLevel,
      predictions,
      context,
      evidence,
      status,
      risk,
      fenix,
      nav,
      aura,
    },
  };
}

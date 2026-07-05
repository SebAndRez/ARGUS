import {
  buildIocSlsmfEvidence,
  buildIocSlsmfSeaLevelObservationContext,
  getIocSlsmfAdapterStatus,
  getIocSlsmfApiKeyStatus,
  normalizeIocSlsmfObservation,
  normalizeIocSlsmfStation,
  parseIocSlsmfSeaLevelData,
  parseIocSlsmfSensors,
  parseIocSlsmfStationList,
  validateIocSlsmfRequest,
} from "@/lib/knowledge-intake/adapters/iocSlsmfAdapter";
import { buildIocSeaLevelMedicalContext } from "@/lib/aura/iocSeaLevelMedicalContext";
import { buildIocSeaLevelFenixContext } from "@/lib/fenix/iocSeaLevelFenixContext";
import { buildIocSeaLevelRouteContext } from "@/lib/nav/iocSeaLevelRouteContext";
import { buildIocSeaLevelRiskContext } from "@/lib/risk/iocSeaLevelRiskContext";

const sampleStation = {
  code: "valp",
  name: "Valparaiso",
  country: "Chile",
  lat: "-33.03",
  lon: "-71.63",
  status: "online",
  lastDataTime: new Date().toISOString(),
};

const sampleSensor = {
  sensor_id: "radar-1",
  type: "radar",
  sampling_rate: "1 min",
  datum: "relative",
};

const sampleObservation = {
  code: "valp",
  sensor_id: "radar-1",
  time: new Date().toISOString(),
  value: "1.24",
  units: "m",
  qc_flag: "ok",
};

export async function runIocSlsmfAdapterTest() {
  const previousKey = process.env.IOC_SLSMF_API_KEY;
  delete process.env.IOC_SLSMF_API_KEY;
  const keyStatus = getIocSlsmfApiKeyStatus();
  if (previousKey) process.env.IOC_SLSMF_API_KEY = previousKey;

  const missingFilter = validateIocSlsmfRequest({});
  const invalidLat = validateIocSlsmfRequest({ lat: 91, lon: 0 });
  const invalidLon = validateIocSlsmfRequest({ lat: 0, lon: -181 });
  const invalidBbox = validateIocSlsmfRequest({ bbox: "10,10,0,0" });
  const valid = validateIocSlsmfRequest({ stationCode: "valp", radiusKm: 400, minutes: 999, purpose: "tsunami_context" });
  const stations = parseIocSlsmfStationList({ stations: [sampleStation] });
  const sensors = parseIocSlsmfSensors({ sensors: [sampleSensor] });
  const data = parseIocSlsmfSeaLevelData({ data: [sampleObservation] });
  const station = normalizeIocSlsmfStation(sampleStation, { lat: -33, lon: -71.6 });
  const observation = normalizeIocSlsmfObservation(sampleObservation, { stationCode: "valp" });
  const context = await buildIocSlsmfSeaLevelObservationContext(
    {
      stationCode: "valp",
      includeMetadata: false,
      includeSensors: false,
      includeRecentData: false,
      purpose: "sea_level_monitoring",
    },
    [observation]
  );
  const evidence = buildIocSlsmfEvidence(context, { incidentId: "incident-1" });
  const status = getIocSlsmfAdapterStatus();
  const risk = buildIocSeaLevelRiskContext(context);
  const fenix = buildIocSeaLevelFenixContext(context);
  const nav = buildIocSeaLevelRouteContext(context);
  const aura = buildIocSeaLevelMedicalContext(context);

  return {
    passed:
      keyStatus.status === "requiresConfiguration" &&
      !missingFilter.valid &&
      missingFilter.message === "stationCode, lat/lon or bbox required for IOC SLSMF sea level context" &&
      !invalidLat.valid &&
      !invalidLon.valid &&
      !invalidBbox.valid &&
      valid.valid &&
      valid.params.radiusKm === 250 &&
      valid.params.minutes === 180 &&
      stations.length === 1 &&
      sensors.length === 1 &&
      data.length === 1 &&
      station?.stationCode === "valp" &&
      observation.relativeSeaLevel &&
      observation.datumCaution &&
      context.sourceId === "ioc-slsmf" &&
      context.latest.datumCaution &&
      context.riskFactors.relativeDatumCaution &&
      evidence.sourceId === "ioc-slsmf" &&
      evidence.incidentId === "incident-1" &&
      status.requiresApiKey &&
      status.isIncidentSource === false &&
      status.mapLayer.defaultVisible === false &&
      risk.seaLevelObservationRiskContext.relativeDatumCaution &&
      fenix.caveats.some((item) => item.includes("not an official inundation model")) &&
      nav.routeCaveats.some((item) => item.includes("does not officially close")) &&
      aura.caveats.some((item) => item.includes("does not diagnose")),
    details: {
      keyStatus,
      missingFilter,
      invalidLat,
      invalidLon,
      invalidBbox,
      valid,
      station,
      observation,
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

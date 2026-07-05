import {
  buildOpenAqAirQualityObservationContext,
  buildOpenAqEvidence,
  getOpenAqAdapterStatus,
  getOpenAqApiKeyStatus,
  normalizeOpenAqLatestMeasurement,
  normalizeOpenAqLocation,
  normalizeOpenAqSensor,
  validateOpenAqRequest,
} from "@/lib/knowledge-intake/adapters/openAqAdapter";
import { buildOpenAqRespiratoryContext } from "@/lib/aura/openAqRespiratoryContext";
import { buildOpenAqFenixContext } from "@/lib/fenix/openAqFenixContext";
import { buildOpenAqRouteContext } from "@/lib/nav/openAqRouteContext";
import { buildOpenAqAirQualityRiskContext } from "@/lib/risk/openAqAirQualityRiskContext";

const observedAt = new Date().toISOString();

const sampleLocation = {
  id: 123,
  name: "Santiago Centro",
  country: { code: "CL" },
  coordinates: { latitude: -33.45, longitude: -70.66 },
  timezone: "America/Santiago",
  provider: { id: 1, name: "Provider" },
  owner: { id: 2, name: "Owner" },
  license: { id: 3, name: "License", url: "https://example.test/license" },
  isMobile: false,
  isMonitor: true,
  sensors: [{ id: 456, parameter: { name: "pm25" } }],
};

const sampleSensor = {
  id: 456,
  parameter: { name: "pm25", units: "ug/m3" },
  location: { id: 123 },
  provider: { id: 1, name: "Provider" },
  status: "active",
};

const sampleMeasurement = {
  location: { id: 123 },
  sensor: { id: 456 },
  parameter: { name: "pm25" },
  value: 42,
  unit: { symbol: "ug/m3" },
  datetime: { utc: observedAt },
  coordinates: { latitude: -33.45, longitude: -70.66 },
  provider: { id: 1, name: "Provider" },
  owner: { id: 2, name: "Owner" },
  license: { id: 3, name: "License", url: "https://example.test/license" },
};

export function runOpenAqAdapterTest() {
  const previousKey = process.env.OPENAQ_API_KEY;
  delete process.env.OPENAQ_API_KEY;
  const keyStatus = getOpenAqApiKeyStatus();
  if (previousKey) process.env.OPENAQ_API_KEY = previousKey;

  const missingFilter = validateOpenAqRequest({});
  const invalidLat = validateOpenAqRequest({ lat: 91, lon: 0 });
  const invalidLon = validateOpenAqRequest({ lat: 0, lon: -181 });
  const invalidCombo = validateOpenAqRequest({ lat: -33, lon: -70, bbox: "-71,-34,-70,-33" });
  const invalidRadius = validateOpenAqRequest({ lat: -33, lon: -70, radiusKm: 75 });
  const invalidParameter = validateOpenAqRequest({ lat: -33, lon: -70, parameters: ["lead"] });
  const validLocation = validateOpenAqRequest({ locationId: "123", purpose: "wildfire_smoke_context" });
  const validSensor = validateOpenAqRequest({ sensorId: "456", purpose: "general" });
  const validPoint = validateOpenAqRequest({ lat: -33.45, lon: -70.66, radiusKm: 25 });
  const validBbox = validateOpenAqRequest({ bbox: "-71,-34,-70,-33", parameters: "pm25,pm10" });
  const location = normalizeOpenAqLocation(sampleLocation, { lat: -33.45, lon: -70.66 });
  const sensor = normalizeOpenAqSensor(sampleSensor, location ?? undefined);
  const measurement = normalizeOpenAqLatestMeasurement(sampleMeasurement, { locationId: "123" }, location ?? undefined);
  const staleMeasurement = normalizeOpenAqLatestMeasurement({ ...sampleMeasurement, datetime: { utc: new Date(Date.now() - 4 * 60 * 60_000).toISOString() } }, { locationId: "123" }, location ?? undefined);
  const context = buildOpenAqAirQualityObservationContext(
    { locationId: "123", purpose: "wildfire_smoke_context", parameters: ["pm25", "pm10"] },
    location ? [location] : [],
    [measurement, staleMeasurement].filter(Boolean) as NonNullable<typeof measurement>[],
    [sensor],
    {
      providers: [{ id: 1, name: "Provider" }],
      owners: [{ id: 2, name: "Owner" }],
      licenses: [{ id: 3, name: "License", url: "https://example.test/license" }],
      attributionRequired: true,
      commercialUseStatus: "check_license_per_provider",
      licenseCaveat: "check license",
    },
    ["https://api.openaq.org/v3/locations/123/latest"]
  );
  const evidence = buildOpenAqEvidence(context, { incidentId: "incident-1" });
  const status = getOpenAqAdapterStatus();
  const risk = buildOpenAqAirQualityRiskContext(context);
  const fenix = buildOpenAqFenixContext(context);
  const nav = buildOpenAqRouteContext(context);
  const aura = buildOpenAqRespiratoryContext(context);

  return {
    passed:
      keyStatus.status === "requiresConfiguration" &&
      !missingFilter.valid &&
      missingFilter.message === "locationId, sensorId, lat/lon or bbox required for OpenAQ air quality context" &&
      !invalidLat.valid &&
      !invalidLon.valid &&
      !invalidCombo.valid &&
      !invalidRadius.valid &&
      !invalidParameter.valid &&
      validLocation.valid &&
      validSensor.valid &&
      validPoint.valid &&
      validBbox.valid &&
      location?.locationId === "123" &&
      sensor.sensorId === "456" &&
      measurement?.parameter === "pm25" &&
      context.sourceId === "openaq" &&
      context.riskFactors.elevatedPm25Context &&
      context.riskFactors.staleData &&
      context.providerLicense.commercialUseStatus === "check_license_per_provider" &&
      evidence.sourceId === "openaq" &&
      evidence.incidentId === "incident-1" &&
      evidence.title === "OpenAQ air quality observation context" &&
      status.requiresApiKey &&
      status.isIncidentSource === false &&
      status.mapLayer.defaultVisible === false &&
      risk.airQualityRiskContext.airQualityObservationAvailability &&
      fenix.caveats.some((item) => item.includes("not an official health advisory")) &&
      nav.routeCaveats.some((item) => item.includes("does not officially close")) &&
      aura.caveats.some((item) => item.includes("does not diagnose")),
    details: {
      keyStatus,
      missingFilter,
      invalidLat,
      invalidLon,
      invalidCombo,
      invalidRadius,
      invalidParameter,
      validLocation,
      validSensor,
      validPoint,
      validBbox,
      location,
      sensor,
      measurement,
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

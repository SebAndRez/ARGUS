import { describe, expect, it } from "vitest";
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

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/knowledge-intake/__tests__/openAqAdapter.test.ts` (a
 * `runOpenAqAdapterTest()` export Vitest never ran). Every assertion below
 * is preserved from the original `passed:` chain, split into its own `it`.
 */

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

describe("getOpenAqApiKeyStatus", () => {
  it("reports requiresConfiguration when OPENAQ_API_KEY is unset", () => {
    const previousKey = process.env.OPENAQ_API_KEY;
    delete process.env.OPENAQ_API_KEY;
    const keyStatus = getOpenAqApiKeyStatus();
    if (previousKey) process.env.OPENAQ_API_KEY = previousKey;
    expect(keyStatus.status).toBe("requiresConfiguration");
  });
});

describe("validateOpenAqRequest — invalid inputs", () => {
  it("rejects a request with no filter at all", () => {
    const missingFilter = validateOpenAqRequest({});
    expect(missingFilter.valid).toBe(false);
  });

  it("reports the expected message for a missing filter", () => {
    const missingFilter = validateOpenAqRequest({});
    expect(missingFilter.valid).toBe(false);
    if (missingFilter.valid) return;
    expect(missingFilter.message).toBe(
      "locationId, sensorId, lat/lon or bbox required for OpenAQ air quality context"
    );
  });

  it("rejects an out-of-range latitude", () => {
    const invalidLat = validateOpenAqRequest({ lat: 91, lon: 0 });
    expect(invalidLat.valid).toBe(false);
  });

  it("rejects an out-of-range longitude", () => {
    const invalidLon = validateOpenAqRequest({ lat: 0, lon: -181 });
    expect(invalidLon.valid).toBe(false);
  });

  it("rejects lat/lon combined with a bbox", () => {
    const invalidCombo = validateOpenAqRequest({ lat: -33, lon: -70, bbox: "-71,-34,-70,-33" });
    expect(invalidCombo.valid).toBe(false);
  });

  it("rejects a radius outside the allowed limit", () => {
    const invalidRadius = validateOpenAqRequest({ lat: -33, lon: -70, radiusKm: 75 });
    expect(invalidRadius.valid).toBe(false);
  });

  it("rejects a non-whitelisted parameter", () => {
    const invalidParameter = validateOpenAqRequest({ lat: -33, lon: -70, parameters: ["lead"] });
    expect(invalidParameter.valid).toBe(false);
  });
});

describe("validateOpenAqRequest — valid inputs", () => {
  it("accepts a locationId request", () => {
    const validLocation = validateOpenAqRequest({ locationId: "123", purpose: "wildfire_smoke_context" });
    expect(validLocation.valid).toBe(true);
  });

  it("accepts a sensorId request", () => {
    const validSensor = validateOpenAqRequest({ sensorId: "456", purpose: "general" });
    expect(validSensor.valid).toBe(true);
  });

  it("accepts a lat/lon + radius request", () => {
    const validPoint = validateOpenAqRequest({ lat: -33.45, lon: -70.66, radiusKm: 25 });
    expect(validPoint.valid).toBe(true);
  });

  it("accepts a bbox + parameters request", () => {
    const validBbox = validateOpenAqRequest({ bbox: "-71,-34,-70,-33", parameters: "pm25,pm10" });
    expect(validBbox.valid).toBe(true);
  });
});

describe("normalization of location/sensor/measurement", () => {
  const location = normalizeOpenAqLocation(sampleLocation, { lat: -33.45, lon: -70.66 });
  const sensor = normalizeOpenAqSensor(sampleSensor, location ?? undefined);
  const measurement = normalizeOpenAqLatestMeasurement(sampleMeasurement, { locationId: "123" }, location ?? undefined);

  it("normalizeOpenAqLocation preserves the locationId", () => {
    expect(location?.locationId).toBe("123");
  });

  it("normalizeOpenAqSensor preserves the sensorId", () => {
    expect(sensor.sensorId).toBe("456");
  });

  it("normalizeOpenAqLatestMeasurement preserves the parameter", () => {
    expect(measurement?.parameter).toBe("pm25");
  });
});

describe("buildOpenAqAirQualityObservationContext and downstream consumers", () => {
  const location = normalizeOpenAqLocation(sampleLocation, { lat: -33.45, lon: -70.66 });
  const sensor = normalizeOpenAqSensor(sampleSensor, location ?? undefined);
  const measurement = normalizeOpenAqLatestMeasurement(sampleMeasurement, { locationId: "123" }, location ?? undefined);
  const staleMeasurement = normalizeOpenAqLatestMeasurement(
    { ...sampleMeasurement, datetime: { utc: new Date(Date.now() - 4 * 60 * 60_000).toISOString() } },
    { locationId: "123" },
    location ?? undefined
  );
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

  it("context has the openaq sourceId", () => {
    expect(context.sourceId).toBe("openaq");
  });

  it("context flags an elevated PM2.5 context", () => {
    expect(context.riskFactors.elevatedPm25Context).toBeTruthy();
  });

  it("context flags stale data given the stale measurement", () => {
    expect(context.riskFactors.staleData).toBeTruthy();
  });

  it("context carries the check_license_per_provider commercial use status", () => {
    expect(context.providerLicense.commercialUseStatus).toBe("check_license_per_provider");
  });

  it("evidence has the openaq sourceId", () => {
    expect(evidence.sourceId).toBe("openaq");
  });

  it("evidence carries the incidentId", () => {
    expect(evidence.incidentId).toBe("incident-1");
  });

  it("evidence has the expected title", () => {
    expect(evidence.title).toBe("OpenAQ air quality observation context");
  });

  it("status requires an API key", () => {
    expect(status.requiresApiKey).toBeTruthy();
  });

  it("status is not an incident source", () => {
    expect(status.isIncidentSource).toBe(false);
  });

  it("status map layer is not visible by default", () => {
    expect(status.mapLayer.defaultVisible).toBe(false);
  });

  it("risk context reports air quality observation availability", () => {
    expect(risk.airQualityRiskContext.airQualityObservationAvailability).toBeTruthy();
  });

  it("fenix caveats mention it is not an official health advisory", () => {
    expect(fenix.caveats.some((item) => item.includes("not an official health advisory"))).toBe(true);
  });

  it("nav caveats mention that OpenAQ does not officially close routes", () => {
    expect(nav.routeCaveats.some((item) => item.includes("does not officially close"))).toBe(true);
  });

  it("aura caveats mention it does not diagnose", () => {
    expect(aura.caveats.some((item) => item.includes("does not diagnose"))).toBe(true);
  });
});

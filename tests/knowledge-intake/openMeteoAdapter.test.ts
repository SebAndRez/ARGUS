import { describe, expect, it } from "vitest";
import {
  buildOpenMeteoEvidence,
  buildOpenMeteoWeatherContext,
  getOpenMeteoAdapterStatus,
  getOpenMeteoVariablesForPurpose,
  validateOpenMeteoRequest,
} from "@/lib/knowledge-intake/adapters/openMeteoAdapter";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/knowledge-intake/__tests__/openMeteoAdapter.test.ts` (a
 * `runOpenMeteoAdapterTest()` export Vitest never ran). Every assertion below
 * is preserved from the original `passed:` chain, split into its own `it`.
 */

const sampleForecast = {
  latitude: -33.45,
  longitude: -70.66,
  timezone: "America/Santiago",
  hourly: {
    time: ["2026-07-03T00:00", "2026-07-03T01:00"],
    temperature_2m: [8, 10],
    relative_humidity_2m: [30, 32],
    apparent_temperature: [6, 7],
    precipitation: [0, 0],
    precipitation_probability: [5, 10],
    rain: [0, 0],
    showers: [0, 0],
    snowfall: [0, 0],
    weather_code: [1, 2],
    cloud_cover: [20, 25],
    visibility: [10000, 9000],
    wind_speed_10m: [42, 45],
    wind_direction_10m: [180, 190],
    wind_gusts_10m: [58, 62],
  },
  daily: {
    time: ["2026-07-03", "2026-07-04", "2026-07-05"],
    temperature_2m_max: [14, 15, 16],
    temperature_2m_min: [4, 5, 6],
    precipitation_sum: [0, 1, 0],
    rain_sum: [0, 1, 0],
    snowfall_sum: [0, 0, 0],
    precipitation_hours: [0, 1, 0],
    wind_speed_10m_max: [45, 40, 35],
    wind_gusts_10m_max: [62, 55, 50],
  },
};

describe("validateOpenMeteoRequest", () => {
  it("rejects a request with no coordinates", () => {
    const missingCoordinates = validateOpenMeteoRequest({});
    expect(missingCoordinates.valid).toBe(false);
  });

  it("reports the expected message for missing coordinates", () => {
    const missingCoordinates = validateOpenMeteoRequest({});
    expect(missingCoordinates.valid).toBe(false);
    if (missingCoordinates.valid) return;
    expect(missingCoordinates.message).toBe("lat/lon required for Open-Meteo weather context");
  });

  it("rejects an out-of-range latitude", () => {
    const invalidLat = validateOpenMeteoRequest({ lat: 91, lon: 0 });
    expect(invalidLat.valid).toBe(false);
  });

  it("rejects an out-of-range longitude", () => {
    const invalidLon = validateOpenMeteoRequest({ lat: 0, lon: -181 });
    expect(invalidLon.valid).toBe(false);
  });

  it("rejects an out-of-range forecastDays", () => {
    const invalidDays = validateOpenMeteoRequest({ lat: 0, lon: 0, forecastDays: 4 });
    expect(invalidDays.valid).toBe(false);
  });

  it("accepts a valid lat/lon + purpose request", () => {
    const valid = validateOpenMeteoRequest({ lat: -33.45, lon: -70.66, purpose: "wildfire" });
    expect(valid.valid).toBe(true);
  });

  it("defaults forecastDays to 3 for a valid request", () => {
    const valid = validateOpenMeteoRequest({ lat: -33.45, lon: -70.66, purpose: "wildfire" });
    expect(valid.valid).toBe(true);
    if (!valid.valid) return;
    expect(valid.params.forecastDays).toBe(3);
  });
});

describe("buildOpenMeteoWeatherContext and downstream helpers", () => {
  const context = buildOpenMeteoWeatherContext(sampleForecast, {
    lat: -33.45,
    lon: -70.66,
    purpose: "wildfire",
    incidentId: "incident-1",
    forecastDays: 3,
    persist: true,
  });
  const evidence = buildOpenMeteoEvidence(context, { incidentId: "incident-1", purpose: "wildfire", persist: true });
  const status = getOpenMeteoAdapterStatus();
  const navVariables = getOpenMeteoVariablesForPurpose("nav");

  it("context has the open-meteo sourceId", () => {
    expect(context.sourceId).toBe("open-meteo");
  });

  it("context preserves the forecastDays", () => {
    expect(context.forecastDays).toBe(3);
  });

  it("context preserves the purpose", () => {
    expect(context.purpose).toBe("wildfire");
  });

  it("context flags high wind given the sample gusts", () => {
    expect(context.riskFactors.highWind).toBeTruthy();
  });

  it("context flags strong gusts given the sample gusts", () => {
    expect(context.riskFactors.strongGusts).toBeTruthy();
  });

  it("context flags wildfire weather", () => {
    expect(context.riskFactors.wildfireWeather).toBeTruthy();
  });

  it("context metadata.layer is an object", () => {
    expect(context.metadata.layer instanceof Object).toBe(true);
  });

  it("evidence has the open-meteo sourceId", () => {
    expect(evidence.sourceId).toBe("open-meteo");
  });

  it("evidence carries the incidentId", () => {
    expect(evidence.incidentId).toBe("incident-1");
  });

  it("evidence has the expected title", () => {
    expect(evidence.title).toBe("Open-Meteo weather context");
  });

  it("status reports commercialUse as requiresReview", () => {
    expect(status.commercialUse).toBe("requiresReview");
  });

  it("status is not an alert source", () => {
    expect(status.alertSource).toBe(false);
  });

  it("nav-purpose hourly variables include visibility", () => {
    expect(navVariables.hourly.includes("visibility")).toBe(true);
  });
});

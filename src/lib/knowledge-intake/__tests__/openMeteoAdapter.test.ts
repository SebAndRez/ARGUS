import {
  buildOpenMeteoEvidence,
  buildOpenMeteoWeatherContext,
  getOpenMeteoAdapterStatus,
  getOpenMeteoVariablesForPurpose,
  validateOpenMeteoRequest,
} from "@/lib/knowledge-intake/adapters/openMeteoAdapter";

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

export function runOpenMeteoAdapterTest() {
  const missingCoordinates = validateOpenMeteoRequest({});
  const invalidLat = validateOpenMeteoRequest({ lat: 91, lon: 0 });
  const invalidLon = validateOpenMeteoRequest({ lat: 0, lon: -181 });
  const invalidDays = validateOpenMeteoRequest({ lat: 0, lon: 0, forecastDays: 4 });
  const valid = validateOpenMeteoRequest({ lat: -33.45, lon: -70.66, purpose: "wildfire" });
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

  return {
    passed:
      !missingCoordinates.valid &&
      missingCoordinates.message === "lat/lon required for Open-Meteo weather context" &&
      !invalidLat.valid &&
      !invalidLon.valid &&
      !invalidDays.valid &&
      valid.valid &&
      valid.params.forecastDays === 3 &&
      context.sourceId === "open-meteo" &&
      context.forecastDays === 3 &&
      context.purpose === "wildfire" &&
      context.riskFactors.highWind &&
      context.riskFactors.strongGusts &&
      context.riskFactors.wildfireWeather &&
      context.metadata.layer instanceof Object &&
      evidence.sourceId === "open-meteo" &&
      evidence.incidentId === "incident-1" &&
      evidence.title === "Open-Meteo weather context" &&
      status.commercialUse === "requiresReview" &&
      status.alertSource === false &&
      navVariables.hourly.includes("visibility"),
    missingCoordinates,
    invalidLat,
    invalidLon,
    invalidDays,
    valid,
    context,
    evidence,
    status,
    navVariables,
  };
}

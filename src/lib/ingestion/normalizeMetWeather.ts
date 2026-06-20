import { getArgusSource } from "@/config/argusSourceRegistry";
import { getCardinalDirection, getWindToDeg } from "@/lib/riskProjection";
import type {
  MetNorwayLocationforecastResponse,
  WeatherObservation,
} from "@/types/weatherRisk";

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function metersPerSecondToKmh(value: number | null) {
  return value === null ? null : Math.round(value * 3.6 * 10) / 10;
}

function formatForecastTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Hora de pronóstico no disponible";

  return `Pronóstico ${new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date)}`;
}

export function normalizeMetWeather(
  payload: MetNorwayLocationforecastResponse,
  location: { latitude: number; longitude: number }
): WeatherObservation | null {
  const timePoint = payload.properties?.timeseries?.find((point) => {
    const details = point.data?.instant?.details;
    return (
      point.time &&
      finiteNumber(details?.wind_from_direction) !== null &&
      finiteNumber(details?.wind_speed) !== null
    );
  });
  if (!timePoint?.time) return null;

  const details = timePoint.data?.instant?.details;
  const windFromDeg = finiteNumber(details?.wind_from_direction);
  const windSpeedKmh = metersPerSecondToKmh(
    finiteNumber(details?.wind_speed)
  );
  if (windFromDeg === null || windSpeedKmh === null) return null;

  const normalizedWindFromDeg = ((windFromDeg % 360) + 360) % 360;
  const windToDeg = Math.round(getWindToDeg(normalizedWindFromDeg) * 10) / 10;
  const temperatureC = finiteNumber(details?.air_temperature);
  const humidityPct = finiteNumber(details?.relative_humidity);
  const gustKmh = metersPerSecondToKmh(
    finiteNumber(details?.wind_speed_of_gust)
  );
  const pressureHpa = finiteNumber(details?.air_pressure_at_sea_level);
  const conditionSymbol =
    timePoint.data?.next_1_hours?.summary?.symbol_code ??
    timePoint.data?.next_6_hours?.summary?.symbol_code ??
    null;
  const optionalValues = [
    temperatureC,
    humidityPct,
    gustKmh,
    pressureHpa,
    conditionSymbol,
  ];
  const availableOptionalValues = optionalValues.filter(
    (value) => value !== null && value !== undefined
  ).length;
  const source = getArgusSource("met_norway");

  return {
    id: `met-norway-${location.latitude.toFixed(4)}-${location.longitude.toFixed(4)}-${timePoint.time}`,
    label: "Viento MET Norway",
    latitude: location.latitude,
    longitude: location.longitude,
    sourceType: "external_forecast",
    sourceName: source?.name ?? "MET Norway Locationforecast",
    observedAtLabel: formatForecastTime(timePoint.time),
    temperatureC,
    humidityPct,
    windFromDeg: normalizedWindFromDeg,
    windFromLabel: getCardinalDirection(normalizedWindFromDeg),
    windToDeg,
    windToLabel: getCardinalDirection(windToDeg),
    windSpeedKmh,
    gustKmh,
    pressureHpa,
    conditionSymbol,
    forecastAt: timePoint.time,
    confidence:
      availableOptionalValues >= 4
        ? source?.reliabilityScore ?? 95
        : availableOptionalValues >= 2
          ? 88
          : 80,
  };
}

import type { ArgusIngestionSeverity } from "@/types/ingestion";

export type WeatherSourceType =
  | "demo"
  | "external_forecast"
  | "meteorological_center"
  | "camera_metadata"
  | "sensor"
  | "manual_operator";

export interface WeatherObservation {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  sourceType: WeatherSourceType;
  sourceName: string;
  observedAtLabel: string;
  temperatureC?: number | null;
  humidityPct?: number | null;
  visibilityKm?: number | null;
  windFromDeg: number;
  windFromLabel: string;
  windToDeg?: number | null;
  windToLabel?: string | null;
  windSpeedKmh: number;
  gustKmh?: number | null;
  pressureHpa?: number | null;
  conditionSymbol?: string | null;
  forecastAt?: string | null;
  confidence: number;
}

export interface MetNorwayLocationforecastResponse {
  type: "Feature";
  geometry?: {
    type: "Point";
    coordinates: [longitude: number, latitude: number, altitude?: number];
  };
  properties?: {
    meta?: {
      updated_at?: string;
      units?: Record<string, string>;
    };
    timeseries?: Array<{
      time?: string;
      data?: {
        instant?: {
          details?: {
            air_temperature?: number;
            relative_humidity?: number;
            wind_from_direction?: number;
            wind_speed?: number;
            wind_speed_of_gust?: number;
            air_pressure_at_sea_level?: number;
          };
        };
        next_1_hours?: {
          summary?: {
            symbol_code?: string;
          };
        };
        next_6_hours?: {
          summary?: {
            symbol_code?: string;
          };
        };
      };
    }>;
  };
}

export interface MetWeatherSourceResponse {
  sourceId: "met_norway";
  sourceName: string;
  cached: boolean;
  fetchedAt: string;
  expiresAt: string;
  location: {
    latitude: number;
    longitude: number;
  };
  weather: WeatherObservation;
}

export type HazardKind =
  | "fire_smoke"
  | "chemical_plume"
  | "gas_leak"
  | "wildfire"
  | "unknown_hazard";

/** @deprecated Value-identical to `ArgusIngestionSeverity` (`@/types/ingestion`) — use that directly in new code. Kept as an alias (Prompt 20 cleanup); has no external consumers of its own. */
export type HazardSeverity = ArgusIngestionSeverity;

export interface HazardOrigin {
  id: string;
  title: string;
  kind: HazardKind;
  latitude: number;
  longitude: number;
  severity: HazardSeverity;
  sourceSummary: string;
}

export interface RiskProjection {
  id: string;
  hazardId: string;
  title: string;
  kind: HazardKind;
  severity: HazardSeverity;
  originLatitude: number;
  originLongitude: number;
  windFromDeg: number;
  windFromLabel: string;
  windToDeg: number;
  windToLabel: string;
  windSpeedKmh: number;
  radiusMeters: number;
  spreadAngleDeg: number;
  confidence: number;
  observedAtLabel: string;
  explanation: string;
  recommendedAction: string;
}

export type MapCoordinate = [latitude: number, longitude: number];

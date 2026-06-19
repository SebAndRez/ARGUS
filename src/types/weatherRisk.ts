export type WeatherSourceType =
  | "demo"
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
  windSpeedKmh: number;
  gustKmh?: number | null;
  confidence: number;
}

export type HazardKind =
  | "fire_smoke"
  | "chemical_plume"
  | "gas_leak"
  | "wildfire"
  | "unknown_hazard";

export type HazardSeverity = "low" | "medium" | "high" | "critical";

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

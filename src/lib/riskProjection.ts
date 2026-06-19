import type {
  HazardOrigin,
  MapCoordinate,
  RiskProjection,
  WeatherObservation,
} from "@/types/weatherRisk";

const EARTH_RADIUS_METERS = 6_371_000;

const normalizeDegrees = (degrees: number) => ((degrees % 360) + 360) % 360;

export function getWindToDeg(windFromDeg: number): number {
  return normalizeDegrees(windFromDeg + 180);
}

export function getCardinalDirection(degrees: number): string {
  const labels = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  const normalized = normalizeDegrees(degrees);
  return labels[Math.round(normalized / 45) % labels.length];
}

interface CreateRiskProjectionInput {
  id: string;
  title: string;
  hazard: HazardOrigin;
  weather: WeatherObservation;
  radiusMeters: number;
  spreadAngleDeg: number;
  confidence: number;
  explanation: string;
  recommendedAction: string;
}

export function createRiskProjection({
  id,
  title,
  hazard,
  weather,
  radiusMeters,
  spreadAngleDeg,
  confidence,
  explanation,
  recommendedAction,
}: CreateRiskProjectionInput): RiskProjection {
  const windToDeg = getWindToDeg(weather.windFromDeg);

  return {
    id,
    hazardId: hazard.id,
    title,
    kind: hazard.kind,
    severity: hazard.severity,
    originLatitude: hazard.latitude,
    originLongitude: hazard.longitude,
    windFromDeg: normalizeDegrees(weather.windFromDeg),
    windFromLabel: weather.windFromLabel,
    windToDeg,
    windToLabel: getCardinalDirection(windToDeg),
    windSpeedKmh: weather.windSpeedKmh,
    radiusMeters,
    spreadAngleDeg,
    confidence: Math.max(0, Math.min(100, confidence)),
    observedAtLabel: weather.observedAtLabel,
    explanation,
    recommendedAction,
  };
}

function destinationPoint(
  latitude: number,
  longitude: number,
  bearingDeg: number,
  distanceMeters: number
): MapCoordinate {
  const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
  const bearing = (normalizeDegrees(bearingDeg) * Math.PI) / 180;
  const latitudeRad = (latitude * Math.PI) / 180;
  const longitudeRad = (longitude * Math.PI) / 180;

  const destinationLatitude = Math.asin(
    Math.sin(latitudeRad) * Math.cos(angularDistance) +
      Math.cos(latitudeRad) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const destinationLongitude =
    longitudeRad +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitudeRad),
      Math.cos(angularDistance) - Math.sin(latitudeRad) * Math.sin(destinationLatitude)
    );

  return [
    (destinationLatitude * 180) / Math.PI,
    (destinationLongitude * 180) / Math.PI,
  ];
}

export function buildRiskConePolygon(
  projection: RiskProjection,
  arcSteps = 12
): MapCoordinate[] {
  const safeSteps = Math.max(4, Math.round(arcSteps));
  const halfSpread = projection.spreadAngleDeg / 2;
  const startBearing = projection.windToDeg - halfSpread;
  const stepSize = projection.spreadAngleDeg / safeSteps;
  const points: MapCoordinate[] = [
    [projection.originLatitude, projection.originLongitude],
  ];

  // Visual approximation only. This sector is not an atmospheric dispersion model.
  for (let index = 0; index <= safeSteps; index += 1) {
    points.push(
      destinationPoint(
        projection.originLatitude,
        projection.originLongitude,
        startBearing + stepSize * index,
        projection.radiusMeters
      )
    );
  }

  return points;
}

import { getArgusSource } from "@/config/argusSourceRegistry";
import {
  classifySeismicEvent,
  estimateMercalliFromMagnitude,
  formatMagnitudeLabel,
  formatMagnitudePhrase,
  formatMercalliLabel,
} from "@/lib/seismicLabels";
import type {
  ArgusIngestionSeverity,
  ArgusNormalizedEvent,
  UsgsEarthquakeFeature,
} from "@/types/ingestion";

const RECOMMENDED_ACTION =
  "Revise información oficial y manténgase atento a réplicas si está cerca de la zona.";

function getSeverity(magnitude: number): ArgusIngestionSeverity {
  if (magnitude >= 6.5) return "critical";
  if (magnitude >= 5.0) return "high";
  if (magnitude >= 3.5) return "medium";
  return "low";
}

function toIsoDate(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeUsGsEarthquake(
  feature: UsgsEarthquakeFeature
): ArgusNormalizedEvent | null {
  const magnitude = Number(feature.properties.mag);
  const longitude = Number(feature.geometry?.coordinates?.[0]);
  const latitude = Number(feature.geometry?.coordinates?.[1]);
  const depthKm = Number(feature.geometry?.coordinates?.[2]);
  const occurredAt = toIsoDate(feature.properties.time);

  if (
    !feature.id ||
    !Number.isFinite(magnitude) ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !occurredAt
  ) {
    return null;
  }

  const place = feature.properties.place?.trim() || "ubicación no especificada";
  const source = getArgusSource("usgs_earthquake");
  const magnitudeType = feature.properties.magType?.trim() || null;
  const officialMmi =
    typeof feature.properties.mmi === "number"
      ? feature.properties.mmi
      : typeof feature.properties.cdi === "number"
        ? feature.properties.cdi
        : null;
  const classification = classifySeismicEvent(magnitude, officialMmi);
  const magnitudeLabel = formatMagnitudeLabel(magnitude, magnitudeType);
  const magnitudePhrase = formatMagnitudePhrase(magnitude, magnitudeType);
  const depthLabel = Number.isFinite(depthKm)
    ? `Profundidad: ${depthKm.toFixed(1)} km.`
    : "Profundidad no informada.";
  const estimatedMmi = estimateMercalliFromMagnitude(
    magnitude,
    Number.isFinite(depthKm) ? depthKm : null
  );
  const mercalliLabel = formatMercalliLabel(officialMmi, estimatedMmi);

  return {
    id: `usgs-earthquake-${feature.id}`,
    sourceId: "usgs_earthquake",
    sourceName: source?.name ?? "USGS Earthquake",
    externalId: feature.id,
    title: `${classification} · ${magnitudeLabel} · ${place}`,
    description: `${classification} de ${magnitudePhrase} en ${place}. ${depthLabel} ${mercalliLabel}.`,
    category: "earthquake",
    severity: getSeverity(magnitude),
    confidence: source?.reliabilityScore ?? 98,
    latitude,
    longitude,
    occurredAt,
    updatedAt: toIsoDate(feature.properties.updated),
    url: feature.properties.url ?? null,
    rawMagnitude: magnitude,
    rawMagnitudeType: magnitudeType,
    rawDepthKm: Number.isFinite(depthKm) ? depthKm : null,
    rawOfficialMmi: officialMmi,
    locationName: place,
    recommendedAction: RECOMMENDED_ACTION,
    whyItMatters: `${classification} en ${place}. ${magnitudeLabel}. ${depthLabel} ${mercalliLabel}.`,
    isExternal: true,
  };
}

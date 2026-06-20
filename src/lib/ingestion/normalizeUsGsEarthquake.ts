import { getArgusSource } from "@/config/argusSourceRegistry";
import type {
  ArgusIngestionSeverity,
  ArgusNormalizedEvent,
  UsgsEarthquakeFeature,
} from "@/types/ingestion";

const RECOMMENDED_ACTION =
  "Revise información oficial y manténgase atento a réplicas si está cerca de la zona.";

function getSeverity(magnitude: number): ArgusIngestionSeverity {
  if (magnitude >= 7) return "critical";
  if (magnitude >= 5.5) return "high";
  if (magnitude >= 4.5) return "medium";
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
  const depthLabel = Number.isFinite(depthKm)
    ? ` Profundidad aproximada: ${depthKm.toFixed(1)} km.`
    : "";

  return {
    id: `usgs-earthquake-${feature.id}`,
    sourceId: "usgs_earthquake",
    sourceName: source?.name ?? "USGS Earthquake",
    externalId: feature.id,
    title: `Sismo M${magnitude.toFixed(1)} · ${place}`,
    description: `Evento sísmico publicado por USGS.${depthLabel}`,
    category: "earthquake",
    severity: getSeverity(magnitude),
    confidence: source?.reliabilityScore ?? 98,
    latitude,
    longitude,
    occurredAt,
    updatedAt: toIsoDate(feature.properties.updated),
    url: feature.properties.url ?? null,
    rawMagnitude: magnitude,
    rawDepthKm: Number.isFinite(depthKm) ? depthKm : null,
    locationName: place,
    recommendedAction: RECOMMENDED_ACTION,
    whyItMatters: `Magnitud ${magnitude.toFixed(1)} cerca de ${place}.${depthLabel}`,
    isExternal: true,
  };
}

import type { ArgusIncidentKnowledge } from "@/types/knowledgeIntake";
import type { GlobalThreatType } from "@/lib/vigia/threatClassifier";

/**
 * Clave estable de deduplicación cross-fuente de Global Watch:
 * `country + region + threatType + roundedCoordinates + dateBucket`.
 *
 * Con esto:
 * - 20 focos FIRMS de la misma zona/día caen en la misma clave (el
 *   clusterer ya los agrupa antes, esta clave es la red de seguridad);
 * - varias noticias/fuentes del mismo evento comparten clave y se fusionan
 *   subiendo confianza en lugar de duplicarse;
 * - una actualización oficial del mismo evento re-usa la clave y actualiza
 *   el incidente existente en vez de crear uno nuevo.
 *
 * Nota: los sismos NO usan bucket geo-temporal como identidad primaria —
 * dos terremotos reales pueden ocurrir el mismo día en la misma zona; ahí
 * manda el ID nativo USGS/GDACS. La clave se usa igualmente para agrupar
 * corroboración entre fuentes.
 */

function slugPart(value: string | undefined | null, fallback: string): string {
  const slug = (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || fallback;
}

function roundCoordinate(value: number | undefined, precision: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "x";
  return (Math.round(value / precision) * precision).toFixed(2);
}

/** Ancho del bucket temporal por tipo de amenaza (horas). Fenómenos largos usan buckets diarios. */
const DATE_BUCKET_HOURS: Partial<Record<GlobalThreatType, number>> = {
  EARTHQUAKE: 1,
  TSUNAMI: 6,
  TORNADO: 6,
  WATERSPOUT: 6,
  SEVERE_WIND: 12,
  SEVERE_WEATHER: 12,
  WILDFIRE: 24,
  FLOOD: 24,
  LANDSLIDE: 24,
  VOLCANO: 24,
  CYCLONE: 24,
  HUMANITARIAN_CRISIS: 72,
  INFRASTRUCTURE_DAMAGE: 24,
  RESCUE_OPERATION: 24,
  CIVIL_UNREST: 24,
};

/** Precisión de redondeo de coordenadas por amenaza (grados). */
const COORD_PRECISION: Partial<Record<GlobalThreatType, number>> = {
  WILDFIRE: 0.25,
  FLOOD: 0.5,
  CYCLONE: 1,
  HUMANITARIAN_CRISIS: 1,
  EARTHQUAKE: 0.25,
};

export function dateBucket(occurredAt: string | undefined, threat: GlobalThreatType): string {
  const hours = DATE_BUCKET_HOURS[threat] ?? 24;
  const time = occurredAt ? Date.parse(occurredAt) : Date.now();
  const reference = Number.isFinite(time) ? time : Date.now();
  const bucketMs = hours * 60 * 60 * 1000;
  return new Date(Math.floor(reference / bucketMs) * bucketMs).toISOString().slice(0, 13);
}

export function buildGlobalDedupKey(input: {
  threat: GlobalThreatType;
  country?: string | null;
  region?: string | null;
  latitude?: number;
  longitude?: number;
  occurredAt?: string;
}): string {
  const precision = COORD_PRECISION[input.threat] ?? 0.5;
  return [
    slugPart(input.country, "xx"),
    slugPart(input.region, "any"),
    input.threat.toLowerCase(),
    roundCoordinate(input.latitude, precision),
    roundCoordinate(input.longitude, precision),
    dateBucket(input.occurredAt, input.threat),
  ].join(":");
}

export function dedupKeyForIncident(incident: ArgusIncidentKnowledge, threat: GlobalThreatType): string {
  return buildGlobalDedupKey({
    threat,
    country: incident.country,
    region: incident.region,
    latitude: incident.latitude,
    longitude: incident.longitude,
    occurredAt: incident.occurredAt ?? incident.detectedAt,
  });
}

import type { ArgusIncidentKnowledge, ArgusIncidentSeverity } from "@/types/knowledgeIntake";

/**
 * Copernicus EFFIS (European Forest Fire Information System) adapter.
 * Consulta el WFS público de EFFIS (capa de áreas quemadas de la temporada
 * actual, actualizada ~2 veces al día desde MODIS/VIIRS) y normaliza cada
 * incendio europeo relevante a `ArgusIncidentKnowledge`. Sin API key.
 *
 * El servicio WFS es tolerante a varios nombres de parámetro/capa según la
 * versión desplegada; los nombres de propiedades cambian entre mayúsculas y
 * minúsculas según release, por eso `readProp` prueba ambas.
 */

// SORTBY FIREDATE DESC es imprescindible: la capa contiene todas las
// temporadas desde 2016 y sin orden el WFS devuelve los polígonos más
// antiguos primero (maxfeatures cortaría en incendios de 2016).
const EFFIS_WFS_URL =
  "https://maps.effis.emergency.copernicus.eu/effis?service=WFS&version=2.0.0&request=GetFeature&typename=ms:modis.ba.poly&outputformat=geojson&maxfeatures=300&SORTBY=FIREDATE%20DESC";

// El SORTBY sobre la capa completa (todas las temporadas desde 2016) es
// costoso en el servidor EFFIS: ~20-30s. Timeout holgado a propósito.
const EFFIS_TIMEOUT_MS = 35_000;

type EffisFeature = {
  id?: string | number;
  properties?: Record<string, unknown>;
  geometry?: { type?: string; coordinates?: unknown };
};

type EffisGeoJson = { type?: string; features?: EffisFeature[] };

export type EffisFetchParams = {
  /** Solo incendios cuyo FIREDATE/LASTUPDATE esté dentro de estos días. */
  daysBack?: number;
  /** Área mínima en hectáreas para considerar el incendio relevante. */
  minAreaHa?: number;
  limit?: number;
};

function readProp(properties: Record<string, unknown> | undefined, ...names: string[]): unknown {
  if (!properties) return undefined;
  for (const name of names) {
    if (properties[name] !== undefined && properties[name] !== null) return properties[name];
    const upper = name.toUpperCase();
    if (properties[upper] !== undefined && properties[upper] !== null) return properties[upper];
    const lower = name.toLowerCase();
    if (properties[lower] !== undefined && properties[lower] !== null) return properties[lower];
  }
  return undefined;
}

function parseNumber(value: unknown): number | undefined {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function parseDateValue(value: unknown): Date | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

/** Centroid aproximado (promedio de vértices) para Polygon/MultiPolygon. */
function approximateCentroid(geometry: EffisFeature["geometry"]): [number, number] | null {
  if (!geometry?.coordinates) return null;
  const points: Array<[number, number]> = [];
  const collect = (node: unknown) => {
    if (!Array.isArray(node)) return;
    if (node.length >= 2 && typeof node[0] === "number" && typeof node[1] === "number") {
      points.push([node[0], node[1]]);
      return;
    }
    for (const child of node) collect(child);
  };
  collect(geometry.coordinates);
  if (points.length === 0) return null;
  const sum = points.reduce((acc, [lng, lat]) => [acc[0] + lng, acc[1] + lat], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}

export function severityFromBurnedArea(areaHa: number | undefined): ArgusIncidentSeverity {
  if (typeof areaHa !== "number") return "medium";
  if (areaHa >= 5000) return "critical";
  if (areaHa >= 500) return "high";
  if (areaHa >= 50) return "medium";
  return "low";
}

export function normalizeEffisFeature(feature: EffisFeature): ArgusIncidentKnowledge | null {
  const properties = feature.properties ?? {};
  const centroid = approximateCentroid(feature.geometry);
  if (!centroid) return null;
  const [longitude, latitude] = centroid;

  const areaHa = parseNumber(readProp(properties, "area_ha", "AREA_HA", "area"));
  const country = typeof readProp(properties, "country") === "string" ? String(readProp(properties, "country")) : undefined;
  const province = typeof readProp(properties, "province") === "string" ? String(readProp(properties, "province")) : undefined;
  const commune = typeof readProp(properties, "commune") === "string" ? String(readProp(properties, "commune")) : undefined;
  const fireDate = parseDateValue(readProp(properties, "firedate", "FIREDATE"));
  const lastUpdate = parseDateValue(readProp(properties, "lastupdate", "LASTUPDATE")) ?? fireDate;

  const rawId = readProp(properties, "id", "fid", "objectid") ?? feature.id;
  const externalId = rawId !== undefined && rawId !== null && String(rawId).trim() !== ""
    ? String(rawId)
    : `${latitude.toFixed(3)}:${longitude.toFixed(3)}:${(fireDate ?? new Date()).toISOString().slice(0, 10)}`;
  const id = `effis-${externalId}`;

  const severity = severityFromBurnedArea(areaHa);
  const placeName = [commune, province, country].filter(Boolean).join(", ") || "Europa";
  const occurredAt = fireDate?.toISOString();
  const updatedAt = (lastUpdate ?? new Date()).toISOString();

  return {
    id,
    title: `Incendio forestal en ${placeName}${typeof areaHa === "number" ? ` (~${Math.round(areaHa)} ha)` : ""}`,
    summary: `Copernicus EFFIS reporta un área quemada${typeof areaHa === "number" ? ` de aproximadamente ${Math.round(areaHa)} hectáreas` : ""} en ${placeName}. Detección satelital MODIS/VIIRS de la temporada activa.`,
    domain: "wildfire",
    subtype: "forest_fire",
    severity,
    confidenceScore: 85,
    actionabilityScore: severity === "critical" ? 85 : severity === "high" ? 75 : 55,
    sourceReliabilityScore: 90,
    evidenceCount: 1,
    sourceIds: ["copernicus_effis"],
    sourceNames: ["Copernicus EFFIS"],
    occurredAt,
    detectedAt: updatedAt,
    country,
    region: province,
    locality: commune,
    latitude,
    longitude,
    geometry: feature.geometry as Record<string, unknown> | undefined,
    impact: {
      environmentalImpact: typeof areaHa === "number" ? `Área quemada estimada: ${Math.round(areaHa)} ha.` : "Área quemada en evaluación.",
    },
    technicalFactors: {
      areaHa,
      fireDate: occurredAt,
      lastUpdate: updatedAt,
      country,
      province,
      commune,
    } as unknown as ArgusIncidentKnowledge["technicalFactors"],
    causes: ["Incendio de vegetación detectado por Copernicus EFFIS"],
    contributingFactors: [],
    responseActions: ["Validar con la autoridad nacional de emergencias del país afectado antes de escalar."],
    lessonsLearned: [],
    recommendedActions: [
      {
        id: `rec-${id}`,
        audience: "institutional",
        priority: severity === "critical" ? "critical" : severity === "high" ? "high" : "medium",
        text: "Revisar perímetro EFFIS, viento y proximidad a zonas pobladas; confirmar con autoridad local.",
        rationale: "EFFIS es detección satelital oficial de Copernicus; la respuesta operativa la comanda la autoridad nacional.",
        confidenceScore: 82,
        safetyLimit: "Estimación informativa ARGUS; no reemplaza instrucciones oficiales locales.",
        requiresHumanValidation: severity !== "critical",
      },
    ],
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: ["copernicus-effis", "wildfire", "europe", severity],
    language: "es",
    rawEvidenceRefs: ["https://forest-fire.emergency.copernicus.eu/"],
    createdAt: occurredAt ?? updatedAt,
    updatedAt,
  };
}

export async function fetchEffisWildfires(params: EffisFetchParams = {}) {
  const daysBack = Math.min(Math.max(params.daysBack ?? 7, 1), 60);
  const minAreaHa = params.minAreaHa ?? 30;
  const limit = Math.min(Math.max(params.limit ?? 120, 1), 500);
  const warnings: string[] = [];
  const errors: string[] = [];

  let features: EffisFeature[] = [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EFFIS_TIMEOUT_MS);
  try {
    const response = await fetch(EFFIS_WFS_URL, {
      cache: "no-store",
      headers: { Accept: "application/json, application/geo+json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`EFFIS WFS respondió ${response.status}`);
    const data = (await response.json()) as EffisGeoJson;
    features = data.features ?? [];
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "EFFIS WFS fetch failed");
  } finally {
    clearTimeout(timeout);
  }

  const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  const incidents = features
    .map(normalizeEffisFeature)
    .filter((incident): incident is ArgusIncidentKnowledge => Boolean(incident))
    .filter((incident) => {
      const technical = incident.technicalFactors as unknown as { areaHa?: number };
      if (typeof technical.areaHa === "number" && technical.areaHa < minAreaHa) return false;
      const reference = incident.detectedAt ?? incident.occurredAt;
      if (!reference) return true;
      return Date.parse(reference) >= cutoff;
    })
    .slice(0, limit);

  if (features.length > 0 && incidents.length === 0) {
    warnings.push(`EFFIS devolvió ${features.length} polígonos pero ninguno pasó los filtros (>${minAreaHa} ha, últimos ${daysBack} días).`);
  }

  return {
    adapterId: "effisAdapter",
    sourceId: "copernicus_effis",
    sourceName: "Copernicus EFFIS",
    status: incidents.length > 0 ? ("ready" as const) : errors.length > 0 ? ("error" as const) : ("empty" as const),
    fetchedAt: new Date().toISOString(),
    fetched: features.length,
    count: incidents.length,
    incidents,
    warnings,
    errors,
  };
}

import { getCachedSource, setCachedSource } from "@/lib/ingestion/sourceCache";
import {
  classifyCriticalPoiTags,
  criticalPoiOsmAttribution,
  getCriticalPoiCategory,
} from "@/lib/criticalPoi/criticalPoiCategoryRegistry";
import { upsertCriticalPois } from "@/lib/criticalPoi/criticalPoiPersistenceService";
import type {
  CriticalPoi,
  CriticalPoiBoundingBox,
  CriticalPoiCategory,
} from "@/lib/criticalPoi/criticalPoiTypes";

/**
 * Fuente OSM/Overpass para infraestructura critica (P0-P3). Server-only, al
 * igual que `osmPoiProvider.ts` (POIs urbanos genericos P4): Overpass exige
 * User-Agent identificable y penaliza uso intensivo desde el navegador. Este
 * modulo solo normaliza; la persistencia real vive en
 * `criticalPoiPersistenceService.ts` para mantener "traer de OSM" y "guardar
 * en ARGUS" como pasos separados y testeables por separado.
 *
 * `source` queda fijo en "osm" aca: `CriticalPoi.source` tambien acepta
 * "wikidata" | "official_open_data" | "manual" | "argus" para proveedores
 * futuros (ver `CriticalPoiSource`), pero ese trabajo no esta implementado
 * en esta fase - "base abierta/progresiva" empieza en OSM/Overpass.
 */

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const REQUEST_TIMEOUT_MS = 20_000;
const CACHE_TTL_MS = 15 * 60_000;
const MAX_BBOX_AREA_DEG2 = 0.2;

function bboxKey(bbox: CriticalPoiBoundingBox, categories: CriticalPoiCategory[]) {
  return `critical-pois:osm:${categories.slice().sort().join(",")}:${bbox.south.toFixed(3)},${bbox.west.toFixed(3)},${bbox.north.toFixed(3)},${bbox.east.toFixed(3)}`;
}

function bboxArea(bbox: CriticalPoiBoundingBox) {
  return Math.abs(bbox.north - bbox.south) * Math.abs(bbox.east - bbox.west);
}

function buildOverpassQuery(bbox: CriticalPoiBoundingBox, categories: CriticalPoiCategory[]) {
  const bboxClause = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const clauses = categories
    .flatMap((categoryId) => getCriticalPoiCategory(categoryId)?.tags ?? [])
    .map((matcher) => (matcher.value === "*" ? `["${matcher.key}"]` : `["${matcher.key}"="${matcher.value}"]`))
    .map((filter) => `node${filter}(${bboxClause});\n  way${filter}(${bboxClause});\n  relation${filter}(${bboxClause});`)
    .join("\n  ");

  return `[out:json][timeout:20];
(
  ${clauses}
);
out center tags;`;
}

function buildAddress(tags: Record<string, string>): string | undefined {
  const street = tags["addr:street"];
  const number = tags["addr:housenumber"];
  if (street && number) return `${street} ${number}`;
  return street;
}

function scoreConfidence(tags: Record<string, string>, wellMapped: boolean): number {
  let score = wellMapped ? 74 : 55;
  if (tags.name) score += 8;
  if (tags.operator) score += 4;
  if (tags["addr:street"]) score += 4;
  return Math.min(score, 92);
}

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

/** Normaliza un elemento Overpass a `CriticalPoi` (sin persistir). `null` si no matchea ninguna categoria critica o carece de coordenadas. */
export function normalizeCriticalPoiElement(element: OverpassElement): Omit<CriticalPoi, "id" | "createdAt" | "updatedAt"> | null {
  const tags = element.tags ?? {};
  const categories = classifyCriticalPoiTags(tags);
  if (!categories.length) return null;
  const category = categories[0];
  const categoryDef = getCriticalPoiCategory(category);
  if (!categoryDef) return null;

  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const now = new Date().toISOString();
  return {
    externalId: `${element.type}:${element.id}`,
    source: "osm",
    name: tags.name || tags.operator || categoryDef.label,
    category,
    priority: categoryDef.priority,
    lat: lat as number,
    lng: lng as number,
    countryCode: tags["addr:country"],
    city: tags["addr:city"],
    address: buildAddress(tags),
    status: "active",
    confidence: scoreConfidence(tags, categoryDef.wellMappedInOsm),
    lastSeenAt: now,
    tags,
    sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    isPersistent: true,
    isVisibleByDefault: true,
  };
}

/** Trae infraestructura critica real desde OSM/Overpass en un bbox acotado. No persiste — ver `syncCriticalPoisForBbox`. */
export async function fetchCriticalPoisFromOsm(
  bbox: CriticalPoiBoundingBox,
  categories: CriticalPoiCategory[]
): Promise<Array<Omit<CriticalPoi, "id" | "createdAt" | "updatedAt">>> {
  if (categories.length === 0) return [];
  if (bboxArea(bbox) > MAX_BBOX_AREA_DEG2) {
    throw new Error(`bbox demasiado grande para sync de infraestructura critica (max ~${MAX_BBOX_AREA_DEG2} deg²).`);
  }

  const cacheKey = bboxKey(bbox, categories);
  const cached = getCachedSource<Array<Omit<CriticalPoi, "id" | "createdAt" | "updatedAt">>>(cacheKey);
  if (cached) return cached.data;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      body: `data=${encodeURIComponent(buildOverpassQuery(bbox, categories))}`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "ARGUS-GRID/0.1 critical-poi-sync",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      if (response.status === 429) throw new Error("Overpass bloqueado o límite alcanzado.");
      throw new Error(`Overpass respondió con estado ${response.status}.`);
    }

    const payload = (await response.json()) as { elements?: OverpassElement[] };
    const pois = (payload.elements ?? [])
      .map((element) => normalizeCriticalPoiElement(element))
      .filter((poi): poi is Omit<CriticalPoi, "id" | "createdAt" | "updatedAt"> => poi !== null);

    setCachedSource(cacheKey, pois, CACHE_TTL_MS);
    return pois;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const criticalPoiOsmSourceAttribution = criticalPoiOsmAttribution;

/** Trae de OSM y persiste en un solo paso (usado por el job de sync, no por el layer de lectura del mapa — ese lee `criticalPoiPersistenceService` directo). */
export async function syncCriticalPoisForBbox(bbox: CriticalPoiBoundingBox, categories: CriticalPoiCategory[]) {
  const fetched = await fetchCriticalPoisFromOsm(bbox, categories);
  const result = await upsertCriticalPois(fetched);
  return { fetchedCount: fetched.length, ...result };
}

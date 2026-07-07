import { getCachedSource, setCachedSource } from "@/lib/ingestion/sourceCache";
import type { PoiBoundingBox, PoiCategory, PoiEntity } from "@/lib/pois/poiTypes";

/**
 * Proveedor OSM/Overpass de la capa de POIs urbanos. Server-only: Overpass
 * exige un `User-Agent` identificable y penaliza uso intensivo desde el
 * navegador, asi que el cliente nunca llama a Overpass directamente (ver
 * `/api/pois/urban`, que es el unico caller de este modulo). Reemplaza al
 * scaffold anterior en `src/lib/map/poiLayerService.ts` (nunca conectado a
 * ninguna ruta/UI) con el set completo de categorias de `PoiEntity`.
 *
 * "google"/"mapbox"/"manual"/"argus" quedan como valores validos de
 * `PoiEntity.source` para proveedores futuros (p.ej. Google Places API) sin
 * cambiar el tipo ni los consumidores del mapa.
 */

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const REQUEST_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 10 * 60_000;
const MAX_BBOX_AREA_DEG2 = 0.05;

const OVERPASS_FILTERS: Record<PoiCategory, string[]> = {
  shop: ['["shop"]'],
  restaurant: ['["amenity"~"^(restaurant|cafe|fast_food|bar|pub)$"]'],
  pharmacy: ['["amenity"="pharmacy"]'],
  hospital: ['["amenity"="hospital"]'],
  clinic: ['["amenity"="clinic"]', '["healthcare"~"^(clinic|centre)$"]'],
  school: ['["amenity"~"^(school|college|university)$"]'],
  transport: ['["railway"="station"]["station"!="subway"]', '["public_transport"="platform"]["bus"!="yes"]'],
  metro: ['["railway"="station"]["station"="subway"]', '["railway"="subway_entrance"]'],
  bus_stop: ['["highway"="bus_stop"]'],
  fuel: ['["amenity"="fuel"]'],
  bank: ['["amenity"="bank"]'],
  atm: ['["amenity"="atm"]'],
  police: ['["amenity"="police"]'],
  fire_station: ['["amenity"="fire_station"]'],
  park: ['["leisure"~"^(park|garden)$"]'],
  parking: ['["amenity"="parking"]'],
  service: ['["shop"="car_repair"]', '["craft"]'],
  other: ['["tourism"]'],
};

function bboxKey(bbox: PoiBoundingBox, categories: PoiCategory[]) {
  return `pois:osm:${categories.slice().sort().join(",")}:${bbox.south.toFixed(3)},${bbox.west.toFixed(3)},${bbox.north.toFixed(3)},${bbox.east.toFixed(3)}`;
}

function bboxArea(bbox: PoiBoundingBox) {
  return Math.abs(bbox.north - bbox.south) * Math.abs(bbox.east - bbox.west);
}

function buildOverpassQuery(bbox: PoiBoundingBox, categories: PoiCategory[]) {
  const bboxClause = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const clauses = categories
    .flatMap((category) => OVERPASS_FILTERS[category] ?? [])
    .map((filter) => `node${filter}(${bboxClause});\n  way${filter}(${bboxClause});`)
    .join("\n  ");

  return `[out:json][timeout:12];
(
  ${clauses}
);
out center body;`;
}

/** Resuelve la categoria ARGUS de un elemento OSM a partir de sus tags. Primer match gana (ver orden en OVERPASS_FILTERS). */
export function categoryFromOsmTags(tags: Record<string, string>): PoiCategory | null {
  if (tags.amenity === "hospital") return "hospital";
  if (tags.amenity === "clinic" || (tags.healthcare === "clinic" || tags.healthcare === "centre")) return "clinic";
  if (tags.amenity === "pharmacy") return "pharmacy";
  if (tags.amenity === "police") return "police";
  if (tags.amenity === "fire_station") return "fire_station";
  if (tags.amenity === "fuel") return "fuel";
  if (tags.amenity === "bank") return "bank";
  if (tags.amenity === "atm") return "atm";
  if (tags.amenity === "parking") return "parking";
  if (tags.amenity === "school" || tags.amenity === "college" || tags.amenity === "university") return "school";
  if (["restaurant", "cafe", "fast_food", "bar", "pub"].includes(tags.amenity ?? "")) return "restaurant";
  if (tags.railway === "station" && tags.station === "subway") return "metro";
  if (tags.railway === "subway_entrance") return "metro";
  if (tags.railway === "station") return "transport";
  if (tags.public_transport === "platform" && tags.bus !== "yes") return "transport";
  if (tags.highway === "bus_stop") return "bus_stop";
  if (tags.leisure === "park" || tags.leisure === "garden") return "park";
  if (tags.shop === "car_repair" || tags.craft) return "service";
  if (tags.shop) return "shop";
  if (tags.tourism) return "other";
  return null;
}

function buildAddress(tags: Record<string, string>): string | undefined {
  const street = tags["addr:street"];
  const number = tags["addr:housenumber"];
  if (street && number) return `${street} ${number}`;
  if (street) return street;
  return undefined;
}

/**
 * Trae POIs urbanos reales desde OSM/Overpass dentro de un bbox acotado.
 * Lanza si el bbox es demasiado grande (protege a Overpass de scans masivos)
 * o si Overpass responde con error/rate-limit. Cachea por bbox+categorias.
 */
export async function fetchOsmPois(
  bbox: PoiBoundingBox,
  categories: PoiCategory[]
): Promise<PoiEntity[]> {
  if (categories.length === 0) return [];

  if (bboxArea(bbox) > MAX_BBOX_AREA_DEG2) {
    throw new Error("bbox demasiado grande para consulta de POIs urbanos (max ~0.05 deg², usar zoom urbano).");
  }

  const cacheKey = bboxKey(bbox, categories);
  const cached = getCachedSource<PoiEntity[]>(cacheKey);
  if (cached) return cached.data;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      body: `data=${encodeURIComponent(buildOverpassQuery(bbox, categories))}`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "ARGUS-GRID/0.1 urban-poi-layer",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      if (response.status === 429) throw new Error("Overpass bloqueado o límite alcanzado.");
      throw new Error(`Overpass respondió con estado ${response.status}.`);
    }

    const payload = (await response.json()) as {
      elements?: Array<{
        id: number;
        type: string;
        lat?: number;
        lon?: number;
        center?: { lat: number; lon: number };
        tags?: Record<string, string>;
      }>;
    };

    const pois = (payload.elements ?? [])
      .map((element): PoiEntity | null => {
        const tags = element.tags ?? {};
        const category = categoryFromOsmTags(tags);
        const lat = element.lat ?? element.center?.lat;
        const lng = element.lon ?? element.center?.lon;
        if (!category || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        return {
          id: `osm-${element.type}-${element.id}`,
          name: tags.name || tags.brand || tags.operator || "",
          category,
          lat: lat as number,
          lng: lng as number,
          address: buildAddress(tags),
          description: tags.cuisine || tags.operator || undefined,
          source: "osm",
          tags,
        };
      })
      .filter((poi): poi is PoiEntity => poi !== null);

    setCachedSource(cacheKey, pois, CACHE_TTL_MS);
    return pois;
  } finally {
    clearTimeout(timeoutId);
  }
}

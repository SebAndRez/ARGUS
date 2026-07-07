import { getCachedSource, setCachedSource } from "@/lib/ingestion/sourceCache";

/**
 * Capa de POIs urbanos en vivo (tiendas, restaurantes, colegios, hospitales,
 * servicentros, paraderos, estaciones de metro, plazas) via OSM/Overpass.
 *
 * Este servicio es un complemento a los tiles del basemap (baseMapStyles.ts),
 * que ya "hornean" iconos de POI en la imagen del tile para los modos
 * streets/tactical/light. Existe para el caso en que ARGUS necesite POIs
 * como datos clickeables propios (ficha simple al tocar un POI, búsqueda,
 * filtrado por categoria) en vez de solo pixeles de un tile raster.
 *
 * Diseñado para ejecutarse en el servidor (una futura ruta interna, p.ej.
 * `/api/pois/urban`), igual que NASA FIRMS: el navegador nunca deberia
 * llamar a Overpass directamente para no exponer el patron de trafico de
 * ARGUS ni pegarle a la politica de uso publico de Overpass sin control de
 * cache. `getNearbyPois` (src/lib/pois/poiService.ts) sigue siendo la fuente
 * de hospitales/refugios curados de AURA/ARCA; esto es urbano generico.
 */

export type UrbanPoiCategory =
  | "shop"
  | "restaurant"
  | "school"
  | "hospital"
  | "fuel"
  | "bus_stop"
  | "subway_station"
  | "plaza";

export interface UrbanPoi {
  id: string;
  name: string;
  category: UrbanPoiCategory;
  lat: number;
  lng: number;
  tags: Record<string, string>;
}

export interface UrbanPoiBoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const REQUEST_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 10 * 60_000;
const MAX_BBOX_AREA_DEG2 = 0.05;

const OVERPASS_FILTERS: Record<UrbanPoiCategory, string> = {
  shop: '["shop"]',
  restaurant: '["amenity"~"restaurant|cafe|fast_food|bar"]',
  school: '["amenity"~"school|college|university"]',
  hospital: '["amenity"~"hospital|clinic"]["amenity"!="pharmacy"]',
  fuel: '["amenity"="fuel"]',
  bus_stop: '["highway"="bus_stop"]',
  subway_station: '["railway"="station"]["station"="subway"]',
  plaza: '["leisure"~"park|plaza"]["leisure"!=""]',
};

function bboxKey(bbox: UrbanPoiBoundingBox, categories: UrbanPoiCategory[]) {
  return `pois:urban:${categories.slice().sort().join(",")}:${bbox.south.toFixed(3)},${bbox.west.toFixed(3)},${bbox.north.toFixed(3)},${bbox.east.toFixed(3)}`;
}

function bboxArea(bbox: UrbanPoiBoundingBox) {
  return Math.abs(bbox.north - bbox.south) * Math.abs(bbox.east - bbox.west);
}

function buildOverpassQuery(bbox: UrbanPoiBoundingBox, categories: UrbanPoiCategory[]) {
  const bboxClause = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const clauses = categories
    .map((category) => OVERPASS_FILTERS[category])
    .filter((filter): filter is string => Boolean(filter))
    .map((filter) => `node${filter}(${bboxClause});`)
    .join("\n  ");

  return `[out:json][timeout:12];
(
  ${clauses}
);
out body;`;
}

function categoryFromTags(tags: Record<string, string>): UrbanPoiCategory | null {
  if (tags.shop) return "shop";
  if (tags.amenity === "restaurant" || tags.amenity === "cafe" || tags.amenity === "fast_food" || tags.amenity === "bar") return "restaurant";
  if (tags.amenity === "school" || tags.amenity === "college" || tags.amenity === "university") return "school";
  if (tags.amenity === "hospital" || tags.amenity === "clinic") return "hospital";
  if (tags.amenity === "fuel") return "fuel";
  if (tags.highway === "bus_stop") return "bus_stop";
  if (tags.railway === "station" && tags.station === "subway") return "subway_station";
  if (tags.leisure === "park" || tags.leisure === "plaza") return "plaza";
  return null;
}

/**
 * Trae POIs urbanos reales desde OSM/Overpass dentro de un bbox acotado.
 * Lanza si el bbox es demasiado grande (protege a Overpass de scans masivos)
 * o si Overpass responde con error/rate-limit. Cachea por bbox+categorias.
 */
export async function fetchUrbanPois(
  bbox: UrbanPoiBoundingBox,
  categories: UrbanPoiCategory[] = ["shop", "restaurant", "school", "hospital", "fuel", "bus_stop", "subway_station", "plaza"]
): Promise<UrbanPoi[]> {
  if (bboxArea(bbox) > MAX_BBOX_AREA_DEG2) {
    throw new Error("bbox demasiado grande para consulta de POIs urbanos (max ~0.05 deg², usar zoom urbano).");
  }

  const cacheKey = bboxKey(bbox, categories);
  const cached = getCachedSource<UrbanPoi[]>(cacheKey);
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
      elements?: Array<{ id: number; lat: number; lon: number; tags?: Record<string, string> }>;
    };

    const pois = (payload.elements ?? [])
      .map((element): UrbanPoi | null => {
        const tags = element.tags ?? {};
        const category = categoryFromTags(tags);
        if (!category || !Number.isFinite(element.lat) || !Number.isFinite(element.lon)) return null;
        return {
          id: `osm-node-${element.id}`,
          name: tags.name || tags.brand || categoryLabel(category),
          category,
          lat: element.lat,
          lng: element.lon,
          tags,
        };
      })
      .filter((poi): poi is UrbanPoi => poi !== null);

    setCachedSource(cacheKey, pois, CACHE_TTL_MS);
    return pois;
  } finally {
    clearTimeout(timeoutId);
  }
}

function categoryLabel(category: UrbanPoiCategory): string {
  const labels: Record<UrbanPoiCategory, string> = {
    shop: "Tienda",
    restaurant: "Restaurante",
    school: "Colegio",
    hospital: "Centro de salud",
    fuel: "Servicentro",
    bus_stop: "Paradero",
    subway_station: "Estación de metro",
    plaza: "Plaza",
  };
  return labels[category];
}

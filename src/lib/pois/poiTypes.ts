/**
 * Capa de POIs urbanos (tiendas, restaurantes, farmacias, colegios,
 * paraderos, metro, servicentros, etc), independiente del basemap y de la
 * capa de `MapEntity` (hospitales/refugios curados de AURA/ARCA, ver
 * `src/lib/pois/poiService.ts`). El basemap sigue siendo la estetica ARGUS;
 * esto es una capa de puntos clickeables encima, al estilo Google Maps.
 */

export type PoiCategory =
  | "shop"
  | "restaurant"
  | "pharmacy"
  | "hospital"
  | "clinic"
  | "school"
  | "transport"
  | "metro"
  | "bus_stop"
  | "fuel"
  | "bank"
  | "atm"
  | "police"
  | "fire_station"
  | "park"
  | "parking"
  | "service"
  | "other";

export interface PoiEntity {
  id: string;
  name: string;
  category: PoiCategory;
  lat: number;
  lng: number;
  address?: string;
  description?: string;
  source: "osm" | "google" | "mapbox" | "manual" | "argus";
  tags?: Record<string, string>;
}

export interface PoiBoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export const poiCategoryLabels: Record<PoiCategory, string> = {
  shop: "Tienda",
  restaurant: "Restaurante / Café",
  pharmacy: "Farmacia",
  hospital: "Hospital",
  clinic: "Clínica / SAPU",
  school: "Colegio / Universidad",
  transport: "Transporte",
  metro: "Estación de metro",
  bus_stop: "Paradero",
  fuel: "Servicentro",
  bank: "Banco",
  atm: "Cajero automático",
  police: "Comisaría",
  fire_station: "Bomberos",
  park: "Plaza / Parque",
  parking: "Estacionamiento",
  service: "Servicio / Taller",
  other: "Lugar de interés",
};

/**
 * Umbrales de zoom (Leaflet, mismo z que `map.getZoom()`): por debajo de
 * `medium` no se cargan POIs (evita saturar zoom de ciudad/región); entre
 * `medium` y `urban` solo puntos criticos (salud, transporte, seguridad);
 * desde `urban` se suma comercio/servicios cotidianos.
 */
export const POI_ZOOM_TIERS = {
  medium: 13,
  urban: 15,
} as const;

/** Hospitales, clinicas, transporte, servicentros, seguridad: visibles ya en zoom medio (ciudad/barrio). */
export const POI_MEDIUM_ZOOM_CATEGORIES: PoiCategory[] = [
  "hospital",
  "clinic",
  "transport",
  "metro",
  "fuel",
  "police",
  "fire_station",
  "park",
];

/** Comercio y servicios cotidianos: solo desde zoom urbano alto para no saturar. */
export const POI_URBAN_ZOOM_CATEGORIES: PoiCategory[] = [
  "shop",
  "restaurant",
  "pharmacy",
  "school",
  "bus_stop",
  "bank",
  "atm",
  "parking",
  "service",
];

/** Categorias que corresponde cargar para un zoom dado (vacio si el zoom es demasiado bajo). */
export function categoriesForZoom(zoom: number): PoiCategory[] {
  if (zoom >= POI_ZOOM_TIERS.urban) {
    return [...POI_MEDIUM_ZOOM_CATEGORIES, ...POI_URBAN_ZOOM_CATEGORIES];
  }
  if (zoom >= POI_ZOOM_TIERS.medium) {
    return [...POI_MEDIUM_ZOOM_CATEGORIES];
  }
  return [];
}

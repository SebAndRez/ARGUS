/**
 * ARGUS Map Provider Strategy: punto unico de decision de que motor de mapa
 * base esta activo. Hoy el unico proveedor implementado es `osm` (tiles
 * raster OSM/CARTO/Esri via Leaflet, sin API key). El resto de los ids existe
 * para que activar Google Maps/Mapbox/MapTiler/Esri mas adelante sea cambiar
 * una variable de entorno + agregar el modulo del proveedor, no reescribir
 * OperationalMap ni los overlays de AURA/FENIX/ATLAS/VIGIA/HERMES/NEXUS.
 *
 * Nota sobre Google Maps: su Maps JavaScript API no puede usarse como fuente
 * de tiles dentro de Leaflet (viola los terminos de Google y no expone tiles
 * crudos). Activar "google_maps" de forma oficial implica renderizar el mapa
 * con el SDK de Google en vez de Leaflet, lo que es un cambio de motor, no
 * solo de tiles. Ese trabajo queda fuera de este scaffold hasta contar con
 * GOOGLE_MAPS_API_KEY y decision explicita de costo/arquitectura.
 */

export type ArgusMapProviderId =
  | "osm"
  | "google_maps"
  | "mapbox"
  | "maptiler"
  | "esri"
  | "custom";

export interface ArgusMapProviderStatus {
  id: ArgusMapProviderId;
  implemented: boolean;
  requiresApiKey: boolean;
  requiredEnv?: string;
  configured: boolean;
  engine: "leaflet_raster_tiles" | "google_maps_js_sdk" | "vector_tiles";
  notes: string;
}

const PROVIDER_ENV = "NEXT_PUBLIC_ARGUS_MAP_PROVIDER";
const DEFAULT_PROVIDER: ArgusMapProviderId = "osm";

const KNOWN_PROVIDERS: ArgusMapProviderId[] = [
  "osm",
  "google_maps",
  "mapbox",
  "maptiler",
  "esri",
  "custom",
];

function isKnownProvider(value: string): value is ArgusMapProviderId {
  return (KNOWN_PROVIDERS as string[]).includes(value);
}

/** Proveedor de mapa base activo, leido de NEXT_PUBLIC_ARGUS_MAP_PROVIDER. Cae a "osm" si falta o es invalido. */
export function getActiveMapProvider(): ArgusMapProviderId {
  const raw = process.env[PROVIDER_ENV]?.trim().toLowerCase();
  if (raw && isKnownProvider(raw)) return raw;
  return DEFAULT_PROVIDER;
}

export function getMapProviderStatus(provider: ArgusMapProviderId = getActiveMapProvider()): ArgusMapProviderStatus {
  switch (provider) {
    case "osm":
      return {
        id: "osm",
        implemented: true,
        requiresApiKey: false,
        configured: true,
        engine: "leaflet_raster_tiles",
        notes:
          "Activo por defecto. Tiles OSM/CARTO/Esri sin API key, vía src/lib/map/baseMapStyles.ts.",
      };
    case "mapbox":
      return {
        id: "mapbox",
        implemented: false,
        requiresApiKey: true,
        requiredEnv: "NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN",
        configured: Boolean(process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN),
        engine: "vector_tiles",
        notes: "Ya existe NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN para routing; falta el modulo de tiles/estilo para el mapa base.",
      };
    case "maptiler":
      return {
        id: "maptiler",
        implemented: false,
        requiresApiKey: true,
        requiredEnv: "NEXT_PUBLIC_MAPTILER_API_KEY",
        configured: Boolean(process.env.NEXT_PUBLIC_MAPTILER_API_KEY),
        engine: "vector_tiles",
        notes: "Sin implementar. MapTiler ofrece estilos tipo Google Maps con POIs vía tiles vectoriales/raster.",
      };
    case "esri":
      return {
        id: "esri",
        implemented: true,
        requiresApiKey: false,
        configured: true,
        engine: "leaflet_raster_tiles",
        notes: "Usado hoy solo para el modo satelite hibrido (World Imagery + labels), no como basemap de calles.",
      };
    case "google_maps":
      return {
        id: "google_maps",
        implemented: false,
        requiresApiKey: true,
        requiredEnv: "GOOGLE_MAPS_API_KEY",
        configured: Boolean(process.env.GOOGLE_MAPS_API_KEY),
        engine: "google_maps_js_sdk",
        notes:
          "Requiere migrar el motor de mapa (Leaflet -> Google Maps JavaScript API) y facturacion en Google Cloud. No se puede usar como capa de tiles dentro de Leaflet.",
      };
    case "custom":
    default:
      return {
        id: "custom",
        implemented: false,
        requiresApiKey: false,
        configured: false,
        engine: "leaflet_raster_tiles",
        notes: "Reservado para un proveedor de tiles propio/interno de ARGUS.",
      };
  }
}

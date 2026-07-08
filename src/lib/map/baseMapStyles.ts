import type { BaseMapType } from "@/types/map";

/**
 * Definicion de tiles del mapa base ARGUS (proveedor "osm", ver
 * mapProvider.ts). Reemplaza al objeto `baseMapSources` que vivia inline en
 * OperationalMap.tsx. El objetivo es que, al hacer zoom urbano, el mapa
 * muestre calles, tiendas, paraderos, colegios y demas POIs reales -tal como
 * pide el modo "streets"-, y que el modo satelite sea imagen real + etiquetas
 * (hibrido), no el mismo tile que "claro" con otro nombre (bug anterior:
 * "satellite" apuntaba a CARTO Voyager, no a una imagen satelital).
 *
 * "tactical" es un basemap oscuro real (CARTO Dark Matter), no un tinte CSS
 * sobre un basemap claro: el objetivo es un mapa negro operacional, no un
 * filtro cosmetico.
 */

export interface BaseMapTileSource {
  url: string;
  attribution: string;
  maxZoom?: number;
}

export interface BaseMapStyleDefinition {
  id: BaseMapType;
  label: string;
  description: string;
  /** Capa de tiles principal (calles/relieve o imagen satelital). */
  base: BaseMapTileSource;
  /** Capa opcional de etiquetas encima de `base` (modo satelite hibrido). */
  labelsOverlay?: BaseMapTileSource;
  /** Filtro CSS aplicado sobre el tile-pane; debe ser sutil, nunca ocultar POIs/labels. */
  cssFilter?: string;
}

const OSM_ATTRIBUTION = "© OpenStreetMap contributors";
const CARTO_ATTRIBUTION = "© OpenStreetMap © CARTO";
const ESRI_ATTRIBUTION = "© Esri, Maxar, Earthstar Geographics";
const OPENTOPOMAP_ATTRIBUTION =
  "© OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)";

export const baseMapStyles: Record<BaseMapType, BaseMapStyleDefinition> = {
  streets: {
    id: "streets",
    label: "Calles",
    description:
      "Mapa de calles OSM estandar: la referencia mas cercana a Google Maps disponible sin API key. Muestra tiendas, restaurantes, paraderos, colegios y demas POIs urbanos ya renderizados en el tile al acercar el zoom.",
    base: {
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19,
    },
  },
  tactical: {
    id: "tactical",
    label: "Táctico",
    description:
      "Mapa operacional negro real (CARTO Dark Matter) para uso nocturno/HUD: no es un filtro sobre un basemap claro, es un basemap oscuro con calles y POIs renderizados en tonos oscuros.",
    base: {
      url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      attribution: CARTO_ATTRIBUTION,
      maxZoom: 20,
    },
  },
  satellite: {
    id: "satellite",
    label: "Satélite híbrido",
    description:
      "Imagen satelital real (Esri World Imagery) con nombres de calles y ciudades superpuestos (CARTO labels-only), equivalente al modo hibrido de Google Maps.",
    base: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: ESRI_ATTRIBUTION,
      maxZoom: 19,
    },
    labelsOverlay: {
      url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png",
      attribution: CARTO_ATTRIBUTION,
      maxZoom: 20,
    },
  },
  terrain: {
    id: "terrain",
    label: "Terreno",
    description:
      "Relieve y geografia fisica (OpenTopoMap) con curvas de nivel, caminos y contexto territorial. Util para evacuaciones, rutas rurales/montaña e incidentes de incendio o inundacion.",
    base: {
      url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      attribution: OPENTOPOMAP_ATTRIBUTION,
      maxZoom: 17,
    },
  },
};

export function getBaseMapStyle(type: BaseMapType): BaseMapStyleDefinition {
  return baseMapStyles[type];
}

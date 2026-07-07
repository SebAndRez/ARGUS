import type { BaseMapType } from "@/types/map";

/**
 * Definicion de tiles del mapa base ARGUS (proveedor "osm", ver
 * mapProvider.ts). Reemplaza al objeto `baseMapSources` que vivia inline en
 * OperationalMap.tsx. El objetivo es que, al hacer zoom urbano, el mapa
 * muestre calles, tiendas, paraderos, colegios y demas POIs reales -tal como
 * pide el modo "streets"/"tactical"-, y que el modo satelite sea imagen real
 * + etiquetas (hibrido), no el mismo tile que "claro" con otro nombre (bug
 * anterior: "satellite" apuntaba a CARTO Voyager, no a una imagen satelital).
 *
 * El tema oscuro ("tactical") es un tinte CSS aplicado sobre un basemap con
 * POIs (Voyager), no un basemap oscuro que borre la informacion urbana.
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
      "Vista operacional ARGUS: mismo basemap rico en POIs (CARTO Voyager) que 'Calles', con un tinte oscuro sutil para uso nocturno/HUD. El tinte no reemplaza el basemap ni oculta calles, comercios o etiquetas.",
    base: {
      url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      attribution: CARTO_ATTRIBUTION,
      maxZoom: 20,
    },
    cssFilter: "brightness(0.94) contrast(1.05) saturate(0.92)",
  },
  light: {
    id: "light",
    label: "Claro",
    description:
      "Fondo claro minimalista (CARTO Positron) para priorizar overlays de datos ARGUS por sobre el detalle urbano.",
    base: {
      url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
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
};

export function getBaseMapStyle(type: BaseMapType): BaseMapStyleDefinition {
  return baseMapStyles[type];
}

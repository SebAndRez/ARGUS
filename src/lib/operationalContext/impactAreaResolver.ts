import chileRegions from "@/data/geometries/chileRegions.json";
import chileProvincias from "@/data/geometries/chileProvincias.json";
import chileComunas from "@/data/geometries/chileComunas.json";
import { bboxOverlaps, geometryBoundingBox, pointInGeometry, type BoundingBox, type LatLng, type RawGeometry } from "@/lib/geometry/wildfireGeometry";
import type { ImpactArea, ImpactAreaBoundingBox } from "@/types/operationalContext";

/**
 * ARGUS Operational Context Engine — Fase 2 (Impact Area Resolver).
 *
 * Reutiliza las primitivas geométricas ya existentes de
 * `src/lib/geometry/wildfireGeometry.ts` (`pointInGeometry`,
 * `geometryBoundingBox`, `bboxOverlaps`) en vez de reimplementarlas. Los
 * datasets de comuna/provincia/región (`src/data/geometries/*.json`) son
 * "grow-as-needed" (ver `argusGeometryResolver.ts`), no cobertura nacional
 * completa — cuando el punto no cae dentro de ninguna comuna conocida,
 * `hasRealGeometry` es `false` y solo se devuelve el buffer circular, nunca
 * un polígono inventado. Nadie en el repo hacía lat/lng → comuna antes de
 * este archivo (`argusGeometryResolver.ts` solo resuelve nombre → polígono).
 */

type NamedFeature = { properties: { nombre: string }; geometry: RawGeometry };
type NamedFeatureCollection = { features: NamedFeature[] };

const CHILE_COMUNAS = chileComunas as unknown as NamedFeatureCollection;
const CHILE_PROVINCIAS = chileProvincias as unknown as NamedFeatureCollection;
const CHILE_REGIONS = chileRegions as unknown as NamedFeatureCollection;

function findContainingFeature(point: LatLng, collection: NamedFeatureCollection): NamedFeature | null {
  for (const feature of collection.features) {
    if (pointInGeometry(point, feature.geometry)) return feature;
  }
  return null;
}

/** Bbox desde punto+radio — mismo cálculo que `criticalPoiPersistenceService.ts`/`usgsWaterAdapter.ts`, aislado aquí para no tocar esos archivos existentes. */
function boundingBoxFromPointRadius(point: LatLng, radiusKm: number): ImpactAreaBoundingBox {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.max(Math.cos((point.lat * Math.PI) / 180), 0.2));
  return {
    south: point.lat - latDelta,
    north: point.lat + latDelta,
    west: point.lng - lngDelta,
    east: point.lng + lngDelta,
  };
}

function toBoundingBox(box: ImpactAreaBoundingBox): BoundingBox {
  return { minLat: box.south, minLng: box.west, maxLat: box.north, maxLng: box.east };
}

function resolveNeighborCommunes(anchor: LatLng, communeName: string, bufferBbox: BoundingBox): string[] {
  return CHILE_COMUNAS.features
    .filter((feature) => feature.properties.nombre !== communeName)
    .filter((feature) => {
      const featureBbox = geometryBoundingBox(feature.geometry);
      return featureBbox ? bboxOverlaps(featureBbox, bufferBbox) : false;
    })
    .map((feature) => feature.properties.nombre);
}

export interface ResolveImpactAreaInput {
  lat: number;
  lng: number;
  countryCode: string | null;
  regionCode?: string | null;
  radiusKm: number;
}

export function resolveImpactArea(input: ResolveImpactAreaInput): ImpactArea {
  const anchor: LatLng = { lat: input.lat, lng: input.lng };
  const bufferBbox = boundingBoxFromPointRadius(anchor, input.radiusKm);

  const base: Omit<ImpactArea, "region" | "province" | "commune" | "neighborCommunes" | "polygon" | "hasRealGeometry"> = {
    anchor,
    radiusKm: input.radiusKm,
    bufferBbox,
    countryCode: input.countryCode,
    corridors: [],
    corridorsImplemented: false,
  };

  if (input.countryCode?.toUpperCase() !== "CL") {
    return {
      ...base,
      region: input.regionCode ?? null,
      province: null,
      commune: null,
      neighborCommunes: [],
      polygon: null,
      hasRealGeometry: false,
    };
  }

  const communeFeature = findContainingFeature(anchor, CHILE_COMUNAS);
  const provinceFeature = findContainingFeature(anchor, CHILE_PROVINCIAS);
  const regionFeature = findContainingFeature(anchor, CHILE_REGIONS);

  const neighborCommunes = communeFeature
    ? resolveNeighborCommunes(anchor, communeFeature.properties.nombre, toBoundingBox(bufferBbox))
    : [];

  return {
    ...base,
    region: regionFeature?.properties.nombre ?? input.regionCode ?? null,
    province: provinceFeature?.properties.nombre ?? null,
    commune: communeFeature?.properties.nombre ?? null,
    neighborCommunes,
    polygon: communeFeature?.geometry ?? null,
    hasRealGeometry: Boolean(communeFeature),
  };
}

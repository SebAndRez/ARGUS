import chileRegions from "@/data/geometries/chileRegions.json";
import type { ArgusGeoJsonPolygon } from "@/types/argusEvent";

/**
 * Resolves real administrative boundary geometry for ARGUS alerts, so no
 * caller ever has to hand-draw a polygon or fall back to a bbox/rectangle as
 * the visible alert shape. Country-agnostic by design: adding a new country
 * is "add one GeoJSON file + one entry below", never a parallel per-country
 * rendering path (mirrors `src/lib/i18n/dictionaries.ts`'s static-import
 * lookup pattern, which works in both server and client bundles).
 */

type RegionFeature = {
  type: "Feature";
  properties: { nombre: string; codigo: string | null; source: string };
  geometry: ArgusGeoJsonPolygon;
};

type RegionFeatureCollection = { type: "FeatureCollection"; features: RegionFeature[] };

const COUNTRY_REGION_COLLECTIONS: Record<string, RegionFeatureCollection> = {
  CL: chileRegions as unknown as RegionFeatureCollection,
};

export type ResolvedAdministrativeGeometry = {
  geojson: ArgusGeoJsonPolygon;
  regionNames: string[];
  anchor: [latitude: number, longitude: number];
};

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function findMatchingFeatures(collection: RegionFeatureCollection, regionNames: string[]): RegionFeature[] {
  const targets = regionNames.map(normalizeName);
  return collection.features.filter((feature) => {
    const featureName = normalizeName(feature.properties.nombre);
    return targets.some((target) => featureName.includes(target) || target.includes(featureName));
  });
}

/** Flattens a Polygon or MultiPolygon into a list of MultiPolygon-shaped polygon rings. */
function toMultiPolygonParts(geometry: ArgusGeoJsonPolygon): number[][][][] {
  return geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
}

/** Bounding-box centroid of the resolved shape — a camera-centering aid only, never the render shape itself. */
function computeBboxCentroid(polygons: number[][][][]): [number, number] {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [lon, lat] of ring) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  return [(minLat + maxLat) / 2, (minLon + maxLon) / 2];
}

/**
 * Resolves one or more named administrative regions (or provinces/communes,
 * once those datasets are registered) into a single real `MultiPolygon`,
 * merged from the matched features — never a hand-estimated or bbox shape.
 * Returns `null` (never a fabricated shape) if the country isn't registered
 * or no region names match; callers must fall back to a plain marker.
 */
export function resolveAdministrativeRegionGeometry(
  country: string,
  regionNames: string[],
  options?: { anchorOverride?: [latitude: number, longitude: number] }
): ResolvedAdministrativeGeometry | null {
  const collection = COUNTRY_REGION_COLLECTIONS[country.toUpperCase()];
  if (!collection) return null;

  const matched = findMatchingFeatures(collection, regionNames);
  if (matched.length === 0) return null;

  const mergedParts = matched.flatMap((feature) => toMultiPolygonParts(feature.geometry));
  const geojson: ArgusGeoJsonPolygon = { type: "MultiPolygon", coordinates: mergedParts };

  return {
    geojson,
    regionNames: matched.map((feature) => feature.properties.nombre),
    anchor: options?.anchorOverride ?? computeBboxCentroid(mergedParts),
  };
}

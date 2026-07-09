import chileRegions from "@/data/geometries/chileRegions.json";
import chileProvincias from "@/data/geometries/chileProvincias.json";
import chileComunas from "@/data/geometries/chileComunas.json";
import type { ArgusGeoJsonPolygon } from "@/types/argusEvent";

/**
 * Resolves real administrative boundary geometry for ARGUS alerts, so no
 * caller ever has to hand-draw a polygon or fall back to a bbox/rectangle as
 * the visible alert shape. Country-agnostic by design: adding a new country
 * is "add one GeoJSON file + one entry below", never a parallel per-country
 * rendering path (mirrors `src/lib/i18n/dictionaries.ts`'s static-import
 * lookup pattern, which works in both server and client bundles).
 *
 * Three admin levels are supported (region/province/commune), each backed by
 * its own small GeoJSON file — communes/provinces are only added for the
 * specific places ARGUS actually needs (grow-as-needed, same principle as
 * the regions file), never the full national dataset.
 */

export type ArgusAdminLevel = "region" | "province" | "commune";

type RegionFeature = {
  type: "Feature";
  properties: { nombre: string; codigo: string | null; source: string };
  geometry: ArgusGeoJsonPolygon;
};

type RegionFeatureCollection = { type: "FeatureCollection"; features: RegionFeature[] };

const COUNTRY_LEVEL_COLLECTIONS: Record<string, Record<ArgusAdminLevel, RegionFeatureCollection | undefined>> = {
  CL: {
    region: chileRegions as unknown as RegionFeatureCollection,
    province: chileProvincias as unknown as RegionFeatureCollection,
    commune: chileComunas as unknown as RegionFeatureCollection,
  },
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
 * Resolves one or more named administrative areas at a given level (region,
 * province, or commune) into a single real `MultiPolygon`, merged from the
 * matched features — never a hand-estimated or bbox shape. Returns `null`
 * (never a fabricated shape) if the country/level isn't registered or no
 * names match; callers must fall back to a broader level or a plain marker.
 */
export function resolveAdministrativeAreaGeometry(
  country: string,
  names: string[],
  level: ArgusAdminLevel = "region",
  options?: { anchorOverride?: [latitude: number, longitude: number] }
): ResolvedAdministrativeGeometry | null {
  const collection = COUNTRY_LEVEL_COLLECTIONS[country.toUpperCase()]?.[level];
  if (!collection) return null;

  const matched = findMatchingFeatures(collection, names);
  if (matched.length === 0) return null;

  const mergedParts = matched.flatMap((feature) => toMultiPolygonParts(feature.geometry));
  const geojson: ArgusGeoJsonPolygon = { type: "MultiPolygon", coordinates: mergedParts };

  return {
    geojson,
    regionNames: matched.map((feature) => feature.properties.nombre),
    anchor: options?.anchorOverride ?? computeBboxCentroid(mergedParts),
  };
}

/**
 * Tries the most specific admin level first (commune → province → region),
 * using whichever names the caller actually has — never fabricates a shape
 * at a level nothing was resolved for, it just tries the next broader one.
 */
export function resolveAdministrativeAreaWithFallback(
  country: string,
  names: { commune?: string; province?: string; region?: string }
): (ResolvedAdministrativeGeometry & { resolvedLevel: ArgusAdminLevel }) | null {
  const attempts: Array<{ level: ArgusAdminLevel; name?: string }> = [
    { level: "commune", name: names.commune },
    { level: "province", name: names.province },
    { level: "region", name: names.region },
  ];
  for (const attempt of attempts) {
    if (!attempt.name) continue;
    const resolved = resolveAdministrativeAreaGeometry(country, [attempt.name], attempt.level);
    if (resolved) return { ...resolved, resolvedLevel: attempt.level };
  }
  return null;
}

/** @deprecated Use `resolveAdministrativeAreaGeometry(country, regionNames, "region")` instead. Kept for existing call sites. */
export function resolveAdministrativeRegionGeometry(
  country: string,
  regionNames: string[],
  options?: { anchorOverride?: [latitude: number, longitude: number] }
): ResolvedAdministrativeGeometry | null {
  return resolveAdministrativeAreaGeometry(country, regionNames, "region", options);
}

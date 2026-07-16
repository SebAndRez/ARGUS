/**
 * Geospatial primitives for wildfire correlation (Prompt 15). Deliberately
 * self-contained — no new dependency (`leaflet` is the only geo package in
 * this repo and is a rendering library, not an analysis one). Every function
 * here is pure and operates on the raw GeoJSON-shaped `geometry` field
 * already produced by the FIRMS/EFFIS/Copernicus EMS adapters
 * (`{type:"Point"|"Polygon"|"MultiPolygon", coordinates}`, longitude first,
 * per GeoJSON convention) — no adapter or schema change was needed to reuse
 * it.
 *
 * Scope: point-in-polygon uses the outer ring only (holes are not
 * subtracted) — acceptable here because burned-area polygons from EFFIS are
 * simple exterior shapes in practice, and a false "inside" on a doughnut-hole
 * edge case only ever pulls the correlation score up, never silently drops
 * real evidence. Documented as a known limitation, not fixed speculatively.
 */

const EARTH_RADIUS_KM = 6_371;

export type LatLng = { lat: number; lng: number };
export type BoundingBox = { minLat: number; minLng: number; maxLat: number; maxLng: number };

/** Raw geometry shape as stored by Global Watch adapters (GeoJSON order: [lng, lat]). */
export type RawGeometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] }
  | Record<string, unknown>
  | undefined
  | null;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function isFiniteLatLng(point: Partial<LatLng> | null | undefined): point is LatLng {
  return (
    typeof point?.lat === "number" &&
    Number.isFinite(point.lat) &&
    typeof point?.lng === "number" &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180
  );
}

/** Haversine great-circle distance in kilometers. */
export function haversineDistanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}

function isRawGeometryObject(geometry: RawGeometry): geometry is { type: string; coordinates: unknown } {
  return Boolean(geometry) && typeof geometry === "object" && "type" in (geometry as object);
}

function collectRingPoints(node: unknown, out: LatLng[]): void {
  if (!Array.isArray(node)) return;
  if (node.length >= 2 && typeof node[0] === "number" && typeof node[1] === "number") {
    const [lng, lat] = node as [number, number];
    if (Number.isFinite(lat) && Number.isFinite(lng)) out.push({ lat, lng });
    return;
  }
  for (const child of node) collectRingPoints(child, out);
}

/** Centroid = arithmetic mean of all vertices (matches the approach already used by the EFFIS adapter). */
export function geometryCentroid(geometry: RawGeometry): LatLng | null {
  if (!isRawGeometryObject(geometry)) return null;
  if (geometry.type === "Point") {
    const coords = geometry.coordinates as unknown;
    if (Array.isArray(coords) && coords.length >= 2 && typeof coords[0] === "number" && typeof coords[1] === "number") {
      const point = { lat: coords[1] as number, lng: coords[0] as number };
      return isFiniteLatLng(point) ? point : null;
    }
    return null;
  }
  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
    const points: LatLng[] = [];
    collectRingPoints(geometry.coordinates, points);
    if (points.length === 0) return null;
    const sum = points.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), { lat: 0, lng: 0 });
    return { lat: sum.lat / points.length, lng: sum.lng / points.length };
  }
  return null;
}

/** Bounding box — search-preselection only, never the final correlation decision (Prompt 15 §10). */
export function geometryBoundingBox(geometry: RawGeometry): BoundingBox | null {
  if (!isRawGeometryObject(geometry)) return null;
  const points: LatLng[] = [];
  if (geometry.type === "Point") {
    const centroid = geometryCentroid(geometry);
    if (!centroid) return null;
    points.push(centroid);
  } else if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
    collectRingPoints(geometry.coordinates, points);
  }
  if (points.length === 0) return null;
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  for (const point of points) {
    if (point.lat < minLat) minLat = point.lat;
    if (point.lat > maxLat) maxLat = point.lat;
    if (point.lng < minLng) minLng = point.lng;
    if (point.lng > maxLng) maxLng = point.lng;
  }
  return { minLat, minLng, maxLat, maxLng };
}

/** Fast rectangular preselection with a degree margin. Never used as the merge decision itself. */
export function bboxOverlaps(a: BoundingBox, b: BoundingBox, marginDegrees = 0): boolean {
  return (
    a.minLat - marginDegrees <= b.maxLat + marginDegrees &&
    a.maxLat + marginDegrees >= b.minLat - marginDegrees &&
    a.minLng - marginDegrees <= b.maxLng + marginDegrees &&
    a.maxLng + marginDegrees >= b.minLng - marginDegrees
  );
}

function ringOf(polygonCoordinates: number[][][]): Array<[number, number]> {
  // Outer ring only — see file header note on holes.
  const outer = polygonCoordinates[0] ?? [];
  return outer as Array<[number, number]>;
}

/** Ray-casting point-in-polygon over a single ring (`[lng, lat]` pairs, GeoJSON order). */
function pointInRing(point: LatLng, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [lngI, latI] = ring[i];
    const [lngJ, latJ] = ring[j];
    const intersects =
      latI > point.lat !== latJ > point.lat &&
      point.lng < ((lngJ - lngI) * (point.lat - latI)) / (latJ - latI) + lngI;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Point-in-polygon / point-in-multipolygon over raw GeoJSON geometry. */
export function pointInGeometry(point: LatLng, geometry: RawGeometry): boolean {
  if (!isFiniteLatLng(point) || !isRawGeometryObject(geometry)) return false;
  if (geometry.type === "Polygon") {
    return pointInRing(point, ringOf(geometry.coordinates as number[][][]));
  }
  if (geometry.type === "MultiPolygon") {
    const polygons = geometry.coordinates as number[][][][];
    return polygons.some((polygon) => pointInRing(point, ringOf(polygon)));
  }
  return false;
}

/** Distance in km from a point to a segment, using an equirectangular local approximation (adequate at wildfire scales, never > ~500km). */
function pointToSegmentDistanceKm(point: LatLng, start: LatLng, end: LatLng): number {
  const latRef = toRadians((point.lat + start.lat + end.lat) / 3);
  const kmPerDegLat = 111.32;
  const kmPerDegLng = 111.32 * Math.cos(latRef);
  const toXY = (p: LatLng) => ({ x: p.lng * kmPerDegLng, y: p.lat * kmPerDegLat });
  const p = toXY(point);
  const a = toXY(start);
  const b = toXY(end);
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  let t = lengthSq === 0 ? 0 : ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * abx;
  const projY = a.y + t * aby;
  return Math.hypot(p.x - projX, p.y - projY);
}

function ringDistanceKm(point: LatLng, ring: Array<[number, number]>): number {
  if (ring.length === 0) return Infinity;
  let min = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = { lat: ring[i][1], lng: ring[i][0] };
    const b = { lat: ring[j][1], lng: ring[j][0] };
    min = Math.min(min, pointToSegmentDistanceKm(point, a, b));
  }
  return min;
}

/** Distance in km from a point to the nearest polygon/multipolygon boundary (0 if inside). */
export function distanceToGeometryBoundaryKm(point: LatLng, geometry: RawGeometry): number | null {
  if (!isFiniteLatLng(point) || !isRawGeometryObject(geometry)) return null;
  if (geometry.type === "Polygon") {
    if (pointInRing(point, ringOf(geometry.coordinates as number[][][]))) return 0;
    return ringDistanceKm(point, ringOf(geometry.coordinates as number[][][]));
  }
  if (geometry.type === "MultiPolygon") {
    const polygons = geometry.coordinates as number[][][][];
    let min = Infinity;
    for (const polygon of polygons) {
      const ring = ringOf(polygon);
      if (pointInRing(point, ring)) return 0;
      min = Math.min(min, ringDistanceKm(point, ring));
    }
    return Number.isFinite(min) ? min : null;
  }
  return null;
}

export type GeometryProximity = {
  /** True when the point falls inside a Polygon/MultiPolygon (0 distance). */
  contained: boolean;
  /** Distance in km: 0 when contained, boundary distance otherwise; centroid distance when neither geometry is a polygon. */
  distanceKm: number | null;
};

/**
 * Best-effort proximity between two incident geometries for correlation
 * scoring: prefers real polygon containment/boundary distance when either
 * side has one, falls back to centroid-to-centroid distance otherwise
 * (covers Point vs Point, e.g. FIRMS cluster vs Copernicus EMS activation).
 */
export function geometryProximity(a: RawGeometry, b: RawGeometry): GeometryProximity {
  const centroidA = geometryCentroid(a);
  const centroidB = geometryCentroid(b);
  const aIsPolygon = isRawGeometryObject(a) && (a.type === "Polygon" || a.type === "MultiPolygon");
  const bIsPolygon = isRawGeometryObject(b) && (b.type === "Polygon" || b.type === "MultiPolygon");

  if (bIsPolygon && centroidA) {
    const distance = distanceToGeometryBoundaryKm(centroidA, b);
    if (distance !== null) return { contained: distance === 0, distanceKm: distance };
  }
  if (aIsPolygon && centroidB) {
    const distance = distanceToGeometryBoundaryKm(centroidB, a);
    if (distance !== null) return { contained: distance === 0, distanceKm: distance };
  }
  if (centroidA && centroidB) {
    return { contained: false, distanceKm: haversineDistanceKm(centroidA, centroidB) };
  }
  return { contained: false, distanceKm: null };
}

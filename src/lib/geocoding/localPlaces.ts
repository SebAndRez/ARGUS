import type { GeoPoint } from "@/lib/routing/routingService";
import type { PlaceResult } from "@/lib/geocoding/geocodingService";

/**
 * Parseo local (sin red) de coordenadas escritas a mano ("-33.44,-70.64")
 * para complementar al geocodificador de direcciones.
 */

const COORDINATE_PATTERN = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

export function parseCoordinateQuery(query: string): PlaceResult | null {
  const match = query.match(COORDINATE_PATTERN);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return {
    id: `coord-${lat.toFixed(5)}-${lng.toFixed(5)}`,
    label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    address: "Coordenada ingresada manualmente",
    lat,
    lng,
    type: "custom",
    provider: "coordinates",
    confidence: 100,
  };
}

/**
 * Local (no-network) place candidates by name. The AURA/ARCA fixtures used to
 * be suggested here as if they were real hospitals/shelters — in production
 * that put fictitious places in navigation search. Real facilities come from
 * the geocoder and the live map layers, so nothing is suggested locally.
 */
export function getLocalPlaceCandidates(query: string, userLocation?: GeoPoint): PlaceResult[] {
  void query;
  void userLocation;
  return [];
}

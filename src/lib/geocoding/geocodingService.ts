import type { GeoPoint } from "@/lib/routing/routingService";
import { getLocalPlaceCandidates, parseCoordinateQuery } from "@/lib/geocoding/localPlaces";

/**
 * Buscador de destinos tipo Google Maps/Waze para ARGUS: direcciones,
 * hospitales, refugios, puntos de interes o coordenadas. Combina resultados
 * locales (hospitales AURA, refugios ARCA, coordenadas escritas a mano, sin
 * red) con un geocodificador de direcciones real via `/api/geocoding/search`
 * (proxy server-side, proveedor configurable con
 * `NEXT_PUBLIC_GEOCODING_PROVIDER`).
 */

export type PlaceType = "address" | "hospital" | "clinic" | "landmark" | "shelter" | "custom";

export type PlaceResult = {
  id: string;
  label: string;
  address?: string;
  lat: number;
  lng: number;
  type: PlaceType;
  provider: string;
  confidence: number;
  distanceKm?: number;
};

/** Puntos adicionales que el llamador ya tiene en memoria (reportes activos, puntos seguros, etc). */
export type ExtraSearchablePlace = PlaceResult;

function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const radiusKm = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function searchRemoteAddresses(query: string, userLocation?: GeoPoint): Promise<PlaceResult[]> {
  const params = new URLSearchParams({ q: query });
  if (userLocation) {
    params.set("lat", String(userLocation.lat));
    params.set("lng", String(userLocation.lng));
  }

  try {
    const response = await fetch(`/api/geocoding/search?${params.toString()}`, { signal: AbortSignal.timeout(6000) });
    const data: { results?: PlaceResult[]; error?: string } = await response.json();
    return data.results ?? [];
  } catch {
    return [];
  }
}

/**
 * Busca hospitales, clinicas, refugios, direcciones, puntos de interes o
 * coordenadas. `extraLocalPlaces` permite al llamador aportar candidatos que
 * viven en estado runtime (por ejemplo reportes/incidentes activos del mapa
 * operacional) sin acoplar este servicio a esos datos.
 */
export async function searchPlaces(
  query: string,
  userLocation?: GeoPoint,
  extraLocalPlaces: ExtraSearchablePlace[] = []
): Promise<PlaceResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const coordinateMatch = parseCoordinateQuery(trimmed);
  if (coordinateMatch) return [coordinateMatch];

  const normalizedQuery = trimmed.toLowerCase();
  const localMatches = [
    ...getLocalPlaceCandidates(trimmed, userLocation),
    ...extraLocalPlaces.filter((place) => place.label.toLowerCase().includes(normalizedQuery)),
  ];

  const remoteMatches = await searchRemoteAddresses(trimmed, userLocation);
  const remoteWithDistance = remoteMatches.map((place) => ({
    ...place,
    distanceKm: userLocation ? haversineKm(userLocation, { lat: place.lat, lng: place.lng }) : undefined,
  }));

  const combined = [...localMatches, ...remoteWithDistance];
  const seen = new Set<string>();
  const deduped = combined.filter((place) => {
    const key = `${place.lat.toFixed(4)},${place.lng.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
    .slice(0, 8);
}

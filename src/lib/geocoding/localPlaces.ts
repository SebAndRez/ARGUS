import { auraMedicalPoints } from "@/data/auraMedicalPoints";
import { arcaDemoShelters } from "@/modules/arca/data";
import type { GeoPoint } from "@/lib/routing/routingService";
import type { PlaceResult } from "@/lib/geocoding/geocodingService";

/**
 * Candidatos de busqueda que ya existen en ARGUS (hospitales AURA, refugios
 * ARCA) y parseo de coordenadas escritas a mano ("-33.44,-70.64"). No
 * requieren red: se filtran localmente por texto para complementar al
 * geocodificador de direcciones.
 */

function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const radiusKm = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

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

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function getLocalPlaceCandidates(query: string, userLocation?: GeoPoint): PlaceResult[] {
  const normalizedQuery = normalize(query.trim());
  if (normalizedQuery.length < 2) return [];

  const results: PlaceResult[] = [];

  for (const point of auraMedicalPoints) {
    if (!normalize(point.name).includes(normalizedQuery)) continue;
    results.push({
      id: `hospital-${point.id}`,
      label: point.name,
      address: point.location.label ?? "Punto medico AURA",
      lat: point.location.lat,
      lng: point.location.lng,
      type: point.type === "hospital" ? "hospital" : "clinic",
      provider: "argus_aura",
      confidence: point.confidence === "verified" ? 95 : point.confidence === "high" ? 80 : 60,
      distanceKm: userLocation ? haversineKm(userLocation, { lat: point.location.lat, lng: point.location.lng }) : undefined,
    });
  }

  for (const shelter of arcaDemoShelters) {
    if (!normalize(shelter.name).includes(normalizedQuery)) continue;
    results.push({
      id: `shelter-${shelter.id}`,
      label: shelter.name,
      address: shelter.addressLabel ?? "Refugio ARCA",
      lat: shelter.location.lat,
      lng: shelter.location.lng,
      type: "shelter",
      provider: "argus_arca",
      confidence: 75,
      distanceKm: userLocation ? haversineKm(userLocation, { lat: shelter.location.lat, lng: shelter.location.lng }) : undefined,
    });
  }

  return results.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
}

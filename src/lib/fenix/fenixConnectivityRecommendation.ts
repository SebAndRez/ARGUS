import { getCriticalPoisNear } from "@/lib/criticalPoi/criticalPoiPersistenceService";
import { TELECOM_POI_CATEGORIES } from "@/lib/connectivity/telecomConnectivityService";
import type { CriticalPoi } from "@/lib/criticalPoi/criticalPoiTypes";

/**
 * Recomendacion de punto de conectividad mas cercano (carro movil, wifi de
 * emergencia, punto de carga) para FENIX (spec ARGUS v1.0.3.6 §14): cuando
 * un refugio recomendado no tiene conectividad confirmada, o la zona esta
 * en un estado de red degradado, FENIX debe poder sugerir el punto mas
 * cercano en vez de solo penalizar el puntaje del refugio. Consulta
 * `CriticalPoi` directamente (mismo mecanismo que `fenixShelterSource.ts`),
 * nunca datos demo.
 */

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface NearestConnectivityPoint {
  id: string;
  name: string;
  category: string;
  distanceKm: number;
  coordinates: [number, number];
}

const DEFAULT_SEARCH_RADIUS_KM = 25;

export async function findNearestConnectivityPoint(
  point: { lat: number; lng: number },
  radiusKm: number = DEFAULT_SEARCH_RADIUS_KM
): Promise<NearestConnectivityPoint | null> {
  const pois: CriticalPoi[] = await getCriticalPoisNear(point, radiusKm, {
    categories: [...TELECOM_POI_CATEGORIES],
  });
  if (pois.length === 0) return null;

  const nearest = pois
    .map((poi) => ({ poi, distanceKm: haversineKm(point, { lat: poi.lat, lng: poi.lng }) }))
    .sort((left, right) => left.distanceKm - right.distanceKm)[0];

  return {
    id: nearest.poi.id,
    name: nearest.poi.name,
    category: nearest.poi.category,
    distanceKm: Math.round(nearest.distanceKm * 10) / 10,
    coordinates: [nearest.poi.lat, nearest.poi.lng],
  };
}

import { getCriticalPoisNear } from "@/lib/criticalPoi/criticalPoiPersistenceService";
import type { CriticalPoi, CriticalPoiCategory } from "@/lib/criticalPoi/criticalPoiTypes";
import type { MedicalPoint, MedicalPointType } from "@/types/medical";

/**
 * Real medical points for AURA, the SOS medical flow and the operational map:
 * persisted `CriticalPoi` rows of the care categories (OSM-backed catalogue,
 * `criticalPoiCategoryRegistry`). Availability is never known from this
 * source, so it is always "unknown" — nothing is invented.
 *
 * Server-only (Prisma). Clients go through `/api/medical-points`.
 */

/**
 * Care-capable facilities only. Pharmacies are deliberately excluded: these
 * points feed the medical SOS recommendation and routing, and a pharmacy is
 * never an emergency destination (they remain in the general POI layer).
 */
export const MEDICAL_POI_CATEGORIES: CriticalPoiCategory[] = ["hospital", "emergency_care", "clinic"];

export const DEFAULT_MEDICAL_RADIUS_KM = 15;

const TYPE: Partial<Record<CriticalPoiCategory, MedicalPointType>> = {
  hospital: "hospital",
  emergency_care: "sapu",
  clinic: "clinic",
};

const CAPABILITIES: Partial<Record<CriticalPoiCategory, string[]>> = {
  hospital: ["Hospital"],
  emergency_care: ["Urgencia"],
  clinic: ["Clinica"],
};

/** Emergency-capable facilities first at equal distance. */
const CATEGORY_RANK: Partial<Record<CriticalPoiCategory, number>> = { hospital: 0, emergency_care: 1, clinic: 2 };

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const radiusKm = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180);
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function criticalPoiToMedicalPoint(poi: CriticalPoi, origin?: { lat: number; lng: number }): MedicalPoint {
  return {
    id: poi.id,
    name: poi.name,
    type: TYPE[poi.category] ?? "clinic",
    lat: poi.lat,
    lng: poi.lng,
    capabilities: CAPABILITIES[poi.category] ?? [],
    distanceKm: origin ? Math.round(haversineKm(origin, poi) * 10) / 10 : undefined,
    availabilityStatus: poi.status === "closed" ? "closed" : "unknown",
    isDemo: false,
  };
}

export async function getRealMedicalPointsNear(
  origin: { lat: number; lng: number },
  radiusKm = DEFAULT_MEDICAL_RADIUS_KM
): Promise<MedicalPoint[]> {
  const pois = await getCriticalPoisNear(origin, radiusKm, { categories: MEDICAL_POI_CATEGORIES });
  return pois
    .map((poi) => ({ point: criticalPoiToMedicalPoint(poi, origin), rank: CATEGORY_RANK[poi.category] ?? 9 }))
    .sort((a, b) => (a.point.distanceKm ?? Infinity) - (b.point.distanceKm ?? Infinity) || a.rank - b.rank)
    .map(({ point }) => point);
}

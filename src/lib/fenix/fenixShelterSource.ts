import { getCriticalPoisNear } from "@/lib/criticalPoi/criticalPoiPersistenceService";
import { getOperationalStatusesByPoiIds } from "@/lib/criticalPoi/shelterOperationalStatusService";
import type { ShelterOperationalStatus } from "@/lib/criticalPoi/shelterOperationalStatusTypes";
import type { FenixShelter, FenixShelterRecommendationTier } from "@/types/fenix";
import { findNearestConnectivityPoint } from "@/lib/fenix/fenixConnectivityRecommendation";

/**
 * Puente entre `CriticalPoi` (categoria "shelter" + `CriticalPoiOperationalStatus`,
 * ver `src/lib/criticalPoi/*`) y la forma `FenixShelter` que consume el motor
 * FENIX (`fenixSimulationEngine.ts`) y `/api/fenix/shelters`. Sustituye a
 * `demoFenixShelters` cuando la consulta trae una ubicacion real — el modo
 * demo (por `scenarioId`) sigue intacto y sin tocar este modulo.
 */

/**
 * Como FENIX puede usar el refugio como candidato (spec ARGUS v1.0.3.5
 * §23): `confirmed` exige estado operacional conocido y favorable,
 * verificacion multi-fuente/oficial, dato vigente, ubicacion precisa y
 * ruta no bloqueada — todo a la vez. `reference` es el caso explicito de
 * un recinto que solo aparece en un registro de baja verificacion (p.ej.
 * Codigo Azul en solitario) sin ningun estado operacional confirmado: no
 * debe recomendarse como destino. Todo lo demas es `potential`.
 */
export function deriveFenixRecommendationTier(status: ShelterOperationalStatus | undefined, locationAccuracy: string | undefined): FenixShelterRecommendationTier {
  if (!status) return "reference";

  const favorableStatus = status.shelterStatus === "available" || status.shelterStatus === "near_capacity";
  const wellVerified = status.verificationStatus === "official" || status.verificationStatus === "corroborated";
  const preciseLocation = !locationAccuracy || locationAccuracy === "precise";
  const routeOpen = status.routeStatus === undefined || status.routeStatus === "open" || status.routeStatus === "congested";

  if (favorableStatus && wellVerified && !status.isStale && preciseLocation && routeOpen) return "confirmed";

  // "unknown" + sin corroborar (Codigo Azul en solitario cae aca: reporta
  // capacidad declarada/horario pero nunca shelterStatus, ver
  // `criticalPoiCodigoAzulSync.ts`) -> existe pero no se recomienda.
  const noOperationalEvidence =
    status.shelterStatus === "unknown" && (status.verificationStatus === "unverified" || status.verificationStatus === "candidate");
  if (noOperationalEvidence) return "reference";

  return "potential";
}

export async function getRealFenixShelters(point: { lat: number; lng: number }, radiusKm: number): Promise<FenixShelter[]> {
  const pois = await getCriticalPoisNear(point, radiusKm, { categories: ["shelter"] });
  if (pois.length === 0) return [];

  const statusByPoiId = await getOperationalStatusesByPoiIds(pois.map((poi) => poi.id));

  return Promise.all(pois.map(async (poi): Promise<FenixShelter> => {
    const status = statusByPoiId.get(poi.id);
    const locationAccuracy = poi.tags?.locationAccuracy as FenixShelter["locationAccuracy"] | undefined;
    const nearestConnectivityPoint =
      status?.hasConnectivity === false
        ? (await findNearestConnectivityPoint({ lat: poi.lat, lng: poi.lng })) ?? undefined
        : undefined;
    return {
      id: poi.id,
      name: poi.name,
      status: status?.shelterStatus ?? "unknown",
      coordinates: [poi.lat, poi.lng],
      capacity: status?.capacityTotal,
      currentOccupancy: status?.occupancyCurrent,
      capacityDeclared: status?.capacityDeclared,
      operatingHours: status?.operatingHours,
      medicalSupport: status?.hasMedical,
      powerAvailable: status?.hasElectricity,
      waterAvailable: status?.hasWater,
      hasFood: status?.hasFood,
      hasHeating: status?.hasHeating,
      hasBathrooms: status?.hasBathrooms,
      hasShowers: status?.hasShowers,
      isAccessible: status?.isAccessible,
      allowsPets: status?.allowsPets,
      hasConnectivity: status?.hasConnectivity,
      accessNotes: status?.contactNotes,
      poiId: poi.id,
      address: poi.address,
      operatorName: status?.operatorName,
      contactPhone: status?.contactPhone,
      routeStatus: status?.routeStatus,
      sourceType: status?.sourceType,
      sourceName: status?.sourceName,
      confidence: status?.confidence,
      verificationStatus: status?.verificationStatus,
      lastVerifiedAt: status?.lastVerifiedAt,
      isStale: status?.isStale,
      publicationStatus: status?.publicationStatus,
      locationAccuracy,
      fenixRecommendationTier: deriveFenixRecommendationTier(status, locationAccuracy),
      nearestConnectivityPoint,
    };
  }));
}

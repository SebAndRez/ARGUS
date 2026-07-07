import type { MedicalPoint } from "@/types/medical";
import type { HermesAuraSignal, HermesBlockage, HermesGeoPoint, HermesRiskZone } from "@/modules/hermes/types";
import { calculateHermesRoutes } from "@/modules/hermes/hermesRouting";

/**
 * Prepara rutas hacia puntos médicos AURA reales (`src/types/medical.ts`,
 * `MedicalPoint`), sin exponer datos médicos personales — solo
 * ubicación/tipo del punto y estado de la ruta.
 */
export async function prepareHermesRoutesToMedicalPoints(
  medicalPoints: MedicalPoint[],
  origin: HermesGeoPoint,
  context: { blockages?: HermesBlockage[]; riskZones?: HermesRiskZone[]; needsAmbulance?: boolean } = {}
): Promise<{ medicalPoint: MedicalPoint; signal: HermesAuraSignal }[]> {
  const results = await Promise.all(
    medicalPoints.map(async (medicalPoint) => {
      const routes = await calculateHermesRoutes({
        origin,
        destination: { lat: medicalPoint.lat, lng: medicalPoint.lng, label: medicalPoint.name },
        mobilityMode: context.needsAmbulance ? "ambulance" : "car",
        purpose: "medical_access",
        blockages: context.blockages,
        riskZones: context.riskZones,
      });
      const best = routes[0];
      return {
        medicalPoint,
        signal: {
          routeId: best.id,
          medicalPointId: medicalPoint.id,
          distanceMeters: best.distanceMeters,
          routeStatus: best.status,
          recommendsAmbulance: best.status === "high_risk" || best.status === "caution",
        } satisfies HermesAuraSignal,
      };
    })
  );

  return results.sort((a, b) => (a.signal.distanceMeters ?? Infinity) - (b.signal.distanceMeters ?? Infinity));
}

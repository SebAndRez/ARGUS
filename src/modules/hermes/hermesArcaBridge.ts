import type { HermesArcaSignal, HermesGeoPoint } from "@/modules/hermes/types";
import { calculateHermesRoutes } from "@/modules/hermes/hermesRouting";
import type { HermesBlockage, HermesRiskZone } from "@/modules/hermes/types";

/**
 * ARCA todavía no existe como módulo completo; este puente solo define la
 * forma mínima de un refugio (id, nombre, ubicación, señal de capacidad) sin
 * implementar gestión real de refugios.
 */
export interface HermesShelterInput {
  id: string;
  name: string;
  location: HermesGeoPoint;
  hasCapacitySignal?: boolean;
}

/**
 * Prepara rutas hacia refugios ARCA: refugio más cercano con ruta de menor
 * riesgo disponible. No implementa ARCA completo (capacidad real, gestión de
 * ocupación) — solo el puente de movilidad.
 */
export async function prepareHermesRoutesToShelters(
  shelters: HermesShelterInput[],
  origin: HermesGeoPoint,
  context: { blockages?: HermesBlockage[]; riskZones?: HermesRiskZone[] } = {}
): Promise<{ shelter: HermesShelterInput; signal: HermesArcaSignal }[]> {
  const results = await Promise.all(
    shelters.map(async (shelter) => {
      const routes = await calculateHermesRoutes({
        origin,
        destination: shelter.location,
        mobilityMode: "car",
        purpose: "shelter_access",
        blockages: context.blockages,
        riskZones: context.riskZones,
      });
      const best = routes[0];
      return {
        shelter,
        signal: {
          routeId: best.id,
          shelterId: shelter.id,
          distanceMeters: best.distanceMeters,
          hasCapacitySignal: shelter.hasCapacitySignal ?? false,
          routeStatus: best.status,
          isLeastRiskOption: best.riskScore === Math.min(...routes.map((r) => r.riskScore)),
        } satisfies HermesArcaSignal,
      };
    })
  );

  return results.sort((a, b) => (a.signal.distanceMeters ?? Infinity) - (b.signal.distanceMeters ?? Infinity));
}

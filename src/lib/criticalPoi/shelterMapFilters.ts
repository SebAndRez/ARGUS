import type { CriticalPoiWithOperationalStatus, ShelterStatus } from "@/lib/criticalPoi/shelterOperationalStatusTypes";

/**
 * Filtro de refugios en el mapa (estado/antiguedad), aplicado en cliente
 * sobre los POIs ya obtenidos de `/api/critical-pois` — no cambia el
 * contrato de la API ni afecta otras categorias de infraestructura critica.
 * Ver spec ARGUS v1.0.3.4 §10/§11 (filtrado por estado/antiguedad).
 */

export interface ShelterMapFilterState {
  /** Vacio = mostrar todos los estados. */
  statuses: ShelterStatus[];
  hideStale: boolean;
}

export const defaultShelterMapFilterState: ShelterMapFilterState = { statuses: [], hideStale: false };

export function matchesShelterFilter(poi: CriticalPoiWithOperationalStatus, filter: ShelterMapFilterState): boolean {
  if (poi.category !== "shelter") return true;

  if (filter.hideStale && poi.operationalStatus?.isStale) return false;

  if (filter.statuses.length > 0) {
    const currentStatus = poi.operationalStatus?.shelterStatus ?? "unknown";
    if (!filter.statuses.includes(currentStatus)) return false;
  }

  return true;
}

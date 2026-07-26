import type { CriticalPoi } from "@/lib/criticalPoi/criticalPoiTypes";
import type { ShelterOperationalStatus, ShelterStatus } from "@/lib/criticalPoi/shelterOperationalStatusTypes";
import type { ResourceOperationalState } from "@/types/operationalContext";

/**
 * ARGUS Operational Context Engine — Fase 8 (estado operacional).
 *
 * Nunca asume que un `CriticalPoi` está operativo solo porque existe en el
 * catálogo (mismo principio ya aplicado por `ShelterOperationalStatus`,
 * `src/lib/criticalPoi/shelterOperationalStatusTypes.ts:9-10`: "no inventar
 * capacidad, ocupación ni disponibilidad"). Cuando no hay evidencia de
 * estado, el resultado es `unconfirmed`, nunca `operational` por defecto.
 */

const SHELTER_STATUS_TO_RESOURCE_STATE: Record<ShelterStatus, ResourceOperationalState> = {
  available: "operational",
  near_capacity: "limited",
  full: "saturated",
  closed: "closed",
  compromised: "out_of_service",
  unknown: "unconfirmed",
};

const CRITICAL_POI_STATUS_TO_RESOURCE_STATE: Record<CriticalPoi["status"], ResourceOperationalState> = {
  active: "operational",
  unknown: "unconfirmed",
  closed: "closed",
  temporary: "limited",
};

/**
 * `shelterStatus` es opcional a propósito: `getCriticalPoisNear` (el cliente
 * que alimenta el motor, ver `operationalResourceEngine.ts`) devuelve
 * `CriticalPoi[]` planos, sin el join a `CriticalPoiOperationalStatus` — un
 * caller que ya tenga el estado de refugio resuelto (ej. una vista que
 * también llama `/api/critical-pois`) puede pasarlo aquí para una derivación
 * más precisa; sin él, un refugio cae al mismo camino genérico que cualquier
 * otro POI (`unconfirmed` si `status` no es `active`).
 */
export function deriveOperationalState(
  poi: Pick<CriticalPoi, "category" | "status" | "confidence">,
  shelterStatus?: ShelterOperationalStatus
): ResourceOperationalState {
  if (poi.category === "shelter" && shelterStatus) {
    return SHELTER_STATUS_TO_RESOURCE_STATE[shelterStatus.shelterStatus];
  }

  if (poi.status === "active" && poi.confidence < 40) {
    return "unconfirmed";
  }

  return CRITICAL_POI_STATUS_TO_RESOURCE_STATE[poi.status];
}

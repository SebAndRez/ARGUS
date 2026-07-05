import type { ArcaCapacityStatus, ArcaShelter } from "@/modules/arca/types";

/**
 * Cálculo de estado de capacidad. No inventa precisión si los datos son
 * estimados o incompletos.
 */
export function calculateArcaCapacityStatus(shelter: ArcaShelter): ArcaCapacityStatus {
  const { total, currentOccupancy } = shelter.capacity;
  if (total === undefined || currentOccupancy === undefined || total <= 0) return "unknown";

  const ratio = currentOccupancy / total;
  if (ratio >= 1.1) return "over_capacity";
  if (ratio >= 1) return "full";
  if (ratio >= 0.85) return "near_full";
  if (ratio >= 0.6) return "limited";
  return "available";
}

/**
 * Cupo disponible estimado. Devuelve `null` cuando no hay datos suficientes
 * en vez de inventar un número — evita afirmar precisión que no existe.
 */
export function getArcaAvailableCapacity(shelter: ArcaShelter): number | null {
  const { total, currentOccupancy, available } = shelter.capacity;
  if (typeof available === "number") return Math.max(0, available);
  if (total === undefined || currentOccupancy === undefined) return null;
  return Math.max(0, total - currentOccupancy);
}

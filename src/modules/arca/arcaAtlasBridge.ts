import type { ArcaAtlasSummary, ArcaShelter } from "@/modules/arca/types";
import { calculateArcaCapacityStatus } from "@/modules/arca/arcaCapacity";

/**
 * Resumen tipado que ATLAS podrá consumir como panel operacional de
 * refugios. No se conecta automáticamente aquí — solo se prepara el dato.
 */
export function getArcaAtlasSummary(shelters: ArcaShelter[]): ArcaAtlasSummary {
  const activeShelters = shelters.filter((shelter) => shelter.status === "active" || shelter.status === "limited").length;
  const estimatedTotalCapacity = shelters.reduce((sum, shelter) => sum + (shelter.capacity.total ?? 0), 0);
  const estimatedOccupancy = shelters.reduce((sum, shelter) => sum + (shelter.capacity.currentOccupancy ?? 0), 0);
  const availableCapacity = Math.max(0, estimatedTotalCapacity - estimatedOccupancy);

  const criticalNeeds = shelters.reduce(
    (sum, shelter) => sum + shelter.needs.filter((need) => need.priority === "critical" && need.status === "open").length,
    0
  );
  const saturatedShelters = shelters.filter((shelter) =>
    ["full", "over_capacity"].includes(calculateArcaCapacityStatus(shelter))
  ).length;
  const sheltersWithIssues = shelters.filter(
    (shelter) => shelter.status === "limited" || shelter.needs.some((need) => need.priority === "critical" && need.status === "open")
  ).length;
  const sheltersWithMedicalPoint = shelters.filter((shelter) => shelter.services.medicalPoint === "available").length;

  const timestamps = shelters.map((shelter) => shelter.updatedAt).sort();

  return {
    activeShelters,
    estimatedTotalCapacity,
    estimatedOccupancy,
    availableCapacity,
    criticalNeeds,
    saturatedShelters,
    sheltersWithIssues,
    sheltersWithMedicalPoint,
    lastUpdatedIso: timestamps.at(-1) ?? null,
  };
}

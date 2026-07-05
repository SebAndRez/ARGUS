import type { ArcaFenixSheltersPacket, ArcaShelter } from "@/modules/arca/types";
import { calculateArcaCapacityStatus } from "@/modules/arca/arcaCapacity";

/**
 * Prepara datos limpios y trazables de refugios para futuras simulaciones
 * de evacuación de FÉNIX. No simula nada — solo entrega capacidad,
 * ocupación, disponibilidad, distribución geográfica, servicios críticos y
 * datos faltantes.
 */
export function prepareArcaSheltersForFenixSimulation(
  shelters: ArcaShelter[],
  context: { eventType?: string } = {}
): ArcaFenixSheltersPacket {
  const totalCapacity = shelters.reduce((sum, shelter) => sum + (shelter.capacity.total ?? 0), 0);
  const estimatedOccupancy = shelters.reduce((sum, shelter) => sum + (shelter.capacity.currentOccupancy ?? 0), 0);

  const availableShelterIds = shelters
    .filter((shelter) => ["available", "limited"].includes(calculateArcaCapacityStatus(shelter)))
    .map((shelter) => shelter.id);
  const saturatedShelterIds = shelters
    .filter((shelter) => ["full", "over_capacity"].includes(calculateArcaCapacityStatus(shelter)))
    .map((shelter) => shelter.id);

  const geographicDistribution = shelters.map((shelter) => shelter.location);

  const criticalServices = Array.from(
    new Set(
      shelters.flatMap((shelter) =>
        Object.entries(shelter.services)
          .filter(([, status]) => status === "available")
          .map(([serviceName]) => serviceName)
      )
    )
  );

  const missingData: string[] = [];
  if (shelters.some((shelter) => shelter.capacity.total === undefined)) missingData.push("Capacidad total no informada en algún refugio.");
  if (shelters.some((shelter) => shelter.capacity.isEstimated)) missingData.push("Parte de la capacidad es estimada, no confirmada.");
  if (!context.eventType) missingData.push("Sin tipo de evento asociado para esta preparación.");

  return {
    totalCapacity,
    estimatedOccupancy,
    availableShelterIds,
    saturatedShelterIds,
    geographicDistribution,
    criticalServices,
    missingData,
  };
}

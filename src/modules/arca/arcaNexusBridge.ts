import type { ArcaNexusNeedSignal, ArcaShelter } from "@/modules/arca/types";

/**
 * ARCA solo define demanda de suministros; NEXUS gestionará inventario y
 * distribución. No implementa inventario completo aquí.
 */
export function prepareArcaNeedsForNexus(shelters: ArcaShelter[]): ArcaNexusNeedSignal[] {
  return shelters.flatMap((shelter) =>
    shelter.needs
      .filter((need) => need.status === "open" || need.status === "partially_fulfilled")
      .map((need) => ({
        shelterId: shelter.id,
        needId: need.id,
        type: need.type,
        priority: need.priority,
        quantityNeeded: need.quantityNeeded,
        unit: need.unit,
        status: need.status,
        approximateZone: shelter.location,
      }) satisfies ArcaNexusNeedSignal)
  );
}

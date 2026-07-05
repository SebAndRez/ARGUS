import type { ArcaGeoPoint, ArcaHermesCandidate, ArcaShelter } from "@/modules/arca/types";
import { calculateArcaCapacityStatus } from "@/modules/arca/arcaCapacity";
import type { HermesShelterInput } from "@/modules/hermes/hermesArcaBridge";

/**
 * Prepara refugios candidatos para que HERMES calcule rutas hacia ellos.
 * No calcula rutas aquí (eso es responsabilidad de HERMES) — solo entrega
 * destino, estado de capacidad, restricciones, prioridad y advertencias.
 */
export function prepareArcaSheltersForHermes(
  shelters: ArcaShelter[],
  origin: ArcaGeoPoint,
  context: { eventType?: string } = {}
): ArcaHermesCandidate[] {
  const isMedicalEvent = context.eventType === "medical_emergency";

  return shelters
    .filter((shelter) => shelter.status !== "closed")
    .map((shelter) => {
      const capacityStatus = calculateArcaCapacityStatus(shelter);
      const warnings: string[] = [];
      if (capacityStatus === "full" || capacityStatus === "over_capacity") {
        warnings.push("Refugio lleno o sobre su capacidad; considerar alternativa.");
      }
      const criticalNeeds = shelter.needs.filter((need) => need.priority === "critical" && need.status === "open");
      if (criticalNeeds.length > 0) {
        warnings.push(`${criticalNeeds.length} necesidad(es) crítica(s) sin resolver en el refugio.`);
      }
      if (isMedicalEvent && shelter.services.medicalPoint !== "available") {
        warnings.push("Sin punto médico y el evento tiene impacto sanitario.");
      }

      const priority: ArcaHermesCandidate["priority"] =
        isMedicalEvent && shelter.services.medicalPoint === "available"
          ? "critical"
          : capacityStatus === "available"
            ? "high"
            : capacityStatus === "limited"
              ? "medium"
              : "low";

      return {
        shelterId: shelter.id,
        destination: shelter.location,
        capacityStatus,
        restrictions: shelter.restrictions ?? [],
        priority,
        warnings,
      } satisfies ArcaHermesCandidate;
    });
}

/**
 * Convierte refugios ARCA a la forma mínima que ya espera el puente HERMES
 * (`hermesArcaBridge.ts`), reutilizando su lógica de cálculo de rutas en vez
 * de duplicarla.
 */
export function toHermesShelterInputs(shelters: ArcaShelter[]): HermesShelterInput[] {
  return shelters
    .filter((shelter) => shelter.status !== "closed")
    .map((shelter) => ({
      id: shelter.id,
      name: shelter.name,
      location: shelter.location,
      hasCapacitySignal: calculateArcaCapacityStatus(shelter) === "available",
    }));
}

/**
 * Selecciona los mejores refugios para enrutamiento HERMES. Reglas:
 * - no recomendar refugios cerrados;
 * - no priorizar refugios llenos salvo emergencia y sin alternativa;
 * - refugios con capacidad y ruta segura suben;
 * - refugios con punto médico suben si el evento tiene impacto sanitario;
 * - refugios con necesidades críticas advierten, no se descartan.
 */
export function getBestSheltersForHermesRouting(
  shelters: ArcaShelter[],
  context: { needsMedicalSupport?: boolean; isEmergency?: boolean } = {}
): ArcaShelter[] {
  const usable = shelters.filter((shelter) => shelter.status !== "closed");

  const scored = usable.map((shelter) => {
    const capacityStatus = calculateArcaCapacityStatus(shelter);
    let score = 0;
    if (capacityStatus === "available") score += 30;
    else if (capacityStatus === "limited") score += 15;
    else if (capacityStatus === "full" || capacityStatus === "over_capacity") {
      score -= context.isEmergency ? 5 : 30;
    }
    if (context.needsMedicalSupport && shelter.services.medicalPoint === "available") score += 20;
    const criticalNeeds = shelter.needs.filter((need) => need.priority === "critical" && need.status === "open").length;
    score -= criticalNeeds * 5;
    return { shelter, score };
  });

  return scored
    .filter((entry) => context.isEmergency || entry.score > -20)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.shelter);
}

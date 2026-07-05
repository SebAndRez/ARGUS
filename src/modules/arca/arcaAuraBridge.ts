import type { ArcaAuraMedicalSignal, ArcaShelter } from "@/modules/arca/types";

/**
 * Identifica refugios con punto médico, necesidad médica o que requieren
 * derivación a AURA. No maneja datos personales médicos ni implementa
 * triage — solo señala qué refugios necesitan revisión sanitaria.
 */
export function prepareArcaMedicalShelterSignals(shelters: ArcaShelter[]): ArcaAuraMedicalSignal[] {
  return shelters.map((shelter) => {
    const hasMedicalPoint = shelter.services.medicalPoint === "available";
    const hasMedicalNeed = shelter.needs.some(
      (need) => need.type === "medical_staff" && need.status === "open" && (need.priority === "high" || need.priority === "critical")
    );

    return {
      shelterId: shelter.id,
      hasMedicalPoint,
      suitableForPrimaryCare: hasMedicalPoint && shelter.status !== "closed",
      requiresAuraReferral: hasMedicalNeed || (!hasMedicalPoint && shelter.services.medicalPoint === "limited"),
    } satisfies ArcaAuraMedicalSignal;
  });
}

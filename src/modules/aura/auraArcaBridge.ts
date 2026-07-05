import type { AuraMedicalPoint } from "@/modules/aura/types";

export function convertArcaSheltersToAuraMedicalPoints(shelters: Array<{ id: string; name: string; location: { lat: number; lng: number; label?: string }; services?: { medicalPoint?: string | boolean }; status?: string; updatedAt?: string }>): AuraMedicalPoint[] {
  return shelters
    .filter((shelter) => shelter.services?.medicalPoint === true || shelter.services?.medicalPoint === "available")
    .map((shelter) => ({
      id: `aura-from-${shelter.id}`,
      name: `${shelter.name} - punto medico`,
      type: "shelter_medical_point",
      status: shelter.status === "closed" ? "closed" : "active",
      location: { ...shelter.location, isApproximate: true },
      services: { firstAid: true, emergencyCare: false, triage: "unknown", ambulance: false, pharmacy: false, traumaCare: false, pediatricCare: "unknown", mentalHealthSupport: "unknown", oxygen: "unknown", defibrillator: "unknown" },
      confidence: "medium",
      publicNotes: "Punto medico derivado desde ARCA. Sin triage ni ficha clinica.",
      updatedAt: shelter.updatedAt ?? new Date().toISOString(),
    }));
}

export function prepareAuraMedicalNeedsForArca(signals: Array<{ shelterId: string; need: string; priority: string }>) {
  return signals.map((signal) => ({ ...signal, personalMedicalDataIncluded: false, targetModule: "ARCA" }));
}

import type { AuraMedicalPoint, AuraTriageCase } from "@/modules/aura/types";

export function prepareAuraDataForFenixSimulation(cases: AuraTriageCase[], medicalPoints: AuraMedicalPoint[]) {
  return {
    activeMedicalPoints: medicalPoints.filter((point) => point.status === "active").length,
    saturatedMedicalPoints: medicalPoints.filter((point) => point.status === "saturated" || point.status === "limited").length,
    estimatedMedicalDemand: cases.filter((item) => item.status !== "closed").length,
    restrictions: ["Datos agregados solamente", "Sin fichas medicas individuales"],
    missingData: medicalPoints.some((point) => !point.capacity) ? ["Capacidad medica incompleta"] : [],
  };
}

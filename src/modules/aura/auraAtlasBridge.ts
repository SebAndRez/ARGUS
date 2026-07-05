import type { AuraMedicalPoint, AuraMedicalStockItem, AuraTriageCase } from "@/modules/aura/types";

export function getAuraAtlasSummary(cases: AuraTriageCase[], medicalPoints: AuraMedicalPoint[], stock: AuraMedicalStockItem[]) {
  return {
    activeMedicalCases: cases.filter((item) => item.status !== "closed").length,
    criticalCases: cases.filter((item) => item.urgency === "critical").length,
    activeMedicalPoints: medicalPoints.filter((point) => point.status === "active").length,
    saturatedMedicalPoints: medicalPoints.filter((point) => point.status === "saturated" || point.status === "limited").length,
    ambulancesAvailable: medicalPoints.reduce((sum, point) => sum + (point.capacity?.ambulancesAvailable ?? 0), 0),
    criticalStock: stock.filter((item) => item.status === "critical" || item.status === "depleted").length,
    openMedicalNeeds: stock.filter((item) => item.status === "low" || item.status === "critical" || item.status === "depleted").length,
    lastUpdated: [medicalPoints[0]?.updatedAt, cases[0]?.updatedAt, stock[0]?.updatedAt].filter(Boolean).sort().at(-1) ?? null,
  };
}

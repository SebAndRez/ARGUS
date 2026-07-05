import type { AuraMedicalPoint, AuraMedicalStockItem, AuraTriageCase } from "@/modules/aura/types";

export function prepareAuraMedicalNeedsForNexus(cases: AuraTriageCase[], medicalPoints: AuraMedicalPoint[], stock: AuraMedicalStockItem[]) {
  return [
    ...stock.filter((item) => ["low", "critical", "depleted"].includes(item.status)).map((item) => ({
      type: item.category,
      description: item.name,
      priority: item.status === "critical" || item.status === "depleted" ? "critical" : "medium",
      quantity: item.quantity,
      unit: item.unit,
      locationId: item.locationId,
      personalMedicalDataIncluded: false,
    })),
    ...cases.filter((item) => item.transportRequired).map((item) => ({
      type: "ambulance",
      description: "Necesidad agregada de traslado sanitario",
      priority: item.urgency,
      locationId: item.assignedMedicalPointId,
      personalMedicalDataIncluded: false,
    })),
    ...medicalPoints.filter((point) => point.status === "limited").map((point) => ({
      type: "medical_staff",
      description: `Refuerzo sanitario sugerido para ${point.name}`,
      priority: "high",
      locationId: point.id,
      personalMedicalDataIncluded: false,
    })),
  ];
}

export function convertAuraDataToFenixMedicalInputs(cases: unknown[], medicalPoints: unknown[], capacity: unknown[], stock: unknown[]) {
  return { activeCases: cases.length, medicalPoints, capacity, criticalStockItems: stock.length, personalMedicalDataIncluded: false };
}

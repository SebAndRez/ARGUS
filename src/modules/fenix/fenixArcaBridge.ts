export function convertArcaSheltersToFenixShelterInputs(shelters: unknown[]) {
  return { shelters, capacityIncluded: shelters.length > 0, confidence: shelters.length ? "medium" : "low" };
}

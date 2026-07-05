export function buildCopernicusFloodHealthContext(context: Record<string, unknown>) {
  return {
    sourceId: "copernicus-flood",
    floodHealthContext: context,
    noMedicalAvailabilityPromise: true,
    caveat: "Flood health context only; does not promise accessibility or medical capacity.",
    evidenceRefs: [],
  };
}

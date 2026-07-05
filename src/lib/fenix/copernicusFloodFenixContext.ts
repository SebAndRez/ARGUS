export function buildCopernicusFloodFenixContext(context: Record<string, unknown>) {
  return {
    sourceId: "copernicus-flood",
    floodScenarioContext: context,
    caveats: ["Separate GloFAS forecast/model from GFM observed satellite extent.", "No evacuation order is generated."],
    evidenceRefs: [],
  };
}

export function buildCopernicusFloodRouteContext(context: Record<string, unknown>) {
  return {
    sourceId: "copernicus-flood",
    floodRouteContext: context,
    possibleImpactAreaOnly: true,
    officialRoadClosure: false,
    caveat: "Validate with local road authorities; ARGUS does not officially close routes.",
    evidenceRefs: [],
  };
}

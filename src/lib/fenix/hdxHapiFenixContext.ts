export function buildHdxHapiFenixContext(snapshot: Record<string, unknown>) {
  return {
    sourceId: "hdx-hapi",
    fenixContextType: "humanitarian_population_exposure",
    snapshot,
    caveats: ["Population and needs are contextual indicators, not exact live counts.", "Do not sum PIN sectors as unique people."],
    evidenceRefs: [],
  };
}

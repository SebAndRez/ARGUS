export function buildHdxHapiAuraContext(snapshot: Record<string, unknown>) {
  return {
    sourceId: "hdx-hapi",
    auraContextType: "humanitarian_health_context",
    snapshot,
    notClinicalSource: true,
    caveats: ["Humanitarian context only; not medical diagnosis or confirmed capacity.", "Operational presence is not guaranteed availability."],
    evidenceRefs: [],
  };
}

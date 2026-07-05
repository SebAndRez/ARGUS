export function buildHdxHapiNavContext(snapshot: Record<string, unknown>) {
  return {
    sourceId: "hdx-hapi",
    navContextType: "humanitarian_logistics_context",
    snapshot,
    routeAuthorityCaveat: "HAPI does not declare routes open/closed or assign convoys.",
    evidenceRefs: [],
  };
}

export function buildEcdcNavContext(context: Record<string, unknown>) {
  return {
    sourceId: "ecdc",
    travelHealthContext: context,
    noArgusTravelRestriction: true,
    caveat: "Use ECDC/WHO/local authority context; ARGUS does not close borders or routes.",
    evidenceRefs: [],
  };
}

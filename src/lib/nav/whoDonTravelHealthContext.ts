export function buildWhoDonNavContext(context: Record<string, unknown>) {
  return {
    sourceId: "who-don",
    travelHealthContext: context,
    noArgusTravelRestriction: true,
    caveat: "Display WHO advice and follow local authorities; ARGUS does not close routes or borders.",
    evidenceRefs: [],
  };
}

export function buildGdeltFenixNarrativeContext(context: Record<string, unknown>) {
  return {
    sourceId: "gdelt",
    crisisNarrativeContext: context,
    caveat: "Media narrative context only; does not confirm threats or damage.",
  };
}

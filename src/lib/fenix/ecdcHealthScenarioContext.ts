export function buildEcdcFenixContext(context: Record<string, unknown>) {
  return {
    sourceId: "ecdc",
    euHealthScenarioContext: context,
    caveat: "Scenario context based on ECDC public health reports, not a validated epidemiological model.",
    evidenceRefs: [],
  };
}

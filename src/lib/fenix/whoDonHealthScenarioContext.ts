export function buildWhoDonFenixContext(context: Record<string, unknown>) {
  return {
    sourceId: "who-don",
    healthScenarioContext: context,
    caveat: "Scenario context based on WHO DON, not a validated epidemiological model.",
    noRtOrR0Model: true,
    evidenceRefs: [],
  };
}

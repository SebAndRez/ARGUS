export function buildGdeltNavMediaContext(context: Record<string, unknown>) {
  return {
    sourceId: "gdelt",
    routeMediaContext: context,
    routeClosureConfirmed: false,
    caveat: "Media reports can inform review but do not close routes by themselves.",
  };
}

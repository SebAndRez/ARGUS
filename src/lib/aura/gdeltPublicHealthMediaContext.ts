export function buildGdeltAuraMediaContext(context: Record<string, unknown>) {
  return {
    sourceId: "gdelt",
    publicHealthMediaContext: context,
    mediaSignalOnly: true,
    notMedicalSource: true,
    caveats: ["GDELT is media signal only; cross-check WHO/ECDC/local authorities."],
  };
}

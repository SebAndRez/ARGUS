import { filterMapLayersForUserMode, isCandidateVisibleToCitizen } from "@/lib/source-governance/sourceVisibility";

export function runSourceVisibilityTest() {
  const citizenLayers = filterMapLayersForUserMode(undefined, "citizen");
  const commandLayers = filterMapLayersForUserMode(undefined, "command_center", { hasSelectedIncident: true });

  return {
    passed:
      !isCandidateVisibleToCitizen({ requiresReview: true }) &&
      !citizenLayers.some((layer) => layer.group === "osint_signals") &&
      commandLayers.some((layer) => layer.layerId === "gdelt-media-signals"),
  };
}

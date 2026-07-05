import { buildSourceIntelligencePlan } from "@/lib/source-router/sourceIntelligenceRouter";

export function runSourceIntelligenceRouterTest() {
  const blockedOsm = buildSourceIntelligencePlan({
    purpose: "infrastructure_context",
    sourceIds: ["osm-overpass"],
    userMode: "command_center",
  });
  const allowedOsm = buildSourceIntelligencePlan({
    purpose: "infrastructure_context",
    sourceIds: ["osm-overpass"],
    userMode: "command_center",
    context: { hasAoi: true },
  });

  return {
    passed:
      blockedOsm.blockedSources.some((source) => source.sourceId === "osm-overpass") &&
      allowedOsm.selectedSources.some((source) => source.sourceId === "osm-overpass"),
  };
}

import type { HydrologicalContext } from "@/types/hydrology";

export function buildUsgsWaterFenixContext(context: HydrologicalContext) {
  return {
    sourceId: "usgs-water",
    sourceName: "USGS Water Data",
    simulationContext: "flood_river_context",
    nearestStations: context.locations,
    measuredAt: context.latest.measuredAt,
    stalenessMinutes: context.stalenessMinutes,
    demoFloodParameters: {
      streamflow: context.latest.streamflow?.value ?? null,
      streamflowUnit: context.latest.streamflow?.unit,
      gageHeight: context.latest.gageHeight?.value ?? null,
      gageHeightUnit: context.latest.gageHeight?.unit,
      confidence: context.confidence,
    },
    evidenceRefs: context.evidenceRefs,
    caveats: [
      "ARGUS Fenix uses USGS Water as simulation context only.",
      "No official flood prediction or evacuation scenario is declared from this reading alone.",
    ],
  };
}

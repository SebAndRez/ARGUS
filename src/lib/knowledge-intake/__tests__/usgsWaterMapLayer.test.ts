import type { MapLayerState } from "@/components/map/MapLayerControls";

export function runUsgsWaterMapLayerTest() {
  const layer: Pick<MapLayerState, "usgsWaterConditions"> = {
    usgsWaterConditions: false,
  };
  const metadata = {
    sourceId: "usgs-water",
    layerType: "hydrological_context",
    isIncidentLayer: false,
    defaultVisible: false,
    parameters: ["00060", "00065"],
  };
  return {
    passed:
      layer.usgsWaterConditions === false &&
      metadata.sourceId === "usgs-water" &&
      metadata.layerType === "hydrological_context" &&
      metadata.isIncidentLayer === false &&
      metadata.defaultVisible === false &&
      metadata.parameters.includes("00060") &&
      metadata.parameters.includes("00065"),
    layer,
    metadata,
  };
}

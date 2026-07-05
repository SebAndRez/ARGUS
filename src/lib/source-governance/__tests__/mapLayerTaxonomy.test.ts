import { getAllMapLayerPolicies } from "@/lib/source-governance/mapLayerRegistry";

export function runMapLayerTaxonomyTest() {
  const layers = getAllMapLayerPolicies();
  return {
    passed:
      layers.some((layer) => layer.group === "live_incidents" && layer.defaultVisibleCitizen) &&
      layers.some((layer) => layer.group === "osint_signals" && !layer.defaultVisibleCitizen) &&
      layers.some((layer) => layer.group === "historical_memory") &&
      layers.some((layer) => layer.visibleInModes.includes("fenix")) &&
      layers.some((layer) => layer.visibleInModes.includes("nav")) &&
      layers.some((layer) => layer.visibleInModes.includes("aura")),
  };
}

import { explainRunAllBlockedSources, getDefaultRunAllSources } from "@/lib/source-governance/runAllPolicy";

export function runRunAllPolicyTest() {
  const defaults = getDefaultRunAllSources();
  const blocked = explainRunAllBlockedSources(["gdelt", "osm-overpass", "noaa-ncei-tsunami"], { includeMediaSignals: true });

  return {
    passed:
      defaults.includes("usgs-earthquake") &&
      defaults.includes("gdacs") &&
      !defaults.includes("gdelt") &&
      !defaults.includes("osm-overpass") &&
      blocked.some((item) => item.sourceId === "gdelt") &&
      blocked.some((item) => item.sourceId === "osm-overpass") &&
      blocked.some((item) => item.sourceId === "noaa-ncei-tsunami"),
  };
}

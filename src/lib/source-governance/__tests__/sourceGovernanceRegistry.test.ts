import {
  canSourceCreateIncident,
  getSourceGovernancePolicy,
} from "@/lib/source-governance/sourceGovernanceRegistry";

export function runSourceGovernanceRegistryTest() {
  return {
    passed:
      canSourceCreateIncident("usgs-earthquake") &&
      canSourceCreateIncident("gdacs") &&
      canSourceCreateIncident("noaa-tsunami") &&
      getSourceGovernancePolicy("gdelt")?.canCreateIncident === false &&
      getSourceGovernancePolicy("osm-overpass")?.canCreateIncident === false &&
      getSourceGovernancePolicy("hdx-hapi")?.canCreateIncident === false &&
      getSourceGovernancePolicy("noaa-ncei-tsunami")?.sourceRole === "historical_memory",
  };
}

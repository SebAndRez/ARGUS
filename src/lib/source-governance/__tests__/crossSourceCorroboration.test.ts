import { getCorroborationLevel } from "@/lib/source-governance/crossSourceCorroboration";

export function runCrossSourceCorroborationTest() {
  return {
    passed:
      getCorroborationLevel([{ sourceId: "gdelt" }]) === "media_only" &&
      getCorroborationLevel([{ sourceId: "copernicus-glofas" }]) === "forecast_only" &&
      getCorroborationLevel([{ sourceId: "noaa-tsunami" }, { sourceId: "noaa-coops" }]) === "official_plus_observed" &&
      getCorroborationLevel([{ sourceId: "gdelt", validatedByAdmin: true }]) === "admin_validated",
  };
}

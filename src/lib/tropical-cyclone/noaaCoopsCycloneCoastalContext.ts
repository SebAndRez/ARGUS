import { fetchAndBuildCoopsContext, type NoaaCoopsRequestParams } from "@/lib/knowledge-intake/adapters/noaaCoopsAdapter";

export async function buildNoaaCoopsCycloneCoastalContext(params: Pick<NoaaCoopsRequestParams, "stationId" | "lat" | "lon" | "bbox" | "radiusKm" | "incidentId" | "persist">) {
  const result = await fetchAndBuildCoopsContext({
    ...params,
    purpose: "hurricane_context",
    products: ["water_level", "predictions", "wind", "air_pressure"],
    datum: "MLLW",
    units: "metric",
    timeZone: "gmt",
  });
  return {
    ...result,
    caveats: [
      "NOAA CO-OPS coastal observations do not infer official storm surge by themselves.",
      "Use NHC/CPHC and local authorities for official cyclone, storm surge, watch/warning and evacuation products.",
      "Do not close routes or ports from CO-OPS readings alone.",
    ],
  };
}

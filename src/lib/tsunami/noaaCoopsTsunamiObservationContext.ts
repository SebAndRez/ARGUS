import { fetchAndBuildCoopsContext, type NoaaCoopsRequestParams } from "@/lib/knowledge-intake/adapters/noaaCoopsAdapter";

export async function buildNoaaCoopsTsunamiObservationContext(params: Pick<NoaaCoopsRequestParams, "stationId" | "lat" | "lon" | "bbox" | "radiusKm" | "incidentId" | "persist">) {
  const result = await fetchAndBuildCoopsContext({
    ...params,
    purpose: "tsunami_context",
    products: ["water_level", "predictions", "wind", "air_pressure"],
    datum: "MLLW",
    units: "metric",
    timeZone: "gmt",
  });
  return {
    ...result,
    caveats: [
      "NOAA CO-OPS does not confirm tsunami from an isolated water-level reading.",
      "Use official NOAA Tsunami Warning Center messages for live threat and public protective action.",
      "Do not invent tsunami height or causal relation unless present in official source data.",
    ],
  };
}

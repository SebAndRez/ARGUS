import { fetchAndBuildIocSlsmfContext, type IocSlsmfRequestParams } from "@/lib/knowledge-intake/adapters/iocSlsmfAdapter";

export async function buildIocSeaLevelTsunamiContext(params: Pick<IocSlsmfRequestParams, "stationCode" | "lat" | "lon" | "bbox" | "radiusKm" | "incidentId" | "persist" | "minutes">) {
  const result = await fetchAndBuildIocSlsmfContext({
    ...params,
    purpose: "tsunami_context",
    includeStations: true,
    includeMetadata: true,
    includeSensors: true,
    includeRecentData: true,
  });
  return {
    ...result,
    caveats: [
      "IOC SLSMF sea level context does not confirm tsunami from an isolated reading.",
      "Use official tsunami warning centers and local authorities for live threat and public protective action.",
      "Do not invent tsunami height or causal relation unless present in official source data.",
    ],
  };
}

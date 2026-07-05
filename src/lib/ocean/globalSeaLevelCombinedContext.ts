import type { CoastalObservationContext } from "@/types/coastalObservation";
import type { SeaLevelObservationContext } from "@/types/seaLevelObservation";

export function buildGlobalSeaLevelCombinedContext(input: {
  noaaCoops?: CoastalObservationContext | null;
  ndbc?: unknown;
  iocSlsmf?: SeaLevelObservationContext | null;
}) {
  return {
    contextType: "global_ocean_coastal_observation_context",
    coastalTideHarborObservation: input.noaaCoops ?? null,
    offshoreMarineBuoyObservation: input.ndbc ?? null,
    globalTideGaugeRelativeSeaLevelObservation: input.iocSlsmf ?? null,
    caveats: [
      "CO-OPS, NDBC and IOC SLSMF observations must remain separated by observation type and authority.",
      "This combined context is not an automatic alert, route closure, evacuation order or tsunami confirmation.",
      "IOC SLSMF values are relative unless station-specific datum is available.",
    ],
  };
}

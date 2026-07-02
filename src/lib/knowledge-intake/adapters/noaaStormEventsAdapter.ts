import { plannedAdapterResult } from "@/lib/knowledge-intake/adapters/adapterTypes";

export function noaaStormEventsAdapter() {
  return plannedAdapterResult("noaa_storm_events", "noaaStormEventsAdapter");
}

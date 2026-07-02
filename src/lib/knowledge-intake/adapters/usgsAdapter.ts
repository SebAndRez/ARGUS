import { plannedAdapterResult } from "@/lib/knowledge-intake/adapters/adapterTypes";

export function usgsAdapter() {
  return plannedAdapterResult("usgs_earthquake", "usgsAdapter");
}

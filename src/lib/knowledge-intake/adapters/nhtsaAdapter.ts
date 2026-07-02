import { plannedAdapterResult } from "@/lib/knowledge-intake/adapters/adapterTypes";

export function nhtsaAdapter() {
  return plannedAdapterResult("nhtsa_fars_crss", "nhtsaAdapter");
}

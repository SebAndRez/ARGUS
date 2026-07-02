import { plannedAdapterResult } from "@/lib/knowledge-intake/adapters/adapterTypes";

export function iaeaAdapter() {
  return plannedAdapterResult("iaea_accidents", "iaeaAdapter");
}

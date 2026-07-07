import { VESTA_CATEGORY_ORDER } from "@/modules/vesta/data";
import type { VestaChecklistCategory, VestaThreatType } from "@/modules/vesta/types";

/**
 * Motor de riesgo real de ARGUS (comercialmente "TALOS"/"ORÁCULO") todavía no
 * expone una función de "riesgo local por lat/lng" reutilizable fuera del
 * análisis evento-por-evento. Esta capa (client-safe, sin dependencias de
 * servidor) solo prioriza categorías dado un set de amenazas relevantes; la
 * inferencia de amenazas cercanas a partir de `ExternalEvent` reales vive en
 * `vestaTalosServerBridge.ts` (server-only, usa Prisma).
 */
const CATEGORY_PRIORITY_BY_THREAT: Partial<Record<VestaThreatType, VestaChecklistCategory[]>> = {
  earthquake: ["water_food", "first_aid", "documents", "power_comms", "tools"],
  tsunami: ["documents", "money_keys", "power_comms", "water_food"],
  wildfire: ["documents", "clothing", "power_comms", "water_food"],
  flood: ["documents", "money_keys", "hygiene", "tools"],
  power_outage: ["power_comms", "medications", "water_food"],
  medical_emergency: ["medications", "first_aid", "elderly_dependents"],
  general_evacuation: ["documents", "water_food", "money_keys"],
};

export function prioritizeVestaCategories(riskContexts: VestaThreatType[]): VestaChecklistCategory[] {
  if (riskContexts.length === 0) return VESTA_CATEGORY_ORDER;

  const priority: VestaChecklistCategory[] = [];
  for (const threat of riskContexts) {
    for (const category of CATEGORY_PRIORITY_BY_THREAT[threat] ?? []) {
      if (!priority.includes(category)) priority.push(category);
    }
  }
  for (const category of VESTA_CATEGORY_ORDER) {
    if (!priority.includes(category)) priority.push(category);
  }
  return priority;
}

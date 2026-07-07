import { VESTA_CATEGORY_ORDER } from "@/modules/vesta/data";
import type {
  VestaCategoryProgress,
  VestaChecklistItem,
  VestaChecklistStatus,
} from "@/modules/vesta/types";

/**
 * Peso de cada estado hacia el porcentaje de preparación. "notApplicable" no
 * cuenta ni en el numerador ni en el denominador (ej. un usuario sin
 * mascotas no debe ver penalizada su categoría "Mascotas").
 */
const STATUS_WEIGHT: Record<VestaChecklistStatus, number> = {
  ready: 1,
  expiresSoon: 0.5,
  review: 0.5,
  pending: 0,
  notApplicable: 0,
};

export function calculateVestaCategoryProgress(
  items: VestaChecklistItem[]
): VestaCategoryProgress[] {
  return VESTA_CATEGORY_ORDER.map((category) => {
    const categoryItems = items.filter(
      (item) => item.category === category && item.status !== "notApplicable"
    );
    const ready = categoryItems.filter((item) => item.status === "ready").length;
    const weighted = categoryItems.reduce((sum, item) => sum + STATUS_WEIGHT[item.status], 0);
    const percentage = categoryItems.length
      ? Math.round((weighted / categoryItems.length) * 100)
      : 0;

    return { category, total: categoryItems.length, ready, percentage };
  });
}

export function calculateVestaOverallPercentage(items: VestaChecklistItem[]) {
  const applicable = items.filter((item) => item.status !== "notApplicable");
  if (applicable.length === 0) return 0;
  const weighted = applicable.reduce((sum, item) => sum + STATUS_WEIGHT[item.status], 0);
  return Math.round((weighted / applicable.length) * 100);
}

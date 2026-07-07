import { VESTA_CATEGORY_LABELS } from "@/modules/vesta/data";
import type { VestaCategoryProgress } from "@/modules/vesta/types";

export default function VestaCategoryGrid({ categories }: { categories: VestaCategoryProgress[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((category) => (
        <div key={category.category} className="border border-white/10 bg-white/[0.035] p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-white">{VESTA_CATEGORY_LABELS[category.category]}</p>
            <span className="text-xs font-bold text-emerald-300">{category.percentage}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full bg-white/10">
            <div
              className="h-1.5 bg-emerald-400/70"
              style={{ width: `${category.percentage}%` }}
            />
          </div>
          <p className="mt-1 text-[0.65rem] text-slate-500">
            {category.ready}/{category.total} listos
          </p>
        </div>
      ))}
    </div>
  );
}

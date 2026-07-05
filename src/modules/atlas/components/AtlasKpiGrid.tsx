import type { AtlasKpi } from "@/modules/atlas/types";
import { atlasSeverityTone } from "@/modules/atlas/utils";

interface Props {
  kpis: AtlasKpi[];
}

const trendGlyph: Record<NonNullable<AtlasKpi["trend"]>, string> = {
  up: "▲",
  down: "▼",
  stable: "—",
};

export default function AtlasKpiGrid({ kpis }: Props) {
  return (
    <section
      className="grid gap-3 px-4 py-4 sm:px-6 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7"
      aria-label="Indicadores operacionales ATLAS"
    >
      {kpis.map((kpi) => (
        <div
          key={kpi.id}
          className={`border p-3 shadow-lg shadow-black/20 ${atlasSeverityTone[kpi.severity]}`}
        >
          <p className="text-[0.6rem] font-bold uppercase tracking-[0.14em] opacity-80">
            {kpi.label}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xl font-bold text-white">
            {kpi.value}
            {kpi.trend && <span className="text-xs opacity-70">{trendGlyph[kpi.trend]}</span>}
          </p>
          {kpi.helperText && <p className="mt-1 text-[0.65rem] opacity-70">{kpi.helperText}</p>}
        </div>
      ))}
    </section>
  );
}

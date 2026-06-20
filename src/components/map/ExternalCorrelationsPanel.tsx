"use client";

import type { ArgusCorrelatedIncident } from "@/types/correlation";
import type {
  ArgusExternalSourceId,
  ArgusNormalizedEvent,
} from "@/types/ingestion";

interface Props {
  correlations: ArgusCorrelatedIncident[];
  onSelectEvent?: (event: ArgusNormalizedEvent) => void;
}

const sourceLabels: Partial<Record<ArgusExternalSourceId, string>> = {
  usgs_earthquake: "USGS",
  gdacs: "GDACS",
  noaa_tsunami: "NOAA",
};

export default function ExternalCorrelationsPanel({
  correlations,
  onSelectEvent,
}: Props) {
  if (correlations.length === 0) return null;

  return (
    <section className="mt-4 border-t border-white/10 pt-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-cyan-300/80">
            Correlaciones ARGUS
          </p>
          <p className="mt-1 text-[0.6rem] text-slate-500">
            Posibles relaciones entre fuentes
          </p>
        </div>
        <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2 py-1 font-mono text-[0.6rem] font-bold text-cyan-200">
          {correlations.length}
        </span>
      </div>

      <div className="mt-2 grid gap-2">
        {correlations.slice(0, 3).map((correlation) => {
          const sourceSummary = correlation.sourceIds
            .map((sourceId) => sourceLabels[sourceId] ?? sourceId)
            .join(" + ");

          return (
            <button
              key={correlation.id}
              type="button"
              onClick={() => onSelectEvent?.(correlation.primaryEvent)}
              className="border border-white/8 bg-slate-900/65 px-3 py-2.5 text-left transition hover:border-cyan-300/25 hover:bg-cyan-400/8"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-[0.6rem] font-bold uppercase text-cyan-200">
                  {sourceSummary}
                </span>
                <span className="shrink-0 font-mono text-[0.6rem] font-bold text-emerald-300">
                  {correlation.confidence}%
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs font-semibold leading-4 text-slate-100">
                {correlation.title}
              </p>
              <p className="mt-1 text-[0.58rem] text-slate-500">
                {correlation.createdAtLabel}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

import type { AtlasSourceSummary } from "@/modules/atlas/types";

interface Props {
  summary: AtlasSourceSummary;
}

export default function AtlasSourcePanel({ summary }: Props) {
  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cyan-300">Fuentes</h2>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-300">
        <div>
          <dt className="text-[0.6rem] uppercase text-slate-500">Activas</dt>
          <dd className="font-semibold text-emerald-200">{summary.activeCount}</dd>
        </div>
        <div>
          <dt className="text-[0.6rem] uppercase text-slate-500">Con error</dt>
          <dd className="font-semibold text-amber-200">{summary.errorCount}</dd>
        </div>
      </dl>
      <p className="mt-2 text-[0.65rem] text-slate-500">Última actualización: {summary.lastUpdatedLabel}</p>
      <p className="text-[0.65rem] text-slate-500">{summary.averageConfidenceLabel}</p>
      <p className="text-[0.65rem] text-slate-500">
        Contradicciones detectadas: {summary.contradictionCount}
      </p>
      <p className="mt-3 text-[0.65rem] leading-4 text-slate-500">
        La fusión avanzada de evidencia será provista por ARGUS ORÁCULO.
      </p>
    </section>
  );
}

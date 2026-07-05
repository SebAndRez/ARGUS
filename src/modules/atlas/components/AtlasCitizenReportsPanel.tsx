import type { AtlasCitizenReportsSummary } from "@/modules/atlas/types";

interface Props {
  summary: AtlasCitizenReportsSummary;
}

export default function AtlasCitizenReportsPanel({ summary }: Props) {
  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cyan-300">
        Reportes ciudadanos
      </h2>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-300">
        <div>
          <dt className="text-[0.6rem] uppercase text-slate-500">Nuevos</dt>
          <dd className="font-semibold text-white">{summary.newCount}</dd>
        </div>
        <div>
          <dt className="text-[0.6rem] uppercase text-slate-500">Pendientes</dt>
          <dd className="font-semibold text-amber-200">{summary.pendingValidationCount}</dd>
        </div>
        <div>
          <dt className="text-[0.6rem] uppercase text-slate-500">Confirmados</dt>
          <dd className="font-semibold text-emerald-200">{summary.confirmedCount}</dd>
        </div>
        <div>
          <dt className="text-[0.6rem] uppercase text-slate-500">Descartados</dt>
          <dd className="font-semibold text-slate-400">{summary.discardedCount}</dd>
        </div>
      </dl>
      <p className="mt-2 text-[0.65rem] text-slate-500">
        {summary.highReputationReporters} reportante(s) de alta reputación
      </p>
      <p className="mt-3 text-[0.65rem] leading-4 text-slate-500">
        La gestión avanzada de reportes será provista por ARGUS VIGÍA.
      </p>
    </section>
  );
}

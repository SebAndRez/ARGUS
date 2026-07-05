interface Props {
  isDemoData: boolean;
  criticalCount: number;
  onNewReport: () => void;
  canCreateReport: boolean;
}

export default function VigiaHeader({ isDemoData, criticalCount, onNewReport, canCreateReport }: Props) {
  return (
    <header className="border-b border-white/10 bg-slate-950/95 px-4 py-4 backdrop-blur-xl sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.28em] text-cyan-300">
            Reportes ciudadanos verificados
          </p>
          <h1 className="mt-1 text-2xl font-bold uppercase tracking-[0.06em] text-white">
            ARGUS VIGÍA
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em] ${
              criticalCount > 0
                ? "border-red-400/40 bg-red-500/12 text-red-100"
                : "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
            }`}
          >
            {criticalCount > 0 ? `${criticalCount} crítico(s)` : "Sin críticos"}
          </span>
          {isDemoData && (
            <span className="inline-flex items-center border border-amber-300/30 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-100">
              Datos demo
            </span>
          )}
          <button
            type="button"
            onClick={onNewReport}
            disabled={!canCreateReport}
            className="inline-flex items-center border border-cyan-300/30 bg-cyan-400/12 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em] text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
            title={canCreateReport ? undefined : "Tu cuenta no puede crear reportes normales en este momento"}
          >
            + Nuevo reporte
          </button>
          <a
            href="/app"
            className="inline-flex items-center border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-cyan-300/30 hover:text-cyan-100"
          >
            Ver mapa
          </a>
          <a
            href="/modules"
            className="inline-flex items-center border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-cyan-300/30 hover:text-cyan-100"
          >
            ← Módulos
          </a>
        </div>
      </div>
    </header>
  );
}

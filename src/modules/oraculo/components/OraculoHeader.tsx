interface Props {
  isDemoData: boolean;
  contradictionCount: number;
  userRole: string;
}

export default function OraculoHeader({ isDemoData, contradictionCount, userRole }: Props) {
  return (
    <header className="border-b border-white/10 bg-slate-950/95 px-4 py-4 backdrop-blur-xl sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.28em] text-violet-300">
            Evidencia, fuentes y confiabilidad operacional
          </p>
          <h1 className="mt-1 text-2xl font-bold uppercase tracking-[0.06em] text-white">
            ARGUS ORÁCULO
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center border border-violet-300/25 bg-violet-400/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em] text-violet-100">
            Analítico / Institucional
          </span>
          <span
            className={`inline-flex items-center border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em] ${
              contradictionCount > 0
                ? "border-amber-300/35 bg-amber-400/10 text-amber-100"
                : "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
            }`}
          >
            {contradictionCount > 0 ? `${contradictionCount} contradicción(es)` : "Sin contradicciones"}
          </span>
          {isDemoData && (
            <span className="inline-flex items-center border border-amber-300/30 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-100">
              Modo demo / datos de prueba
            </span>
          )}
          <span className="inline-flex items-center border border-cyan-300/25 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-100">
            Rol: {userRole}
          </span>
          <a
            href="/modules"
            className="inline-flex items-center border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-violet-300/30 hover:text-violet-100"
          >
            ← Módulos
          </a>
        </div>
      </div>
    </header>
  );
}

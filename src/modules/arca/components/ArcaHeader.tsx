import type { ModuleMaturity } from "@/types/argusModule";
import ModuleMaturityBadge from "@/components/modules/ModuleMaturityBadge";

interface Props {
  isDemoData: boolean;
  saturatedCount: number;
  userRole: string;
  maturity?: ModuleMaturity;
}

export default function ArcaHeader({ isDemoData, saturatedCount, userRole, maturity }: Props) {
  return (
    <header className="border-b border-white/10 bg-slate-950/95 px-4 py-4 backdrop-blur-xl sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.28em] text-emerald-300">
            Refugios, zonas seguras y capacidad operacional
          </p>
          <h1 className="mt-1 text-2xl font-bold uppercase tracking-[0.06em] text-white">ARGUS ARCA</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center border border-emerald-300/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em] text-emerald-100">
            Público / Institucional
          </span>
          <span
            className={`inline-flex items-center border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em] ${
              saturatedCount > 0
                ? "border-orange-400/35 bg-orange-500/12 text-orange-100"
                : "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
            }`}
          >
            {saturatedCount > 0 ? `${saturatedCount} refugio(s) saturado(s)` : "Sin refugios saturados"}
          </span>
          {maturity && <ModuleMaturityBadge maturity={maturity} />}
          {isDemoData && (
            <span className="inline-flex items-center border border-amber-300/30 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-100">
              Refugios de prueba
            </span>
          )}
          <span className="inline-flex items-center border border-cyan-300/25 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-100">
            Rol: {userRole}
          </span>
          <a
            href="/modules"
            className="inline-flex items-center border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-emerald-300/30 hover:text-emerald-100"
          >
            ← Módulos
          </a>
        </div>
      </div>
    </header>
  );
}

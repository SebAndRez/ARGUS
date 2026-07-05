import type { AtlasModuleStatus } from "@/modules/atlas/types";

const statusTone: Record<AtlasModuleStatus["status"], string> = {
  active: "border-emerald-300/30 bg-emerald-400/10 text-emerald-100",
  available: "border-cyan-300/25 bg-cyan-400/8 text-cyan-100",
  restricted: "border-white/10 bg-white/[0.02] text-slate-500",
  pending: "border-slate-500/25 bg-slate-500/8 text-slate-300",
  recommended: "border-amber-300/35 bg-amber-400/12 text-amber-100",
  offline: "border-red-400/25 bg-red-500/8 text-red-200",
};

const statusLabel: Record<AtlasModuleStatus["status"], string> = {
  active: "Activo",
  available: "Disponible",
  restricted: "Restringido",
  pending: "Pendiente",
  recommended: "Recomendado",
  offline: "No disponible",
};

interface Props {
  modules: AtlasModuleStatus[];
}

export default function AtlasModuleStatusGrid({ modules }: Props) {
  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cyan-300">
        Módulos ARGUS
      </h2>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {modules.map((module) => (
          <div
            key={module.moduleId}
            title={module.reason}
            className={`border px-2 py-1.5 text-[0.62rem] font-bold uppercase tracking-[0.04em] ${statusTone[module.status]}`}
          >
            <p>{module.name}</p>
            <p className="mt-0.5 font-normal normal-case tracking-normal opacity-80">
              {statusLabel[module.status]}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

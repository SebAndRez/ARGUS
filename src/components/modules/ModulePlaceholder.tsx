import type { ArgusModuleDefinition } from "@/types/argusModule";
import ModuleBadge from "@/components/modules/ModuleBadge";
import ModuleIcon from "@/components/modules/ModuleIcon";
import ModuleMaturityBadge from "@/components/modules/ModuleMaturityBadge";

const statusLabel: Record<ArgusModuleDefinition["status"], string> = {
  active: "Activo",
  beta: "Beta",
  coming_soon: "Próximamente",
  institutional: "Institucional",
  paid: "Pago",
  restricted: "Restringido",
  internal: "Motor interno",
};

interface Props {
  module: ArgusModuleDefinition;
}

/**
 * Página base profesional compartida por todos los módulos ARGUS. Solo
 * presenta metadata y "capacidades previstas" — no implementa lógica
 * funcional real del módulo (eso queda para la siguiente fase, uno por uno).
 */
export default function ModulePlaceholder({ module }: Props) {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white sm:px-8">
      <div className="mx-auto max-w-3xl">
        <a
          href="/modules"
          className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-300 hover:text-cyan-200"
        >
          ← Volver a módulos
        </a>

        <header className="mt-4 flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center border border-white/10 bg-white/[0.03] text-cyan-200">
              <ModuleIcon icon={module.icon} className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold uppercase tracking-[0.08em]">{module.name}</h1>
              <p className="mt-1 max-w-xl text-sm text-slate-400">{module.description}</p>
            </div>
          </div>
          <ModuleBadge label={module.badgeLabel} variant={module.badgeVariant} />
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="border border-white/10 bg-slate-900/60 p-4">
            <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cyan-300">
              Capacidades previstas
            </h2>
            <ul className="mt-3 grid gap-2 text-sm text-slate-300">
              {module.capabilitiesPreview.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-cyan-400">-</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="border border-white/10 bg-slate-900/60 p-4">
            <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cyan-300">
              Integraciones futuras
            </h2>
            <ul className="mt-3 grid gap-2 text-sm text-slate-300">
              {module.futureIntegrations.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-cyan-400">-</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-4 border border-white/10 bg-slate-900/40 p-4">
          <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cyan-300">
            Estado del módulo
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            {statusLabel[module.status]}. Base modular creada. Pendiente
            implementación funcional completa.
          </p>
          {module.maturity && (
            <div className="mt-3 flex flex-wrap items-start gap-3">
              <ModuleMaturityBadge maturity={module.maturity} />
              {module.maturityNotes && module.maturityNotes.length > 0 && (
                <ul className="grid gap-1 text-[0.7rem] text-slate-400">
                  {module.maturityNotes.map((note) => (
                    <li key={note} className="flex gap-2">
                      <span className="text-cyan-400">-</span>
                      {note}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <dl className="mt-3 grid grid-cols-2 gap-2 text-[0.7rem] text-slate-500 sm:grid-cols-4">
            <div>
              <dt className="uppercase tracking-[0.1em]">Categoría</dt>
              <dd className="text-slate-300">{module.category}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-[0.1em]">Tipo de acceso</dt>
              <dd className="text-slate-300">{module.accessType}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-[0.1em]">Pago</dt>
              <dd className="text-slate-300">{module.isPaid ? "Sí" : "No"}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-[0.1em]">Auditado</dt>
              <dd className="text-slate-300">{module.requiresAudit ? "Sí" : "No"}</dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  );
}

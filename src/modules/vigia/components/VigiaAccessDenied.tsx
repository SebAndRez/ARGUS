import type { ArgusRole } from "@/types/rbac";

interface Props {
  userRole: ArgusRole;
  reason?: string;
}

/**
 * VIGÍA es público/base, así que esta pantalla solo debería aparecer en
 * casos extremos (módulo deshabilitado, cuenta suspendida a nivel de
 * plataforma, etc). No expone datos operativos ni de otros reportantes.
 */
export default function VigiaAccessDenied({ userRole, reason }: Props) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-white">
      <section className="w-full max-w-xl border border-red-400/25 bg-slate-950/90 p-6 shadow-2xl shadow-black/40">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.24em] text-red-300">
          ARGUS VIGÍA
        </p>
        <h1 className="mt-3 text-2xl font-bold text-white">Acceso no disponible</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          {reason ?? "Tu cuenta no puede acceder a VIGÍA en este momento."}
        </p>
        <p className="mt-2 text-xs text-slate-500">Rol actual detectado: {userRole}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="/modules"
            className="border border-cyan-300/30 bg-cyan-400/12 px-4 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-cyan-100"
          >
            Volver a módulos
          </a>
          <a
            href="/app"
            className="border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-slate-200"
          >
            Ir al mapa ciudadano
          </a>
        </div>
      </section>
    </main>
  );
}

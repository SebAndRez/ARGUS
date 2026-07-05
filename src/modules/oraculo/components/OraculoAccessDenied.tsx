import type { ArgusRole } from "@/types/rbac";

interface Props {
  userRole: ArgusRole;
  reason?: string;
}

/**
 * El usuario común no ve el panel analítico completo de ORÁCULO. En vez de
 * eso, ve un mensaje breve — las etiquetas simples ("Fuente confiable",
 * "Pendiente de confirmación", "Evidencia insuficiente") se muestran en el
 * contexto del evento (mapa/ATLAS/VIGÍA), no aquí, para no exponer el panel
 * analítico ni datos internos.
 */
export default function OraculoAccessDenied({ userRole, reason }: Props) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-white">
      <section className="w-full max-w-xl border border-violet-400/25 bg-slate-950/90 p-6 shadow-2xl shadow-black/40">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.24em] text-violet-300">
          ARGUS ORÁCULO · Analítico / Institucional
        </p>
        <h1 className="mt-3 text-2xl font-bold text-white">
          ORÁCULO requiere acceso analista o institucional
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          {reason ??
            "El panel de fusión de fuentes y evidencia está reservado para analistas, instituciones, respondedores de emergencia, admins y superadmins."}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Puedes seguir viendo etiquetas simples de confiabilidad (fuente confiable / pendiente de confirmación /
          evidencia insuficiente) directamente en el mapa y en los reportes.
        </p>
        <p className="mt-1 text-xs text-slate-500">Rol actual detectado: {userRole}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="/modules"
            className="border border-violet-300/30 bg-violet-400/12 px-4 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-violet-100"
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

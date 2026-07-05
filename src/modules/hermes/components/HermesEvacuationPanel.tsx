import type { HermesRoute } from "@/modules/hermes/types";
import { hermesRouteStatusLabel, hermesRouteStatusTone } from "@/modules/hermes/utils";

interface Props {
  evacuationRoutes: HermesRoute[];
}

/**
 * Panel de evacuación. No simula evacuación avanzada — solo muestra rutas
 * candidatas con su prioridad y qué otros módulos deberían activarse.
 */
export default function HermesEvacuationPanel({ evacuationRoutes }: Props) {
  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-teal-300">Panel de evacuación</h2>
      {evacuationRoutes.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          Sin rutas de evacuación calculadas. Selecciona el propósito &quot;Evacuación&quot; en el planificador.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {evacuationRoutes.map((route) => (
            <li key={route.id} className="border border-white/10 bg-white/[0.02] p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white">{route.name}</span>
                <span className={`border px-1.5 py-0.5 text-[0.55rem] font-bold uppercase ${hermesRouteStatusTone[route.status]}`}>
                  {hermesRouteStatusLabel[route.status]}
                </span>
              </div>
              <p className="mt-1 text-[0.62rem] text-slate-500">
                Prioridad {route.riskScore >= 60 ? "alta" : route.riskScore >= 30 ? "media" : "baja"}
              </p>
              <p className="mt-1 text-[0.6rem] text-teal-300/80">
                {route.riskScore >= 40 ? "Requiere revisión con ARGUS ARCA (refugios). " : ""}
                {route.riskScore >= 60 ? "Considerar seguimiento en ATLAS. " : ""}
                Simulación avanzada de evacuación disponible próximamente en ARGUS FÉNIX.
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

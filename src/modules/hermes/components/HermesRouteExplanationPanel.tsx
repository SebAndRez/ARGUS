import type { HermesRoute } from "@/modules/hermes/types";
import { formatHermesDistance, formatHermesDuration, hermesConfidenceLabel } from "@/modules/hermes/utils";

interface Props {
  route: HermesRoute | null;
}

export default function HermesRouteExplanationPanel({ route }: Props) {
  if (!route) {
    return (
      <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
        <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-teal-300">Explicación de ruta</h2>
        <p className="mt-2 text-xs text-slate-500">Selecciona una ruta para ver su explicación completa.</p>
      </section>
    );
  }

  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-teal-300">Explicación de ruta</h2>
      <p className="mt-2 text-sm font-semibold text-white">{route.name}</p>
      <p className="mt-2 text-xs leading-5 text-slate-300">{route.explanation}</p>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-[0.65rem] text-slate-400">
        <div>
          <dt className="uppercase text-slate-500">Distancia</dt>
          <dd className="text-slate-200">{formatHermesDistance(route.distanceMeters)}</dd>
        </div>
        <div>
          <dt className="uppercase text-slate-500">Duración estimada</dt>
          <dd className="text-slate-200">{formatHermesDuration(route.estimatedDurationSeconds)}</dd>
        </div>
        <div>
          <dt className="uppercase text-slate-500">Confianza</dt>
          <dd className="text-slate-200">{hermesConfidenceLabel[route.confidence]}</dd>
        </div>
        <div>
          <dt className="uppercase text-slate-500">Score</dt>
          <dd className="text-slate-200">{route.routeScore}/100</dd>
        </div>
      </dl>

      {route.warnings.length > 0 && (
        <div className="mt-3">
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.1em] text-amber-300">Advertencias</p>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-300">
            {route.warnings.map((warning) => (
              <li key={warning.id}>· {warning.message}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

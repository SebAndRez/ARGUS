import type { HermesRoute } from "@/modules/hermes/types";
import {
  formatHermesDistance,
  formatHermesDuration,
  hermesConfidenceLabel,
  hermesMobilityModeLabel,
  hermesPurposeLabel,
  hermesRouteStatusLabel,
  hermesRouteStatusTone,
} from "@/modules/hermes/utils";

interface Props {
  route: HermesRoute;
  onSelect?: (route: HermesRoute) => void;
}

export default function HermesRouteCard({ route, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(route)}
      className="w-full border border-white/10 bg-white/[0.02] p-3 text-left transition hover:border-teal-300/25 hover:bg-teal-400/5"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-white">{route.name}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          {route.isDemo && (
            <span className="border border-amber-300/30 bg-amber-400/10 px-1.5 py-0.5 text-[0.55rem] font-bold uppercase text-amber-200">
              Simulada
            </span>
          )}
          <span className={`border px-1.5 py-0.5 text-[0.55rem] font-bold uppercase ${hermesRouteStatusTone[route.status]}`}>
            {hermesRouteStatusLabel[route.status]}
          </span>
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        {hermesPurposeLabel[route.purpose]} · {hermesMobilityModeLabel[route.mobilityMode]}
      </p>
      <p className="mt-1 text-[0.65rem] text-slate-500">
        Score {route.routeScore}/100 · Seguridad {route.safetyScore} · Confianza {hermesConfidenceLabel[route.confidence]}
      </p>
      <p className="mt-1 text-[0.65rem] text-slate-500">
        {formatHermesDistance(route.distanceMeters)} · {formatHermesDuration(route.estimatedDurationSeconds)}
      </p>
      {route.warnings.length > 0 && (
        <p className="mt-1 text-[0.6rem] text-amber-300/80">{route.warnings.length} advertencia(s)</p>
      )}
    </button>
  );
}

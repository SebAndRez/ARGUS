import type { HermesBlockage, HermesRiskZone, HermesRoute } from "@/modules/hermes/types";
import { hermesRouteStatusLabel, hermesRouteStatusTone } from "@/modules/hermes/utils";

interface Props {
  selectedRoute: HermesRoute | null;
  blockages: HermesBlockage[];
  riskZones: HermesRiskZone[];
}

/**
 * Panel compacto de mapa: HERMES no duplica `OperationalMap` (evitar romper
 * SSR/rendimiento). Muestra un resumen de geometría + capas activas y un
 * acceso directo al mapa principal para visualización completa.
 */
export default function HermesRouteMapPanel({ selectedRoute, blockages, riskZones }: Props) {
  return (
    <section className="border border-white/10 bg-slate-950/70 p-3 shadow-2xl shadow-black/30">
      <header className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-teal-300">Vista operacional</p>
          <p className="text-xs text-slate-400">
            {blockages.length} bloqueo(s) · {riskZones.length} zona(s) de riesgo TALOS
          </p>
        </div>
        <a
          href="/app"
          className="border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-[0.1em] text-slate-300 hover:border-teal-300/30 hover:text-teal-100"
        >
          Ver mapa completo
        </a>
      </header>

      {selectedRoute ? (
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-white">{selectedRoute.name}</p>
            <span className={`border px-1.5 py-0.5 text-[0.55rem] font-bold uppercase ${hermesRouteStatusTone[selectedRoute.status]}`}>
              {hermesRouteStatusLabel[selectedRoute.status]}
            </span>
          </div>
          <ol className="mt-2 space-y-1 border-l border-white/10 pl-3 text-[0.68rem] text-slate-400">
            {selectedRoute.geometry.map((point, index) => (
              <li key={`${point.lat}-${point.lng}-${index}`} className="relative">
                <span className="absolute -left-[0.95rem] top-1 h-1.5 w-1.5 rounded-full bg-teal-400" />
                {index === 0 ? "Origen" : index === selectedRoute.geometry.length - 1 ? "Destino" : `Punto ${index}`}:{" "}
                {point.lat.toFixed(3)}, {point.lng.toFixed(3)}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="text-xs text-slate-500">Calcula una ruta para ver su geometría estimada aquí.</p>
      )}
    </section>
  );
}

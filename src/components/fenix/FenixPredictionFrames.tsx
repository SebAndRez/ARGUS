import type { FenixSimulationResult } from "@/types/fenixSimulation";

export default function FenixPredictionFrames({ result }: { result: FenixSimulationResult }) {
  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/85 p-5">
      <h3 className="text-sm font-semibold uppercase text-white">3 vistas de predicción</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {(result.predictionFrames ?? []).map((frame) => (
          <div key={String(frame.id)} className="rounded border border-white/10 bg-slate-900/70 p-3">
            <p className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-cyan-300">{String(frame.label)}</p>
            <p className="mt-2 text-lg font-semibold text-white">{String(frame.timeLabel)}</p>
            <div className="mt-3 grid gap-1 text-xs text-slate-400">
              <span>Radio: {String(frame.radiusKm)} km</span>
              <span>Población: {String(frame.populationExposure)}</span>
              <span>Rutas afectadas: {String(frame.routeImpacts)}</span>
              <span>Reportes: {String(frame.relatedReports)}</span>
              <span>Confianza: {String(frame.confidence)}%</span>
              <span>Incertidumbre: {String(frame.uncertainty)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}


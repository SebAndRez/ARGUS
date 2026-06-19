"use client";

import { getCardinalDirection, getWindToDeg } from "@/lib/riskProjection";
import type { RiskProjection, WeatherObservation } from "@/types/weatherRisk";

interface Props {
  observation: WeatherObservation | null;
  selectedProjection?: RiskProjection | null;
  visible: boolean;
}

export default function WindLayerLegend({
  observation,
  selectedProjection,
  visible,
}: Props) {
  if (!visible || !observation) return null;

  const windFromDeg = selectedProjection?.windFromDeg ?? observation.windFromDeg;
  const windFromLabel = selectedProjection?.windFromLabel ?? observation.windFromLabel;
  const windToLabel =
    selectedProjection?.windToLabel ?? getCardinalDirection(getWindToDeg(observation.windFromDeg));
  const windSpeedKmh = selectedProjection?.windSpeedKmh ?? observation.windSpeedKmh;
  const observedAtLabel = selectedProjection?.observedAtLabel ?? observation.observedAtLabel;
  const confidence = selectedProjection?.confidence ?? observation.confidence;

  return (
    <aside className="pointer-events-none fixed left-4 top-56 z-40 hidden w-72 border border-amber-300/20 bg-slate-950/90 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl md:block">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-amber-300/90">
            Clima y riesgo
          </p>
          <p className="mt-1 text-sm font-semibold text-white">Viento demo</p>
        </div>
        <span className="border border-amber-300/25 bg-amber-400/10 px-2 py-1 text-[0.6rem] font-bold text-amber-200">
          ESTIMACIÓN
        </span>
      </div>

      <div className="mt-4 grid grid-cols-[auto_1fr] items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex h-11 w-11 items-center justify-center border border-cyan-300/20 bg-cyan-400/10 text-xl font-semibold text-cyan-200"
          style={{ transform: `rotate(${windFromDeg + 180}deg)` }}
        >
          ↑
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-100">
            {windFromLabel} → {windToLabel} · {windSpeedKmh} km/h
          </p>
          <p className="mt-1 text-xs text-slate-400">{observedAtLabel}</p>
          <p className="mt-1 text-xs text-slate-500">Confianza {confidence}% · demo local</p>
        </div>
      </div>

      <p className="mt-4 border-t border-white/10 pt-3 text-[0.65rem] leading-4 text-slate-500">
        Zona estimada, no exacta. No reemplaza instrucciones oficiales.
      </p>
    </aside>
  );
}

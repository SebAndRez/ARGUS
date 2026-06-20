"use client";

import { getCardinalDirection, getWindToDeg } from "@/lib/riskProjection";
import type { RiskProjection, WeatherObservation } from "@/types/weatherRisk";

interface Props {
  observation: WeatherObservation | null;
  selectedProjection?: RiskProjection | null;
  visible: boolean;
  fallbackActive?: boolean;
  cached?: boolean;
  thermalEventCount?: number;
}

export default function WindLayerLegend({
  observation,
  selectedProjection,
  visible,
  fallbackActive = false,
  cached = false,
  thermalEventCount = 0,
}: Props) {
  if (!visible || !observation) return null;

  const isExternalForecast = observation.sourceType === "external_forecast";
  const windFromDeg = isExternalForecast
    ? observation.windFromDeg
    : selectedProjection?.windFromDeg ?? observation.windFromDeg;
  const windFromLabel = isExternalForecast
    ? observation.windFromLabel
    : selectedProjection?.windFromLabel ?? observation.windFromLabel;
  const windToLabel =
    (isExternalForecast ? observation.windToLabel : selectedProjection?.windToLabel) ??
    getCardinalDirection(getWindToDeg(observation.windFromDeg));
  const windSpeedKmh = isExternalForecast
    ? observation.windSpeedKmh
    : selectedProjection?.windSpeedKmh ?? observation.windSpeedKmh;
  const observedAtLabel = isExternalForecast
    ? observation.observedAtLabel
    : selectedProjection?.observedAtLabel ?? observation.observedAtLabel;
  const confidence = isExternalForecast
    ? observation.confidence
    : selectedProjection?.confidence ?? observation.confidence;

  return (
    <aside className="pointer-events-none fixed left-4 top-56 z-40 hidden w-72 border border-amber-300/20 bg-slate-950/90 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl md:block">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-amber-300/90">
            Clima y riesgo
          </p>
          <p className="mt-1 text-sm font-semibold text-white">
            {isExternalForecast ? "Viento MET Norway" : "Viento demo"}
          </p>
          <p className="mt-1 truncate text-[0.62rem] text-slate-500">
            {observation.sourceName}
          </p>
        </div>
        <span
          className={`shrink-0 border px-2 py-1 text-[0.58rem] font-bold ${
            isExternalForecast
              ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200"
              : "border-amber-300/25 bg-amber-400/10 text-amber-200"
          }`}
        >
          {isExternalForecast ? (cached ? "MET · CACHÉ" : "MET · REAL") : "FALLBACK"}
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
          <p className="mt-1 text-xs text-slate-500">
            Confianza {confidence}%{fallbackActive ? " · fallback local" : ""}
          </p>
        </div>
      </div>

      {(typeof observation.temperatureC === "number" ||
        typeof observation.humidityPct === "number" ||
        typeof observation.gustKmh === "number" ||
        typeof observation.pressureHpa === "number") && (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 text-[0.62rem] text-slate-400">
          {typeof observation.temperatureC === "number" && (
            <span>Temperatura {observation.temperatureC.toFixed(1)} °C</span>
          )}
          {typeof observation.humidityPct === "number" && (
            <span>Humedad {observation.humidityPct.toFixed(0)}%</span>
          )}
          {typeof observation.gustKmh === "number" && (
            <span>Ráfaga {observation.gustKmh.toFixed(1)} km/h</span>
          )}
          {typeof observation.pressureHpa === "number" && (
            <span>Presión {observation.pressureHpa.toFixed(0)} hPa</span>
          )}
        </div>
      )}

      <p className="mt-4 border-t border-white/10 pt-3 text-[0.65rem] leading-4 text-slate-500">
        El viento puede ser real; la zona de riesgo sigue siendo una estimación demo, no exacta.
      </p>
      {thermalEventCount > 0 && (
        <p className="mt-2 border border-orange-300/15 bg-orange-400/8 px-2.5 py-2 text-[0.62rem] leading-4 text-orange-100/80">
          {thermalEventCount} focos térmicos detectados; la proyección de humo sigue siendo estimada.
        </p>
      )}
    </aside>
  );
}

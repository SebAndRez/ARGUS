"use client";

import MapLegend from "@/components/map/MapLegend";
import type { BaseMapType } from "@/types/map";

export interface MapLayerState {
  reports: boolean;
  sos: boolean;
  alerts: boolean;
  critical: boolean;
  resolved: boolean;
  user: boolean;
  visualSources?: boolean;
  officialSources?: boolean;
  publicCameras?: boolean;
  weatherRisk?: boolean;
  terrestrialRoutes?: boolean;
  airRoutes?: boolean;
  maritimeRoutes?: boolean;
}

interface Props<TLayers extends MapLayerState> {
  layers: TLayers;
  onToggle: (key: keyof TLayers) => void;
  baseMapType?: BaseMapType;
  onBaseMapChange?: (type: BaseMapType) => void;
  showLegend?: boolean;
}

const layerGroups: Array<{
  label: string;
  keys: Array<keyof MapLayerState>;
}> = [
  {
    label: "Alertas y eventos",
    keys: ["reports", "sos", "alerts", "critical", "resolved"],
  },
  {
    label: "Fuentes y contexto",
    keys: ["visualSources", "officialSources", "publicCameras", "weatherRisk", "user"],
  },
  {
    label: "Rutas demo",
    keys: ["terrestrialRoutes", "airRoutes", "maritimeRoutes"],
  },
];

const labels: Record<keyof MapLayerState, string> = {
  reports: "Reportes",
  sos: "SOS",
  alerts: "Alertas",
  critical: "Críticos",
  resolved: "Resueltos",
  user: "Mi ubicación",
  visualSources: "Fuentes visuales",
  officialSources: "Fuentes oficiales",
  publicCameras: "Cámaras públicas",
  weatherRisk: "Clima y riesgo",
  terrestrialRoutes: "Rutas terrestres",
  airRoutes: "Rutas aéreas",
  maritimeRoutes: "Rutas marítimas",
};

const baseMapOptions: Array<{
  type: BaseMapType;
  label: string;
  disabled?: boolean;
}> = [
  { type: "tactical", label: "Táctico" },
  { type: "streets", label: "Calles" },
  { type: "light", label: "Claro" },
  { type: "satellite", label: "Satélite", disabled: true },
];

export default function MapLayerControls<TLayers extends MapLayerState>({
  layers,
  onToggle,
  baseMapType,
  onBaseMapChange,
  showLegend = true,
}: Props<TLayers>) {
  return (
    <div className="argus-tactical-panel max-h-[calc(100dvh-8.5rem)] overflow-y-auto border bg-slate-950/95 p-4 shadow-2xl shadow-black/35 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.24em] text-cyan-300/80">
            Mapa y capas
          </p>
          <p className="mt-1 text-sm font-semibold text-white">Control operacional</p>
        </div>
        <span className="border border-cyan-300/20 bg-cyan-400/8 px-2 py-1 text-[0.58rem] font-bold uppercase text-cyan-200">
          Demo
        </span>
      </div>

      {baseMapType && onBaseMapChange && (
        <section className="mt-4 border-t border-white/10 pt-3">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Tipo de mapa
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {baseMapOptions.map((option) => (
              <button
                key={option.type}
                type="button"
                disabled={option.disabled}
                onClick={() => onBaseMapChange(option.type)}
                className={`min-h-9 border px-2 py-2 text-xs font-semibold transition ${
                  option.disabled
                    ? "cursor-not-allowed border-white/5 bg-white/[0.02] text-slate-600"
                    : baseMapType === option.type
                      ? "border-cyan-300/35 bg-cyan-400/15 text-cyan-100"
                      : "border-white/10 bg-slate-900/65 text-slate-300 hover:border-white/20 hover:bg-slate-800"
                }`}
                title={option.disabled ? "Próximamente" : `Usar mapa ${option.label}`}
              >
                {option.label}
                {option.disabled && <span className="ml-1 text-[0.52rem] uppercase">Pronto</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {layerGroups.map((group) => {
        const availableKeys = group.keys.filter((key) =>
          Object.prototype.hasOwnProperty.call(layers, key)
        ) as Array<Extract<keyof TLayers, string>>;

        if (availableKeys.length === 0) return null;

        return (
          <section key={group.label} className="mt-4 border-t border-white/10 pt-3">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {group.label}
            </p>
            <div className="mt-2 grid gap-1.5">
              {availableKeys.map((key) => {
                const enabled = Boolean(layers[key]);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onToggle(key)}
                    className={`flex min-h-9 items-center justify-between border px-3 py-2 text-left text-xs transition ${
                      enabled
                        ? "border-cyan-400/20 bg-cyan-500/8 text-slate-100"
                        : "border-white/8 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]"
                    }`}
                    aria-label={`${labels[key as keyof MapLayerState]} ${enabled ? "ON" : "OFF"}`}
                  >
                    <span>{labels[key as keyof MapLayerState]}</span>
                    <span
                      className={`inline-flex h-5 min-w-8 items-center justify-center rounded-full border px-1.5 text-[0.55rem] font-bold ${
                        enabled
                          ? "border-cyan-300/30 bg-cyan-400/15 text-cyan-200"
                          : "border-white/10 bg-slate-950/70 text-slate-500"
                      }`}
                    >
                      {enabled ? "ON" : "OFF"}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {showLegend && <div className="mt-4"><MapLegend /></div>}
    </div>
  );
}

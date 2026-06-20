"use client";

import type { ReactNode } from "react";
import MapLegend from "@/components/map/MapLegend";
import DemoEventFilterControls from "@/components/map/DemoEventFilterControls";
import type { BaseMapType } from "@/types/map";
import type {
  DemoLifecycleFilter,
  DemoSeverityFilter,
  DemoTypeFilter,
} from "@/lib/demoEventFilters";

export interface MapLayerState {
  reports: boolean;
  demoReports?: boolean;
  usgsEarthquakes?: boolean;
  gdacsAlerts?: boolean;
  noaaTsunami?: boolean;
  nasaFirms?: boolean;
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

export type LayerDisplayStatus = "idle" | "loading" | "ready" | "error";

export interface LayerDisplayMeta {
  count?: number;
  detail?: string;
  status?: LayerDisplayStatus;
  emphasis?: boolean;
  disabled?: boolean;
  disabledLabel?: string;
}

interface Props<TLayers extends MapLayerState> {
  layers: TLayers;
  onToggle: (key: keyof TLayers) => void;
  baseMapType?: BaseMapType;
  onBaseMapChange?: (type: BaseMapType) => void;
  showLegend?: boolean;
  showActiveSummary?: boolean;
  layerMeta?: Partial<Record<keyof MapLayerState, LayerDisplayMeta>>;
  supplementalPanel?: ReactNode;
  demoFilters?: {
    severity: DemoSeverityFilter;
    type: DemoTypeFilter;
    lifecycle: DemoLifecycleFilter;
    onSeverityChange: (value: DemoSeverityFilter) => void;
    onTypeChange: (value: DemoTypeFilter) => void;
    onLifecycleChange: (value: DemoLifecycleFilter) => void;
    visibleCount: number;
    totalCount: number;
  };
}

const statusTextClasses: Record<LayerDisplayStatus, string> = {
  idle: "text-slate-500",
  loading: "text-amber-300",
  ready: "text-emerald-300",
  error: "text-red-300",
};

const layerGroups: Array<{
  label: string;
  keys: Array<keyof MapLayerState>;
}> = [
  {
    label: "Alertas y eventos",
    keys: [
      "reports",
      "demoReports",
      "usgsEarthquakes",
      "gdacsAlerts",
      "noaaTsunami",
      "nasaFirms",
      "sos",
      "alerts",
      "critical",
      "resolved",
    ],
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
  demoReports: "Reportes demo",
  usgsEarthquakes: "Sismos USGS",
  gdacsAlerts: "GDACS Desastres",
  noaaTsunami: "NOAA Tsunami",
  nasaFirms: "NASA FIRMS",
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
  showActiveSummary = false,
  layerMeta,
  supplementalPanel,
  demoFilters,
}: Props<TLayers>) {
  const currentBaseMapLabel = baseMapOptions.find(
    (option) => option.type === baseMapType
  )?.label;
  const routesActive = Boolean(
    layers.terrestrialRoutes || layers.airRoutes || layers.maritimeRoutes
  );
  const activeSummary = [
    {
      label: "Reportes demo",
      enabled: Boolean(layers.demoReports),
      available: Object.prototype.hasOwnProperty.call(layers, "demoReports"),
    },
    {
      label: "Fuentes",
      enabled: Boolean(layers.visualSources),
      available: Object.prototype.hasOwnProperty.call(layers, "visualSources"),
    },
    {
      label: "Rutas",
      enabled: routesActive,
      available: Object.prototype.hasOwnProperty.call(layers, "terrestrialRoutes"),
    },
    {
      label: "Clima / riesgo",
      enabled: Boolean(layers.weatherRisk),
      available: Object.prototype.hasOwnProperty.call(layers, "weatherRisk"),
    },
    {
      label: "Sismos USGS",
      enabled: Boolean(layers.usgsEarthquakes),
      available: Object.prototype.hasOwnProperty.call(layers, "usgsEarthquakes"),
    },
    {
      label: "GDACS",
      enabled: Boolean(layers.gdacsAlerts),
      available: Object.prototype.hasOwnProperty.call(layers, "gdacsAlerts"),
    },
    {
      label: "NOAA",
      enabled: Boolean(layers.noaaTsunami),
      available: Object.prototype.hasOwnProperty.call(layers, "noaaTsunami"),
    },
    {
      label: "FIRMS",
      enabled: Boolean(layers.nasaFirms),
      available: Object.prototype.hasOwnProperty.call(layers, "nasaFirms"),
    },
  ].filter((item) => item.available);

  return (
    <div className="argus-tactical-panel h-full max-h-full overflow-y-auto overscroll-contain border bg-slate-950/95 p-4 shadow-2xl shadow-black/35 backdrop-blur-xl">
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
          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Tipo de mapa
            </p>
            <span className="text-[0.6rem] font-semibold uppercase text-cyan-200">
              Actual: {currentBaseMapLabel}
            </span>
          </div>
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
                const meta = layerMeta?.[key as keyof MapLayerState];
                const emphasized = Boolean(meta?.emphasis && !enabled);
                const disabled = Boolean(meta?.disabled);
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={disabled}
                    onClick={() => onToggle(key)}
                    className={`flex min-h-11 items-center justify-between gap-3 border px-3 py-2 text-left text-xs transition ${
                      disabled
                        ? "cursor-not-allowed border-white/5 bg-white/[0.02] text-slate-600"
                        : enabled
                        ? "border-cyan-400/20 bg-cyan-500/8 text-slate-100"
                        : emphasized
                          ? "border-violet-300/30 bg-violet-500/10 text-violet-100 hover:bg-violet-500/15"
                          : "border-white/8 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]"
                    }`}
                    aria-label={`${labels[key as keyof MapLayerState]} ${enabled ? "ON" : "OFF"}`}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {labels[key as keyof MapLayerState]}
                      </span>
                      {meta?.detail && (
                        <span
                          className={`mt-0.5 block truncate text-[0.6rem] ${
                            statusTextClasses[meta.status ?? "idle"]
                          }`}
                        >
                          {meta.detail}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {typeof meta?.count === "number" && (
                        <span className="rounded-full border border-white/10 bg-slate-950/70 px-2 py-1 font-mono text-[0.58rem] text-slate-300">
                          {meta.count}
                        </span>
                      )}
                      <span
                        className={`inline-flex h-5 min-w-8 items-center justify-center rounded-full border px-1.5 text-[0.55rem] font-bold ${
                          disabled
                            ? "border-white/8 bg-slate-950/70 text-slate-600"
                            : enabled
                            ? "border-cyan-300/30 bg-cyan-400/15 text-cyan-200"
                            : "border-white/10 bg-slate-950/70 text-slate-500"
                        }`}
                      >
                        {disabled ? meta?.disabledLabel ?? "N/D" : enabled ? "ON" : "OFF"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {group.label === "Alertas y eventos" &&
              Boolean(layers.demoReports) &&
              demoFilters && <DemoEventFilterControls {...demoFilters} />}
          </section>
        );
      })}

      {showActiveSummary && (
        <section className="mt-4 border-t border-white/10 pt-3">
          <div className="flex items-center justify-between">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Capas activas
            </p>
            <span className="font-mono text-[0.6rem] text-cyan-200">
              {activeSummary.filter((item) => item.enabled).length}/{activeSummary.length}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {activeSummary.map((item) => (
              <div
                key={item.label}
                className="flex min-w-0 items-center justify-between gap-2 border border-white/8 bg-black/20 px-2 py-1.5"
              >
                <span className="truncate text-[0.6rem] text-slate-400">{item.label}</span>
                <span
                  className={`text-[0.55rem] font-bold ${
                    item.enabled ? "text-emerald-300" : "text-slate-600"
                  }`}
                >
                  {item.enabled ? "ON" : "OFF"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {supplementalPanel}

      {showLegend && <div className="mt-4"><MapLegend /></div>}
    </div>
  );
}

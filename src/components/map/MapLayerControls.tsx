"use client";

import type { ReactNode } from "react";
import ArgusMapLegend from "@/components/map/ArgusMapLegend";
import DemoEventFilterControls from "@/components/map/DemoEventFilterControls";
import ProductStatusLegend from "@/components/status/ProductStatusLegend";
import type { BaseMapType } from "@/types/map";
import type {
  DemoLifecycleFilter,
  DemoSeverityFilter,
  DemoTypeFilter,
} from "@/lib/demoEventFilters";
import {
  ALWAYS_ON_REALTIME_LAYERS,
  USER_SENSOR_LAYERS,
  OPTIONAL_CONTEXT_LAYERS,
  isAlwaysOnRealtimeLayer,
  isUserSensorLayer,
} from "@/lib/layers/layerPolicy";

export interface MapLayerState {
  reports: boolean;
  missingPersons?: boolean;
  demoReports?: boolean;
  usgsEarthquakes?: boolean;
  usgsShakeMapIntensity?: boolean;
  usgsPagerImpactAssessment?: boolean;
  gdacsAlerts?: boolean;
  noaaTsunami?: boolean;
  nasaFirms?: boolean;
  nasaEonet?: boolean;
  nwsWeatherAlerts?: boolean;
  openMeteoWeatherContext?: boolean;
  openAqAirQualityObservations?: boolean;
  usgsWaterConditions?: boolean;
  smithsonianGvpVolcanoes?: boolean;
  smithsonianGvpEruptionHistory?: boolean;
  smithsonianUsgsVolcanicActivityReports?: boolean;
  noaaCoopsCoastalObservations?: boolean;
  iocSeaLevelMonitoringStations?: boolean;
  noaaStormEventsHistorical?: boolean;
  noaaNceiHistoricalTsunamis?: boolean;
  openFemaDisasterDeclarations?: boolean;
  osmCriticalInfrastructure?: boolean;
  hdxHapiHumanitarianContext?: boolean;
  whoDiseaseOutbreakNews?: boolean;
  ecdcPublicHealthThreats?: boolean;
  gdeltMediaSignals?: boolean;
  copernicusGlofasFloodForecast?: boolean;
  copernicusGfmObservedFloodExtent?: boolean;
  reliefWeb?: boolean;
  sos: boolean;
  alerts: boolean;
  critical: boolean;
  resolved: boolean;
  user: boolean;
  visualSources?: boolean;
  officialSources?: boolean;
  publicCameras?: boolean;
  liveCameras?: boolean;
  medicalPoints?: boolean;
  shelters?: boolean;
  urbanPois?: boolean;
  quakeSense?: boolean;
  safetyChecks?: boolean;
  weatherRisk?: boolean;
  terrestrialRoutes?: boolean;
  airRoutes?: boolean;
  maritimeRoutes?: boolean;
  conflictZones?: boolean;
  conflictEvents?: boolean;
  territorialControl?: boolean;
  crisisNews?: boolean;
  confirmedDisasters?: boolean;
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
  onClose?: () => void;
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
  description?: string;
  keys: Array<keyof MapLayerState>;
}> = [
  {
    label: "Capas operativas en tiempo real",
    description: "ARGUS procesa estas fuentes de forma continua para seguridad y análisis.",
    keys: [...ALWAYS_ON_REALTIME_LAYERS] as Array<keyof MapLayerState>,
  },
  {
    label: "Sensores del dispositivo",
    description: "Requieren permiso explícito del usuario. Nunca se activan solos.",
    keys: [...USER_SENSOR_LAYERS] as Array<keyof MapLayerState>,
  },
  {
    label: "Capas contextuales",
    description: "Opcionales, controladas manualmente por el usuario.",
    keys: [...OPTIONAL_CONTEXT_LAYERS] as Array<keyof MapLayerState>,
  },
];

const labels: Record<keyof MapLayerState, string> = {
  reports: "Reportes",
  missingPersons: "Desaparecidos",
  demoReports: "Reportes demo",
  usgsEarthquakes: "Sismos USGS",
  usgsShakeMapIntensity: "USGS ShakeMap Intensity",
  usgsPagerImpactAssessment: "USGS PAGER Impact Assessment",
  gdacsAlerts: "GDACS Desastres",
  noaaTsunami: "NOAA Tsunami",
  nasaFirms: "NASA FIRMS",
  nasaEonet: "NASA EONET Natural Events",
  nwsWeatherAlerts: "NWS Weather Alerts",
  openMeteoWeatherContext: "Open-Meteo Weather Context",
  openAqAirQualityObservations: "OpenAQ Air Quality Observations",
  usgsWaterConditions: "USGS Water Conditions",
  smithsonianGvpVolcanoes: "Smithsonian GVP Volcanoes",
  smithsonianGvpEruptionHistory: "Smithsonian GVP Eruption History",
  smithsonianUsgsVolcanicActivityReports: "Smithsonian / USGS Volcanic Activity Reports",
  noaaCoopsCoastalObservations: "NOAA CO-OPS Coastal Observations",
  iocSeaLevelMonitoringStations: "IOC Sea Level Monitoring Stations",
  noaaStormEventsHistorical: "NOAA Storm Events Historical",
  noaaNceiHistoricalTsunamis: "NOAA NCEI Historical Tsunamis",
  openFemaDisasterDeclarations: "OpenFEMA Disaster Declarations",
  osmCriticalInfrastructure: "OpenStreetMap Critical Infrastructure",
  hdxHapiHumanitarianContext: "HDX HAPI Humanitarian Context",
  whoDiseaseOutbreakNews: "WHO Disease Outbreak News",
  ecdcPublicHealthThreats: "ECDC Public Health Threats",
  gdeltMediaSignals: "GDELT Media Signals",
  copernicusGlofasFloodForecast: "Copernicus GloFAS Flood Forecast",
  copernicusGfmObservedFloodExtent: "Copernicus GFM Observed Flood Extent",
  reliefWeb: "ReliefWeb Contexto",
  sos: "SOS",
  alerts: "Alertas",
  critical: "Críticos",
  resolved: "Resueltos",
  user: "Mi ubicación",
  visualSources: "Fuentes visuales",
  officialSources: "Fuentes oficiales",
  publicCameras: "Cámaras públicas",
  liveCameras: "Cámaras en vivo",
  medicalPoints: "Puntos médicos",
  shelters: "Refugios",
  urbanPois: "POIs urbanos (tiendas, paraderos...)",
  quakeSense: "Sacudida ciudadana",
  safetyChecks: "Safety Checks",
  weatherRisk: "Clima y riesgo",
  terrestrialRoutes: "Rutas terrestres",
  airRoutes: "Rutas aéreas",
  maritimeRoutes: "Rutas marítimas",
  conflictZones: "CONFLICTOS",
  conflictEvents: "ATAQUES",
  territorialControl: "CONTROL",
  crisisNews: "NOTICIAS",
  confirmedDisasters: "DESASTRES CONFIRMADOS",
};

const baseMapOptions: Array<{
  type: BaseMapType;
  label: string;
  disabled?: boolean;
}> = [
  { type: "tactical", label: "Táctico" },
  { type: "streets", label: "Calles" },
  { type: "light", label: "Claro" },
  { type: "satellite", label: "Satélite híbrido" },
];

export default function MapLayerControls<TLayers extends MapLayerState>({
  layers,
  onToggle,
  onClose,
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
  const conflictActive = Boolean(
    layers.conflictZones ||
      layers.conflictEvents ||
      layers.territorialControl ||
      layers.crisisNews ||
      layers.confirmedDisasters
  );
  const activeSummary = [
    {
      label: "Reportes demo",
      enabled: Boolean(layers.demoReports),
      available: Object.prototype.hasOwnProperty.call(layers, "demoReports"),
    },
    {
      label: "Desaparecidos",
      enabled: Boolean(layers.missingPersons),
      available: Object.prototype.hasOwnProperty.call(layers, "missingPersons"),
    },
    {
      label: "Fuentes",
      enabled: Boolean(layers.visualSources),
      available: Object.prototype.hasOwnProperty.call(layers, "visualSources"),
    },
    {
      label: "Cámaras",
      enabled: Boolean(layers.liveCameras),
      available: Object.prototype.hasOwnProperty.call(layers, "liveCameras"),
    },
    {
      label: "Médico",
      enabled: Boolean(layers.medicalPoints),
      available: Object.prototype.hasOwnProperty.call(layers, "medicalPoints"),
    },
    {
      label: "Refugios",
      enabled: Boolean(layers.shelters),
      available: Object.prototype.hasOwnProperty.call(layers, "shelters"),
    },
    {
      label: "QuakeSense",
      enabled: Boolean(layers.quakeSense),
      available: Object.prototype.hasOwnProperty.call(layers, "quakeSense"),
    },
    {
      label: "Safety",
      enabled: Boolean(layers.safetyChecks),
      available: Object.prototype.hasOwnProperty.call(layers, "safetyChecks"),
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
      label: "ShakeMap",
      enabled: Boolean(layers.usgsShakeMapIntensity),
      available: Object.prototype.hasOwnProperty.call(layers, "usgsShakeMapIntensity"),
    },
    {
      label: "PAGER",
      enabled: Boolean(layers.usgsPagerImpactAssessment),
      available: Object.prototype.hasOwnProperty.call(layers, "usgsPagerImpactAssessment"),
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
    {
      label: "EONET",
      enabled: Boolean(layers.nasaEonet),
      available: Object.prototype.hasOwnProperty.call(layers, "nasaEonet"),
    },
    {
      label: "NWS",
      enabled: Boolean(layers.nwsWeatherAlerts),
      available: Object.prototype.hasOwnProperty.call(layers, "nwsWeatherAlerts"),
    },
    {
      label: "Open-Meteo",
      enabled: Boolean(layers.openMeteoWeatherContext),
      available: Object.prototype.hasOwnProperty.call(layers, "openMeteoWeatherContext"),
    },
    {
      label: "OpenAQ",
      enabled: Boolean(layers.openAqAirQualityObservations),
      available: Object.prototype.hasOwnProperty.call(layers, "openAqAirQualityObservations"),
    },
    {
      label: "USGS Water",
      enabled: Boolean(layers.usgsWaterConditions),
      available: Object.prototype.hasOwnProperty.call(layers, "usgsWaterConditions"),
    },
    {
      label: "GVP",
      enabled: Boolean(layers.smithsonianGvpVolcanoes || layers.smithsonianGvpEruptionHistory || layers.smithsonianUsgsVolcanicActivityReports),
      available: Object.prototype.hasOwnProperty.call(layers, "smithsonianGvpVolcanoes"),
    },
    {
      label: "CO-OPS",
      enabled: Boolean(layers.noaaCoopsCoastalObservations),
      available: Object.prototype.hasOwnProperty.call(layers, "noaaCoopsCoastalObservations"),
    },
    {
      label: "IOC SLSMF",
      enabled: Boolean(layers.iocSeaLevelMonitoringStations),
      available: Object.prototype.hasOwnProperty.call(layers, "iocSeaLevelMonitoringStations"),
    },
    {
      label: "NOAA Hist.",
      enabled: Boolean(layers.noaaStormEventsHistorical),
      available: Object.prototype.hasOwnProperty.call(layers, "noaaStormEventsHistorical"),
    },
    {
      label: "NCEI Tsunami",
      enabled: Boolean(layers.noaaNceiHistoricalTsunamis),
      available: Object.prototype.hasOwnProperty.call(layers, "noaaNceiHistoricalTsunamis"),
    },
    {
      label: "OpenFEMA",
      enabled: Boolean(layers.openFemaDisasterDeclarations),
      available: Object.prototype.hasOwnProperty.call(layers, "openFemaDisasterDeclarations"),
    },
    {
      label: "Conflictos",
      enabled: conflictActive,
      available: Object.prototype.hasOwnProperty.call(layers, "conflictZones"),
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
        <div className="flex shrink-0 items-center gap-2">
          <span className="border border-cyan-300/20 bg-cyan-400/8 px-2 py-1 text-[0.58rem] font-bold uppercase text-cyan-200">
            Demo
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="border border-white/10 bg-slate-950/70 px-2 py-1 text-[0.56rem] font-bold uppercase text-slate-400 hover:text-white"
            >
              Ocultar
            </button>
          )}
        </div>
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
            {group.description && (
              <p className="mt-0.5 text-[0.58rem] text-slate-600">{group.description}</p>
            )}
            <div className="mt-2 grid gap-1.5">
              {availableKeys.map((key) => {
                const enabled = Boolean(layers[key]);
                const meta = layerMeta?.[key as keyof MapLayerState];
                const emphasized = Boolean(meta?.emphasis && !enabled);
                const disabled = Boolean(meta?.disabled);
                const alwaysOnRealtime = isAlwaysOnRealtimeLayer(String(key));
                const requiresPermission = isUserSensorLayer(String(key));
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
                      {alwaysOnRealtime && (
                        <>
                          <span className="mt-1 flex flex-wrap gap-1">
                            <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-1.5 py-0.5 text-[0.5rem] font-bold uppercase text-emerald-200">
                              Tiempo real
                            </span>
                            <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-1.5 py-0.5 text-[0.5rem] font-bold uppercase text-emerald-200">
                              Siempre activa
                            </span>
                          </span>
                          <span className="mt-1 block text-[0.58rem] text-emerald-200/80">
                            Esta capa permanece activa para seguridad y análisis ARGUS.
                          </span>
                        </>
                      )}
                      {requiresPermission && (
                        <>
                          <span className="mt-1 inline-flex rounded-full border border-amber-300/20 bg-amber-400/10 px-1.5 py-0.5 text-[0.5rem] font-bold uppercase text-amber-200">
                            Requiere permiso
                          </span>
                          <span className="mt-1 block text-[0.58rem] text-amber-200/80">
                            Requiere permiso del usuario. No se activa automáticamente.
                          </span>
                        </>
                      )}
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
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
            {availableKeys.includes("demoReports" as Extract<keyof TLayers, string>) &&
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

      <ProductStatusLegend />

      {showLegend && <div className="mt-4"><ArgusMapLegend /></div>}
    </div>
  );
}

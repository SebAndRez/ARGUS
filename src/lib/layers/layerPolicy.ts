import type { ArgusLayerDataMode, ArgusLayerFlags } from "@/types/argusLayers";

/**
 * Core operational layers ARGUS must always be listening to for safety and
 * analysis purposes (SOS/help requests, citizen reports, hazard feeds,
 * conflict/crisis feeds). `dataActive` is forced true for these regardless
 * of the user's visual preference — see `enforceLayerPolicy`.
 */
export const ALWAYS_ON_REALTIME_LAYERS = [
  "reports", // citizen reports / incidents / argus events
  "sos", // SOS / help requests
  "alerts",
  "critical",
  "missingPersons",
  "usgsEarthquakes", // earthquakes
  "noaaTsunami", // tsunami
  "nasaFirms", // fires
  "gdacsAlerts", // multi-hazard weather/disaster alerts
  "nwsWeatherAlerts", // severe weather alerts
  "conflictZones",
  "conflictEvents",
  "crisisNews", // news evidence
  "confirmedDisasters",
  "argusOfficialAlerts", // ArgusEvent: OFFICIAL_ALERT / RISK_ZONE from direct official/technical sources
  "argusSevereWeather", // ArgusEvent: SEVERE_WEATHER / HEAVY_RAIN / FLOOD
  "argusLandslideFlood", // ArgusEvent: LANDSLIDE / FLOOD risk & incidents
  "argusRoadDisruption", // ArgusEvent: ROAD_CLOSURE
  "argusNewsEvidence", // ArgusEvent: NEWS_REPORTED_INCIDENT / news-attributed events
] as const;

/**
 * Device/user sensor layers. These require explicit user permission and are
 * never activated automatically — they are not "always on" in the PWA even
 * though, once granted, they run for the session.
 */
export const USER_SENSOR_LAYERS = [
  "quakeSense",
  "safetyChecks", // covers mobileSafety / sensorSafety check-ins on the map
] as const;

/**
 * Optional contextual layers. Normal on/off switches, fully user-controlled,
 * never forced active.
 */
export const OPTIONAL_CONTEXT_LAYERS = [
  "demoReports",
  "usgsShakeMapIntensity",
  "usgsPagerImpactAssessment",
  "nasaEonet",
  "openMeteoWeatherContext",
  "openAqAirQualityObservations",
  "usgsWaterConditions",
  "smithsonianGvpVolcanoes",
  "smithsonianGvpEruptionHistory",
  "smithsonianUsgsVolcanicActivityReports",
  "noaaCoopsCoastalObservations",
  "iocSeaLevelMonitoringStations",
  "noaaStormEventsHistorical",
  "noaaNceiHistoricalTsunamis",
  "openFemaDisasterDeclarations",
  "osmCriticalInfrastructure",
  "hdxHapiHumanitarianContext",
  "whoDiseaseOutbreakNews",
  "ecdcPublicHealthThreats",
  "gdeltMediaSignals",
  "copernicusGlofasFloodForecast",
  "copernicusGfmObservedFloodExtent",
  "reliefWeb",
  "resolved",
  "user",
  "visualSources",
  "officialSources",
  "publicCameras",
  "liveCameras",
  "medicalPoints",
  "shelters",
  "urbanPois",
  "criticalPois",
  "weatherRisk",
  "terrestrialRoutes",
  "airRoutes",
  "maritimeRoutes",
  "territorialControl",
] as const;

export type ArgusLayerId =
  | (typeof ALWAYS_ON_REALTIME_LAYERS)[number]
  | (typeof USER_SENSOR_LAYERS)[number]
  | (typeof OPTIONAL_CONTEXT_LAYERS)[number];

const alwaysOnRealtimeSet = new Set<string>(ALWAYS_ON_REALTIME_LAYERS);
const userSensorSet = new Set<string>(USER_SENSOR_LAYERS);

export function isAlwaysOnRealtimeLayer(layerId: string): boolean {
  return alwaysOnRealtimeSet.has(layerId);
}

export function isUserSensorLayer(layerId: string): boolean {
  return userSensorSet.has(layerId);
}

export function getLayerDataMode(layerId: string): ArgusLayerDataMode {
  if (isAlwaysOnRealtimeLayer(layerId)) return "realtime";
  if (isUserSensorLayer(layerId)) return "sensor";
  return "context";
}

/** Can the user stop ARGUS from processing/fetching this layer's data at all? */
export function canUserDisableData(layerId: string): boolean {
  return !isAlwaysOnRealtimeLayer(layerId);
}

/** Can the user hide this layer from the map without affecting data processing? */
export function canUserHideVisual(layerId: string): boolean {
  // Every layer can be hidden visually — only *data processing* is locked
  // for always-on realtime layers, never the map rendering toggle. `layerId`
  // is kept in the signature so callers can pass any layer without a
  // special case, even though the result doesn't currently vary by id.
  return typeof layerId === "string";
}

export const DEFAULT_VISIBLE_LAYERS: Record<ArgusLayerId, boolean> = {
  // Always-on realtime — visible by default, user may hide visually.
  reports: true,
  sos: true,
  alerts: true,
  critical: true,
  missingPersons: true,
  usgsEarthquakes: true,
  noaaTsunami: true,
  nasaFirms: true,
  gdacsAlerts: true,
  nwsWeatherAlerts: true,
  conflictZones: true,
  conflictEvents: true,
  crisisNews: true,
  confirmedDisasters: true,
  argusOfficialAlerts: true,
  argusSevereWeather: true,
  argusLandslideFlood: true,
  argusRoadDisruption: true,
  argusNewsEvidence: true,
  // Sensor layers — off until the user grants permission.
  quakeSense: false,
  safetyChecks: false,
  // Optional context layers.
  demoReports: false,
  usgsShakeMapIntensity: false,
  usgsPagerImpactAssessment: false,
  nasaEonet: false,
  openMeteoWeatherContext: false,
  openAqAirQualityObservations: false,
  usgsWaterConditions: false,
  smithsonianGvpVolcanoes: false,
  smithsonianGvpEruptionHistory: false,
  smithsonianUsgsVolcanicActivityReports: false,
  noaaCoopsCoastalObservations: false,
  iocSeaLevelMonitoringStations: false,
  noaaStormEventsHistorical: false,
  noaaNceiHistoricalTsunamis: false,
  openFemaDisasterDeclarations: false,
  osmCriticalInfrastructure: false,
  hdxHapiHumanitarianContext: false,
  whoDiseaseOutbreakNews: false,
  ecdcPublicHealthThreats: false,
  gdeltMediaSignals: false,
  copernicusGlofasFloodForecast: false,
  copernicusGfmObservedFloodExtent: false,
  reliefWeb: false,
  resolved: true,
  user: true,
  visualSources: true,
  officialSources: true,
  publicCameras: true,
  liveCameras: false,
  medicalPoints: false,
  shelters: false,
  urbanPois: true,
  criticalPois: true,
  weatherRisk: false,
  terrestrialRoutes: false,
  airRoutes: false,
  maritimeRoutes: false,
  territorialControl: false,
};

/**
 * Critical rule: whatever the stored/incoming visual preference says, an
 * always-on realtime layer must always be treated as `dataActive: true`.
 * Since the current UI only tracks a single boolean per layer (the visual
 * toggle), we keep that boolean as-is for rendering/visibility purposes and
 * expose a *separate* derived object for gating data fetching/processing —
 * callers must gate `fetch`/subscription effects on the output of this
 * function, never directly on the raw stored boolean, whenever the layer is
 * always-on realtime.
 */
export function enforceLayerPolicy<TState extends ArgusLayerFlags>(
  state: TState
): TState {
  const enforced = { ...state } as ArgusLayerFlags;
  ALWAYS_ON_REALTIME_LAYERS.forEach((layerId) => {
    enforced[layerId] = true;
  });
  return enforced as TState;
}

/**
 * Derives the "is ARGUS actually processing this layer" state from the
 * user's visual preferences. Always-on realtime layers are always active;
 * everything else (sensor + context layers) only processes while visible.
 */
export function getDataActiveState<TState extends ArgusLayerFlags>(
  visibleState: TState
): ArgusLayerFlags {
  const dataActive: ArgusLayerFlags = { ...visibleState };
  ALWAYS_ON_REALTIME_LAYERS.forEach((layerId) => {
    dataActive[layerId] = true;
  });
  return dataActive;
}

export function getDefaultLayerState(
  preferredState: ArgusLayerFlags = {}
): Record<ArgusLayerId, boolean> {
  return enforceLayerPolicy({
    ...DEFAULT_VISIBLE_LAYERS,
    ...preferredState,
  });
}

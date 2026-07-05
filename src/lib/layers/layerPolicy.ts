export const ALWAYS_ON_REALTIME_LAYERS = [
  "reports",
  "missingPersons",
  "usgsEarthquakes",
  "usgsShakeMapIntensity",
  "usgsPagerImpactAssessment",
  "gdacsAlerts",
  "noaaTsunami",
  "nasaFirms",
  "nasaEonet",
  "nwsWeatherAlerts",
  "reliefWeb",
  "sos",
  "alerts",
  "critical",
  "quakeSense",
  "safetyChecks",
  "conflictZones",
  "conflictEvents",
  "territorialControl",
  "crisisNews",
  "confirmedDisasters",
] as const;

export const OPTIONAL_CONTEXT_LAYERS = [
  "demoReports",
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
  "resolved",
  "user",
  "visualSources",
  "officialSources",
  "publicCameras",
  "liveCameras",
  "medicalPoints",
  "weatherRisk",
  "terrestrialRoutes",
  "airRoutes",
  "maritimeRoutes",
] as const;

export type ArgusLayerCategory = "realtime" | "context";
export type ArgusLayerId =
  | (typeof ALWAYS_ON_REALTIME_LAYERS)[number]
  | (typeof OPTIONAL_CONTEXT_LAYERS)[number];

export interface ArgusLayerPolicy {
  id: ArgusLayerId;
  category: ArgusLayerCategory;
  userDisableAllowed: boolean;
  defaultVisible: boolean;
}

export type ArgusLayerState = Record<ArgusLayerId, boolean>;

const alwaysOnRealtimeLayerSet = new Set<ArgusLayerId>(
  ALWAYS_ON_REALTIME_LAYERS
);

export const DEFAULT_VISIBLE_LAYERS: ArgusLayerState = {
  reports: true,
  missingPersons: true,
  demoReports: false,
  usgsEarthquakes: true,
  usgsShakeMapIntensity: true,
  usgsPagerImpactAssessment: true,
  gdacsAlerts: true,
  noaaTsunami: true,
  nasaFirms: true,
  nasaEonet: true,
  nwsWeatherAlerts: true,
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
  reliefWeb: true,
  sos: true,
  alerts: true,
  critical: true,
  resolved: true,
  user: true,
  visualSources: true,
  officialSources: true,
  publicCameras: true,
  liveCameras: false,
  medicalPoints: false,
  quakeSense: true,
  safetyChecks: true,
  weatherRisk: false,
  terrestrialRoutes: false,
  airRoutes: false,
  maritimeRoutes: false,
  conflictZones: true,
  conflictEvents: true,
  territorialControl: true,
  crisisNews: true,
  confirmedDisasters: true,
};

export function isAlwaysOnRealtimeLayer(layerId: string): layerId is ArgusLayerId {
  return alwaysOnRealtimeLayerSet.has(layerId as ArgusLayerId);
}

export function canUserDisableLayer(layerId: string) {
  return !isAlwaysOnRealtimeLayer(layerId);
}

export function getDefaultLayerState(
  preferredState: Partial<Record<ArgusLayerId, boolean>> = {}
): ArgusLayerState {
  return enforceLayerPolicy({
    ...DEFAULT_VISIBLE_LAYERS,
    ...preferredState,
  });
}

export function enforceLayerPolicy<TLayerState extends Partial<Record<ArgusLayerId, boolean>>>(
  layerState: TLayerState
) {
  const enforced = { ...layerState };

  ALWAYS_ON_REALTIME_LAYERS.forEach((layerId) => {
    enforced[layerId] = true;
  });

  return enforced as TLayerState & Pick<ArgusLayerState, (typeof ALWAYS_ON_REALTIME_LAYERS)[number]>;
}

export const ARGUS_LAYER_POLICIES: Record<ArgusLayerId, ArgusLayerPolicy> = (
  Object.keys(DEFAULT_VISIBLE_LAYERS) as ArgusLayerId[]
).reduce(
  (policies, id) => {
    const realtime = isAlwaysOnRealtimeLayer(id);
    policies[id] = {
      id,
      category: realtime ? "realtime" : "context",
      userDisableAllowed: !realtime,
      defaultVisible: DEFAULT_VISIBLE_LAYERS[id],
    };
    return policies;
  },
  {} as Record<ArgusLayerId, ArgusLayerPolicy>
);

// Predictive Core must consume realtime layers independently from map visibility.
// Fenix remains contextual, fed by always-on realtime evidence when a simulation needs it.

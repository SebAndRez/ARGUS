import { ARGUS_SOURCE_REGISTRY } from "@/config/argusSourceRegistry";

export type SourceReliability =
  | "OFFICIAL"
  | "TECHNICAL"
  | "HUMANITARIAN"
  | "MEDIA"
  | "CITIZEN"
  | "SENSOR"
  | "CURATED"
  | "DEMO"
  | "UNKNOWN";

export type SourceOperationalStatus =
  | "ACTIVE"
  | "DEGRADED"
  | "DISABLED"
  | "DEMO_ONLY"
  | "NEEDS_KEY"
  | "NEEDS_REVIEW"
  | "ERROR";

export type SourceCategory =
  | "EARTHQUAKE"
  | "TSUNAMI"
  | "WEATHER"
  | "FIRE"
  | "CONFLICT"
  | "HUMANITARIAN"
  | "TRAFFIC"
  | "MEDICAL"
  | "SENSOR"
  | "CITIZEN"
  | "CAMERA"
  | "ROUTING";

export interface SourceDefinition {
  id: string;
  name: string;
  category: SourceCategory;
  reliability: SourceReliability;
  status: SourceOperationalStatus;
  requiresKey: boolean;
  publicUrl?: string;
  apiEnvVar?: string;
  refreshIntervalMinutes: number;
  rateLimitNotes: string;
  termsNotes: string;
  argusUse: string;
  isOfficial: boolean;
  isDemo: boolean;
  lastReviewedAt: string;
}

const reviewedAt = "2026-07-01";

const externalSources: SourceDefinition[] = ARGUS_SOURCE_REGISTRY.map((source) => ({
  id: source.id,
  name: source.name,
  category: mapRegistryCategory(source.category),
  reliability: mapRegistryReliability(source.id, source.category),
  status:
    source.status === "active"
      ? "ACTIVE"
      : source.status === "active_if_configured"
        ? "NEEDS_KEY"
        : source.status === "reference"
          ? "NEEDS_REVIEW"
          : source.status === "disabled"
            ? "DISABLED"
            : "NEEDS_REVIEW",
  requiresKey: ["api_key", "appname_required", "paid"].includes(source.accessType),
  publicUrl: sourcePublicUrl(source.id),
  apiEnvVar:
    source.id === "nasa_firms"
      ? "NASA_FIRMS_MAP_KEY"
      : source.id === "reliefweb"
        ? "RELIEFWEB_APP_NAME"
        : undefined,
  refreshIntervalMinutes: recommendedRefreshMinutes(source.id),
  rateLimitNotes: source.accessType === "paid" ? "Requiere licencia/contrato." : "Respetar terminos y cache local.",
  termsNotes: source.notes,
  argusUse: `ARGUS usa esta fuente como ${source.category}; no reemplaza autoridad local.`,
  isOfficial: ["usgs_earthquake", "gdacs", "noaa_tsunami", "met_norway", "nasa_firms", "nasa-eonet"].includes(source.id),
  isDemo: source.status !== "active" && source.status !== "active_if_configured",
  lastReviewedAt: reviewedAt,
}));

const internalSources: SourceDefinition[] = [
  {
    id: "citizen_reports",
    name: "Reportes ciudadanos",
    category: "CITIZEN",
    reliability: "CITIZEN",
    status: "ACTIVE",
    requiresKey: false,
    refreshIntervalMinutes: 0,
    rateLimitNotes: "Requiere anti-abuse y revision humana para sanciones.",
    termsNotes: "Dato ciudadano preliminar; no asumir certeza sin validacion.",
    argusUse: "Reportes locales, SOS y validacion comunitaria.",
    isOfficial: false,
    isDemo: false,
    lastReviewedAt: reviewedAt,
  },
  {
    id: "quakesense",
    name: "ARGUS QuakeSense",
    category: "SENSOR",
    reliability: "SENSOR",
    status: "DEMO_ONLY",
    requiresKey: false,
    refreshIntervalMinutes: 0,
    rateLimitNotes: "Runtime local; no usar para sanciones automaticas.",
    termsNotes: "Experimental; no es alerta sismica oficial.",
    argusUse: "Senales preliminares de posible sacudida.",
    isOfficial: false,
    isDemo: true,
    lastReviewedAt: reviewedAt,
  },
  {
    id: "sensor_safety",
    name: "Sensor Safety Suite",
    category: "SENSOR",
    reliability: "SENSOR",
    status: "DEMO_ONLY",
    requiresKey: false,
    refreshIntervalMinutes: 0,
    rateLimitNotes: "Requiere app nativa para operacion real.",
    termsNotes: "RoadSense/FallSense web son demo/runtime.",
    argusUse: "Check-ins y eventos preliminares de seguridad personal.",
    isOfficial: false,
    isDemo: true,
    lastReviewedAt: reviewedAt,
  },
  {
    id: "live_cameras",
    name: "Camara y fuentes visuales",
    category: "CAMERA",
    reliability: "CURATED",
    status: "DEMO_ONLY",
    requiresKey: false,
    refreshIntervalMinutes: 60,
    rateLimitNotes: "No scrape; usar embeds o fuentes permitidas.",
    termsNotes: "Apoyo visual, no confirmacion oficial.",
    argusUse: "Contexto visual para incidentes.",
    isOfficial: false,
    isDemo: true,
    lastReviewedAt: reviewedAt,
  },
  {
    id: "routing_demo",
    name: "Routing/NAV demo",
    category: "ROUTING",
    reliability: "DEMO",
    status: "DEMO_ONLY",
    requiresKey: false,
    refreshIntervalMinutes: 0,
    rateLimitNotes: "Sin proveedor real todavia.",
    termsNotes: "Rutas ilustrativas; no garantizan seguridad.",
    argusUse: "Demostracion de rutas terrestres/aereas/maritimas.",
    isOfficial: false,
    isDemo: true,
    lastReviewedAt: reviewedAt,
  },
  {
    id: "medical_points_demo",
    name: "Puntos medicos demo",
    category: "MEDICAL",
    reliability: "DEMO",
    status: "DEMO_ONLY",
    requiresKey: false,
    refreshIntervalMinutes: 0,
    rateLimitNotes: "No usar como disponibilidad real.",
    termsNotes: "AURA basico/demo; no reemplaza sistema medico.",
    argusUse: "Demostracion de AURA y puntos cercanos.",
    isOfficial: false,
    isDemo: true,
    lastReviewedAt: reviewedAt,
  },
];

export const ARGUS_OPERATIONAL_SOURCE_REGISTRY: SourceDefinition[] = [
  ...externalSources,
  ...internalSources,
];

export function getSourceDefinition(sourceId: string) {
  return ARGUS_OPERATIONAL_SOURCE_REGISTRY.find((source) => source.id === sourceId);
}

function mapRegistryCategory(category: string): SourceCategory {
  if (category.includes("earthquake")) return "EARTHQUAKE";
  if (category.includes("tsunami")) return "TSUNAMI";
  if (category.includes("weather") || category.includes("air_quality")) return "WEATHER";
  if (category.includes("thermal") || category.includes("wildfire")) return "FIRE";
  if (category.includes("conflict") || category.includes("geopolitical") || category === "news") return "CONFLICT";
  if (category.includes("humanitarian") || category.includes("disaster") || category.includes("flood")) return "HUMANITARIAN";
  if (category.includes("geospatial")) return "ROUTING";
  return "HUMANITARIAN";
}

function mapRegistryReliability(sourceId: string, category: string): SourceReliability {
  if (["usgs_earthquake", "gdacs", "noaa_tsunami", "met_norway", "nasa_firms", "nasa-eonet"].includes(sourceId)) return "OFFICIAL";
  if (sourceId === "open-meteo" || category === "weather_context") return "TECHNICAL";
  if (["reliefweb", "hdx_hapi"].includes(sourceId)) return "HUMANITARIAN";
  if (["gdelt", "ap_reuters_bloomberg"].includes(sourceId)) return "MEDIA";
  if (["acled", "liveuamap"].includes(sourceId)) return "CURATED";
  if (category === "geospatial") return "TECHNICAL";
  return "UNKNOWN";
}

function recommendedRefreshMinutes(sourceId: string) {
  const values: Record<string, number> = {
    usgs_earthquake: 1,
    gdacs: 5,
    noaa_tsunami: 5,
    nasa_firms: 15,
    "nasa-eonet": 30,
    met_norway: 10,
    reliefweb: 30,
    "open-meteo": 60,
    gdelt: 15,
    openstreetmap: 1440,
  };
  return values[sourceId] ?? 60;
}

function sourcePublicUrl(sourceId: string) {
  const urls: Record<string, string> = {
    usgs_earthquake: "https://earthquake.usgs.gov/",
    gdacs: "https://www.gdacs.org/",
    noaa_tsunami: "https://www.tsunami.gov/",
    nasa_firms: "https://firms.modaps.eosdis.nasa.gov/",
    "nasa-eonet": "https://eonet.gsfc.nasa.gov/",
    met_norway: "https://api.met.no/",
    reliefweb: "https://reliefweb.int/",
    "open-meteo": "https://open-meteo.com/",
    gdelt: "https://www.gdeltproject.org/",
    openstreetmap: "https://www.openstreetmap.org/",
  };
  return urls[sourceId];
}

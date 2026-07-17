import type {
  ArgusExternalSourceId,
  ArgusIngestionCategory,
} from "@/types/ingestion";

export type ArgusSourceTier = 1 | 2 | 3;
export type ArgusSourceStatus =
  | "planned"
  | "active"
  | "active_if_configured"
  | "disabled"
  | "reference";
export type ArgusSourceAccessType =
  | "free"
  | "free_with_terms"
  | "api_key"
  | "appname_required"
  | "paid"
  | "manual_reference";

export interface ArgusSourceRegistryEntry {
  id: ArgusExternalSourceId;
  name: string;
  category: ArgusIngestionCategory;
  tier: ArgusSourceTier;
  priority: number;
  status: ArgusSourceStatus;
  reliabilityScore: number;
  accessType: ArgusSourceAccessType;
  notes: string;
}

export const ARGUS_SOURCE_REGISTRY: ArgusSourceRegistryEntry[] = [
  {
    id: "usgs_earthquake",
    name: "USGS Earthquake GeoJSON / FDSN",
    category: "earthquake",
    tier: 1,
    priority: 100,
    status: "active",
    reliabilityScore: 98,
    accessType: "free",
    notes: "Fuente oficial primaria para terremotos. Primera ingesta real de ARGUS.",
  },
  {
    id: "gdacs",
    name: "GDACS Global Disaster Alerts",
    category: "disaster_alerts",
    tier: 1,
    priority: 96,
    status: "active",
    reliabilityScore: 94,
    accessType: "free",
    notes:
      "Fuente global institucional de alertas de desastre con semáforo Green, Orange y Red.",
  },
  {
    id: "nasa_firms",
    name: "NASA FIRMS",
    category: "thermal_anomaly",
    tier: 1,
    priority: 92,
    status: "active_if_configured",
    reliabilityScore: 94,
    accessType: "api_key",
    notes:
      "Focos térmicos MODIS/VIIRS; requiere una MAP_KEY gratuita configurada por el operador.",
  },
  {
    id: "met_norway",
    name: "MET Norway Locationforecast",
    category: "weather",
    tier: 1,
    priority: 94,
    status: "active",
    reliabilityScore: 95,
    accessType: "free_with_terms",
    notes:
      "Pronóstico por coordenadas mediante Locationforecast; requiere User-Agent identificable.",
  },
  {
    id: "noaa_tsunami",
    name: "NOAA Tsunami",
    category: "tsunami",
    tier: 1,
    priority: 98,
    status: "active",
    reliabilityScore: 98,
    accessType: "free",
    notes:
      "Feeds Atom oficiales de los centros NTWC y PTWC para mensajes y alertas de tsunami.",
  },
  {
    id: "ioc-slsmf",
    name: "IOC Sea Level Monitoring",
    category: "sea_level_observation",
    tier: 1,
    priority: 91,
    status: "active_if_configured",
    reliabilityScore: 91,
    accessType: "api_key",
    notes:
      "IOC Sea Level Monitoring Facility / SLSMF; mareografos globales y nivel del mar relativo. Requiere IOC_SLSMF_API_KEY. Contexto observacional, no warning center, no orden de evacuacion, no confirmacion automatica de tsunami.",
  },
  {
    id: "open-meteo",
    name: "Open-Meteo Weather Forecast API",
    category: "weather_context",
    tier: 2,
    priority: 86,
    status: "active",
    reliabilityScore: 86,
    accessType: "free_with_terms",
    notes:
      "Fuente global sin API key para contexto meteorologico por coordenada. Uso gratis/no comercial; uso comercial o institucional requiere revision. No es autoridad oficial de alertas ni debe crear incidentes.",
  },
  {
    id: "nws",
    name: "NWS / api.weather.gov",
    category: "weather_alert",
    tier: 1,
    priority: 95,
    status: "active",
    reliabilityScore: 92,
    accessType: "free",
    notes:
      "National Weather Service / NOAA; alertas meteorologicas oficiales para Estados Unidos y territorios NWS. Recomendado NWS_USER_AGENT; no es cobertura mundial completa.",
  },
  {
    id: "reliefweb",
    name: "ReliefWeb",
    category: "humanitarian_context",
    tier: 1,
    priority: 88,
    status: "active_if_configured",
    reliabilityScore: 92,
    accessType: "appname_required",
    notes:
      "Contexto humanitario curado por OCHA; requiere RELIEFWEB_APP_NAME preaprobado.",
  },
  { id: "gdelt", name: "GDELT", category: "geopolitical", tier: 1, priority: 72, status: "planned", reliabilityScore: 70, accessType: "free", notes: "Señales geopolíticas y noticias; requiere contraste." },
  { id: "openstreetmap", name: "OpenStreetMap Data", category: "geospatial", tier: 1, priority: 85, status: "planned", reliabilityScore: 88, accessType: "free_with_terms", notes: "Base geográfica y contexto territorial." },
  {
    id: "codigo_azul",
    name: "Código Azul — Ministerio de Desarrollo Social y Familia",
    category: "geospatial",
    tier: 1,
    priority: 80,
    status: "active",
    reliabilityScore: 78,
    accessType: "free",
    notes:
      "Listado oficial de albergues/hospederías del programa Código Azul (sitio Laravel server-rendered, sin API pública — extracción HTML controlada). \"Cupos\" publicado se normaliza como capacityDeclared, nunca como disponibilidad confirmada.",
  },
  { id: "copernicus_glofas", name: "Copernicus GloFAS / GFM", category: "flood", tier: 2, priority: 80, status: "planned", reliabilityScore: 91, accessType: "free_with_terms", notes: "Inundaciones y caudales." },
  { id: "hdx_hapi", name: "HDX HAPI", category: "humanitarian", tier: 2, priority: 70, status: "planned", reliabilityScore: 82, accessType: "free_with_terms", notes: "Datasets humanitarios normalizados." },
  {
    id: "openaq",
    name: "OpenAQ",
    category: "air_quality",
    tier: 2,
    priority: 76,
    status: "active_if_configured",
    reliabilityScore: 86,
    accessType: "free_with_terms",
    notes:
      "Contexto global agregado de calidad del aire; requiere OPENAQ_API_KEY, staleness y metadata proveedor/licencia. No es alerta sanitaria oficial ni fuente de incidentes.",
  },
  {
    id: "nasa-eonet",
    name: "NASA EONET",
    category: "disaster",
    tier: 2,
    priority: 90,
    status: "active",
    reliabilityScore: 90,
    accessType: "free",
    notes: "NASA Earth Observatory Natural Event Tracker; eventos naturales globales curados, sin key. Contexto informativo, no autoridad local chilena.",
  },
  { id: "acled", name: "ACLED", category: "conflict", tier: 2, priority: 76, status: "planned", reliabilityScore: 84, accessType: "free_with_terms", notes: "Conflicto y protestas bajo términos de uso." },
  { id: "liveuamap", name: "Liveuamap", category: "conflict", tier: 3, priority: 65, status: "reference", reliabilityScore: 78, accessType: "paid", notes: "Referencia visual y posible integración pagada futura; no es API free principal." },
  { id: "accuweather", name: "AccuWeather", category: "weather", tier: 3, priority: 60, status: "reference", reliabilityScore: 88, accessType: "api_key", notes: "Servicio comercial; no es la base open/free prevista." },
  { id: "ap_reuters_bloomberg", name: "AP / Reuters / Bloomberg", category: "news", tier: 3, priority: 75, status: "reference", reliabilityScore: 92, accessType: "paid", notes: "Fuentes de referencia; no se permite scraping ni uso intensivo sin licencia." },
];

export function getArgusSource(sourceId: ArgusExternalSourceId) {
  return ARGUS_SOURCE_REGISTRY.find((source) => source.id === sourceId);
}

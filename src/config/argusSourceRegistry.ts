import type {
  ArgusExternalSourceId,
  ArgusIngestionCategory,
} from "@/types/ingestion";

export type ArgusSourceTier = 1 | 2 | 3;
export type ArgusSourceStatus = "planned" | "active" | "disabled" | "reference";
export type ArgusSourceAccessType =
  | "free"
  | "free_with_terms"
  | "api_key"
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
  { id: "nasa_firms", name: "NASA FIRMS", category: "wildfire", tier: 1, priority: 90, status: "planned", reliabilityScore: 94, accessType: "free_with_terms", notes: "Focos térmicos e incendios." },
  { id: "met_norway", name: "MET Norway API", category: "weather", tier: 1, priority: 88, status: "planned", reliabilityScore: 92, accessType: "free_with_terms", notes: "Meteorología por coordenada." },
  { id: "noaa_tsunami", name: "NOAA Tsunami Feeds", category: "tsunami", tier: 1, priority: 91, status: "planned", reliabilityScore: 95, accessType: "free", notes: "Avisos y eventos de tsunami." },
  { id: "reliefweb", name: "ReliefWeb API", category: "humanitarian", tier: 1, priority: 78, status: "planned", reliabilityScore: 86, accessType: "free_with_terms", notes: "Crisis y respuesta humanitaria." },
  { id: "gdelt", name: "GDELT", category: "geopolitical", tier: 1, priority: 72, status: "planned", reliabilityScore: 70, accessType: "free", notes: "Señales geopolíticas y noticias; requiere contraste." },
  { id: "openstreetmap", name: "OpenStreetMap Data", category: "geospatial", tier: 1, priority: 85, status: "planned", reliabilityScore: 88, accessType: "free_with_terms", notes: "Base geográfica y contexto territorial." },
  { id: "copernicus_glofas", name: "Copernicus GloFAS / GFM", category: "flood", tier: 2, priority: 80, status: "planned", reliabilityScore: 91, accessType: "free_with_terms", notes: "Inundaciones y caudales." },
  { id: "hdx_hapi", name: "HDX HAPI", category: "humanitarian", tier: 2, priority: 70, status: "planned", reliabilityScore: 82, accessType: "free_with_terms", notes: "Datasets humanitarios normalizados." },
  { id: "openaq", name: "OpenAQ", category: "air_quality", tier: 2, priority: 68, status: "planned", reliabilityScore: 78, accessType: "free_with_terms", notes: "Calidad del aire según cobertura disponible." },
  { id: "nasa_eonet", name: "NASA EONET", category: "disaster", tier: 2, priority: 74, status: "planned", reliabilityScore: 88, accessType: "free", notes: "Eventos naturales abiertos." },
  { id: "acled", name: "ACLED", category: "conflict", tier: 2, priority: 76, status: "planned", reliabilityScore: 84, accessType: "free_with_terms", notes: "Conflicto y protestas bajo términos de uso." },
  { id: "liveuamap", name: "Liveuamap", category: "conflict", tier: 3, priority: 65, status: "reference", reliabilityScore: 78, accessType: "paid", notes: "Referencia visual y posible integración pagada futura; no es API free principal." },
  { id: "accuweather", name: "AccuWeather", category: "weather", tier: 3, priority: 60, status: "reference", reliabilityScore: 88, accessType: "api_key", notes: "Servicio comercial; no es la base open/free prevista." },
  { id: "ap_reuters_bloomberg", name: "AP / Reuters / Bloomberg", category: "news", tier: 3, priority: 75, status: "reference", reliabilityScore: 92, accessType: "paid", notes: "Fuentes de referencia; no se permite scraping ni uso intensivo sin licencia." },
];

export function getArgusSource(sourceId: ArgusExternalSourceId) {
  return ARGUS_SOURCE_REGISTRY.find((source) => source.id === sourceId);
}

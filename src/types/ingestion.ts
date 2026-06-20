export type ArgusExternalSourceId =
  | "usgs_earthquake"
  | "gdacs"
  | "nasa_firms"
  | "met_norway"
  | "noaa_tsunami"
  | "reliefweb"
  | "gdelt"
  | "openstreetmap"
  | "copernicus_glofas"
  | "hdx_hapi"
  | "openaq"
  | "nasa_eonet"
  | "acled"
  | "liveuamap"
  | "accuweather"
  | "ap_reuters_bloomberg";

export type ArgusIngestionCategory =
  | "earthquake"
  | "disaster"
  | "disaster_alerts"
  | "thermal_anomaly"
  | "wildfire"
  | "weather"
  | "tsunami"
  | "humanitarian"
  | "humanitarian_context"
  | "geopolitical"
  | "geospatial"
  | "flood"
  | "air_quality"
  | "conflict"
  | "news"
  | "cyclone"
  | "volcano"
  | "drought"
  | "unknown";

export type ArgusIngestionSeverity = "low" | "medium" | "high" | "critical";
export type ArgusExternalAlertLevel = "green" | "orange" | "red" | "unknown";

export interface ArgusNormalizedEvent {
  id: string;
  sourceId: ArgusExternalSourceId;
  sourceName: string;
  externalId: string;
  title: string;
  description: string;
  category: ArgusIngestionCategory;
  severity: ArgusIngestionSeverity;
  confidence: number;
  latitude: number | null;
  longitude: number | null;
  radiusKm?: number | null;
  occurredAt: string;
  updatedAt?: string | null;
  url?: string | null;
  rawMagnitude?: number | null;
  rawMagnitudeType?: string | null;
  rawDepthKm?: number | null;
  rawOfficialMmi?: number | null;
  rawAlertLevel?: ArgusExternalAlertLevel | null;
  rawMessageType?: string | null;
  rawConfidence?: string | null;
  rawFrp?: number | null;
  rawBrightness?: number | null;
  satellite?: string | null;
  instrument?: string | null;
  dayNight?: string | null;
  locationName?: string | null;
  country?: string | null;
  recommendedAction?: string | null;
  whyItMatters?: string | null;
  isExternal: true;
}

export interface ReliefWebReportFields {
  title?: string;
  url?: string;
  date?: { created?: string; original?: string };
  source?: Array<{ name?: string; shortname?: string }>;
  country?: Array<{ name?: string; shortname?: string; iso3?: string }>;
  disaster?: Array<{ name?: string; type?: Array<{ name?: string }> }>;
  format?: Array<{ name?: string }>;
  body?: string;
  "body-html"?: string;
}

export interface ReliefWebReportItem {
  id: number | string;
  fields: ReliefWebReportFields;
}

export interface ArgusIngestionSourceResponse {
  cached: boolean;
  fetchedAt: string;
  expiresAt: string;
  sourceId: ArgusExternalSourceId;
  sourceName: string;
  sourceUpdatedAt: string | null;
  count: number;
  events: ArgusNormalizedEvent[];
  persistedCount?: number;
  ingestionRunId?: string | null;
}

export interface UsgsEarthquakeFeature {
  type: "Feature";
  id: string;
  properties: {
    mag?: number | null;
    magType?: string | null;
    mmi?: number | null;
    cdi?: number | null;
    place?: string | null;
    time?: number | null;
    updated?: number | null;
    url?: string | null;
    detail?: string | null;
    status?: string | null;
    tsunami?: number | null;
    sig?: number | null;
    type?: string | null;
  };
  geometry: {
    type: "Point";
    coordinates: [longitude: number, latitude: number, depthKm?: number];
  };
}

export interface UsgsEarthquakeFeatureCollection {
  type: "FeatureCollection";
  metadata?: {
    generated?: number;
    url?: string;
    title?: string;
    count?: number;
    status?: number;
  };
  features: UsgsEarthquakeFeature[];
}

export interface GdacsRssItem {
  title: string;
  description: string;
  link: string;
  guid: string;
  pubDate: string;
  dateModified: string;
  eventType: string;
  alertLevel: string;
  eventId: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
}

export interface NoaaTsunamiAtomEntry {
  feedId: string;
  feedTitle: string;
  id: string;
  title: string;
  updated: string;
  summary: string;
  link: string;
  latitude: number | null;
  longitude: number | null;
}

export interface NasaFirmsCsvRow {
  latitude: string;
  longitude: string;
  bright_ti4?: string;
  brightness?: string;
  scan?: string;
  track?: string;
  acq_date: string;
  acq_time: string;
  satellite?: string;
  instrument?: string;
  confidence?: string;
  version?: string;
  bright_ti5?: string;
  frp?: string;
  daynight?: string;
}

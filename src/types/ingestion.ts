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
  | "wildfire"
  | "weather"
  | "tsunami"
  | "humanitarian"
  | "geopolitical"
  | "geospatial"
  | "flood"
  | "air_quality"
  | "conflict"
  | "news";

export type ArgusIngestionSeverity = "low" | "medium" | "high" | "critical";

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
  latitude: number;
  longitude: number;
  radiusKm?: number | null;
  occurredAt: string;
  updatedAt?: string | null;
  url?: string | null;
  rawMagnitude?: number | null;
  rawDepthKm?: number | null;
  recommendedAction?: string | null;
  whyItMatters?: string | null;
  isExternal: true;
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
}

export interface UsgsEarthquakeFeature {
  type: "Feature";
  id: string;
  properties: {
    mag?: number | null;
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

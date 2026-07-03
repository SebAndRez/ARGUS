export type UsgsWaterPurpose =
  | "flood"
  | "nav"
  | "fenix"
  | "aura"
  | "incident_context"
  | "drought"
  | "general";

export type UsgsWaterApiFamily = "modern" | "legacy" | "mixed";

export type HydrologicalQuery = {
  site?: string;
  lat?: number;
  lon?: number;
  bbox?: [number, number, number, number];
  radiusKm: number;
  parameters: string[];
};

export type HydrologicalLocation = {
  siteId: string;
  siteName?: string;
  latitude: number | null;
  longitude: number | null;
  distanceKm?: number | null;
  agency?: string;
  siteType?: string;
};

export type HydrologicalMeasurement = {
  siteId: string;
  parameterCode: "00060" | "00065";
  parameterName: string;
  value: number | null;
  unit?: string;
  measuredAt?: string;
  qualifier?: string;
  method?: string;
};

export type HydrologicalRiskFactors = {
  highWaterContext: boolean;
  risingWaterUnknown: boolean;
  staleData: boolean;
  missingGageHeight: boolean;
  missingStreamflow: boolean;
  noNearbyStation: boolean;
  floodContextAvailable: boolean;
  droughtContextPotential: boolean;
};

export type HydrologicalContext = {
  id: string;
  sourceId: "usgs-water";
  sourceName: "USGS Water Data";
  purpose: UsgsWaterPurpose;
  generatedAt: string;
  apiFamily: UsgsWaterApiFamily;
  legacyFallbackUsed: boolean;
  query: HydrologicalQuery;
  locations: HydrologicalLocation[];
  measurements: HydrologicalMeasurement[];
  latest: {
    streamflow?: HydrologicalMeasurement;
    gageHeight?: HydrologicalMeasurement;
    measuredAt?: string;
  };
  riskFactors: HydrologicalRiskFactors;
  confidence: number;
  stalenessMinutes: number | null;
  limitations: string[];
  evidenceRefs: string[];
  sourceUrls: string[];
};

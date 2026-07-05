export type OpenAqPurpose =
  | "wildfire_smoke_context"
  | "volcanic_ash_context"
  | "dust_haze_context"
  | "urban_pollution_context"
  | "aura"
  | "nav"
  | "fenix"
  | "incident_context"
  | "air_quality_monitoring"
  | "general";

export type AirQualityQuery = {
  locationId?: string;
  sensorId?: string;
  lat?: number;
  lon?: number;
  radiusKm?: number;
  bbox?: string;
  parameters: string[];
  country?: string;
  providers?: string[];
  owners?: string[];
  licenses?: string[];
  limit: number;
  page?: number;
  purpose: OpenAqPurpose;
  incidentId?: string;
  routeAnalysisId?: string;
  fenixSimulationId?: string;
};

export type AirQualityLocation = {
  locationId: string;
  locationName?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  provider?: { id?: string | number; name?: string };
  owner?: { id?: string | number; name?: string };
  license?: { id?: string | number; name?: string; url?: string };
  isMobile?: boolean;
  isMonitor?: boolean;
  sensorsAvailable: number;
  parametersAvailable: string[];
  bounds?: unknown;
  distanceKm?: number;
};

export type AirQualitySensor = {
  sensorId: string;
  locationId?: string;
  parameter?: string;
  unit?: string;
  provider?: { id?: string | number; name?: string };
  status?: string;
};

export type AirQualityMeasurement = {
  locationId?: string;
  sensorId?: string;
  parameter: string;
  value: number | null;
  unit?: string;
  observedAt?: string;
  stalenessMinutes?: number;
  coordinates?: { latitude?: number; longitude?: number };
  provider?: { id?: string | number; name?: string };
  owner?: { id?: string | number; name?: string };
  license?: { id?: string | number; name?: string; url?: string };
  sourceName: "OpenAQ";
  qualityFlags?: string[];
};

export type AirQualityProviderLicense = {
  providers: Array<{ id?: string | number; name?: string; raw?: unknown }>;
  owners: Array<{ id?: string | number; name?: string; raw?: unknown }>;
  licenses: Array<{ id?: string | number; name?: string; url?: string; attribution?: string; raw?: unknown }>;
  attributionRequired: true;
  commercialUseStatus: "check_license_per_provider";
  licenseCaveat: string;
};

export type AirQualityObservationContext = {
  sourceId: "openaq";
  sourceName: "OpenAQ";
  purpose: OpenAqPurpose;
  generatedAt: string;
  query: AirQualityQuery;
  locations: AirQualityLocation[];
  sensors: AirQualitySensor[];
  measurements: AirQualityMeasurement[];
  latest: Record<string, AirQualityMeasurement | number | string | null | undefined> & {
    observedAt?: string;
    worstParameter?: string;
  };
  providerLicense: AirQualityProviderLicense;
  riskFactors: {
    elevatedPm25Context: boolean;
    elevatedPm10Context: boolean;
    ozoneContext: boolean;
    smokePossibleContext: boolean;
    volcanicAshPossibleContext: boolean;
    urbanPollutionContext: boolean;
    respiratoryExposureContext: boolean;
    staleData: boolean;
    noNearbyLocation: boolean;
    missingProviderLicense: boolean;
    providerDependentReliability: boolean;
  };
  confidence: number;
  airQualityContextScore: number;
  stalenessMinutes?: number;
  limitations: string[];
  warnings: string[];
  caveats: string[];
  evidenceRefs: string[];
  rawRefs: string[];
};

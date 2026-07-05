export type IocSlsmfPurpose =
  | "tsunami_context"
  | "coastal_context"
  | "storm_surge_context"
  | "nav"
  | "fenix"
  | "aura"
  | "incident_context"
  | "sea_level_monitoring"
  | "general";

export type IocSlsmfApiVersion = "v2" | "legacy";

export type IocSlsmfStationStatus = "online" | "offline" | "stale" | "unknown";

export type SeaLevelObservationStation = {
  stationCode: string;
  stationName?: string;
  country?: string;
  latitude: number | null;
  longitude: number | null;
  provider?: string;
  network?: string;
  status: IocSlsmfStationStatus;
  lastDataTime?: string;
  distanceKm?: number | null;
  sensorsAvailable: boolean;
  sensors?: string[];
  raw?: unknown;
};

export type SeaLevelSensorMetadata = {
  stationCode: string;
  sensorId?: string;
  sensorType?: string;
  samplingRate?: string;
  dataType?: string;
  verticalReference?: string;
  provider?: string;
  status?: string;
  raw?: unknown;
};

export type SeaLevelObservation = {
  stationCode: string;
  sensorId?: string;
  observedAt?: string;
  seaLevelValue: number | null;
  unit?: string;
  qualityFlag?: string;
  dataSource?: string;
  provider?: string;
  rawValue?: unknown;
  relativeSeaLevel: true;
  absoluteDatumAvailable: false | "unknown";
  datumCaution: true;
  raw?: unknown;
};

export type SeaLevelObservationContext = {
  id: string;
  sourceId: "ioc-slsmf";
  sourceName: "IOC Sea Level Monitoring Facility";
  purpose: IocSlsmfPurpose;
  generatedAt: string;
  query: {
    stationCode?: string;
    lat?: number;
    lon?: number;
    bbox?: [number, number, number, number];
    radiusKm: number;
    startTime?: string;
    endTime?: string;
    minutes: number;
    apiVersion: IocSlsmfApiVersion;
  };
  stations: SeaLevelObservationStation[];
  sensors: SeaLevelSensorMetadata[];
  observations: SeaLevelObservation[];
  latest: {
    latestSeaLevel?: number | null;
    latestObservedAt?: string;
    latestQualityFlag?: string;
    relativeSeaLevel: true;
    absoluteDatumAvailable: false | "unknown";
    datumCaution: true;
  };
  riskFactors: {
    stationNearby: boolean;
    stationOnline: boolean;
    stationOffline: boolean;
    staleData: boolean;
    missingValues: boolean;
    lowQuality: boolean;
    recentSeaLevelAvailable: boolean;
    relativeDatumCaution: true;
    noNearbyStation: boolean;
  };
  confidence: number;
  stalenessMinutes: number | null;
  limitations: string[];
  evidenceRefs: string[];
  sourceUrls: string[];
};

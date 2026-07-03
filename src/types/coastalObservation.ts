export type CoopsPurpose =
  | "tsunami_context"
  | "hurricane_context"
  | "storm_surge_context"
  | "nav"
  | "fenix"
  | "aura"
  | "incident_context"
  | "coastal_monitoring"
  | "general";

export type CoopsProduct = "water_level" | "predictions" | "wind" | "air_pressure" | "air_gap";

export type CoastalMeasurementType = "observed" | "predicted";

export type CoastalObservationStation = {
  stationId: string;
  stationName?: string;
  latitude: number | null;
  longitude: number | null;
  state?: string;
  timezone?: string;
  stationType?: string;
  active?: boolean | null;
  distanceKm?: number | null;
  productsAvailable?: string[];
  sensorsAvailable?: string[];
};

export type CoastalObservationMeasurement = {
  stationId: string;
  product: CoopsProduct;
  measurementType: CoastalMeasurementType;
  value: number | null;
  unit?: string;
  datum?: string;
  measuredAt?: string;
  predictedAt?: string;
  qualityFlags?: string[];
  raw?: unknown;
};

export type CoastalObservationContext = {
  id: string;
  sourceId: "noaa-coops";
  sourceName: "NOAA CO-OPS";
  purpose: CoopsPurpose;
  generatedAt: string;
  query: {
    stationId?: string;
    lat?: number;
    lon?: number;
    bbox?: [number, number, number, number];
    radiusKm: number;
    products: CoopsProduct[];
    datum: string;
    units: "metric" | "english";
    timeZone: string;
  };
  stations: CoastalObservationStation[];
  observations: CoastalObservationMeasurement[];
  latest: {
    waterLevel?: CoastalObservationMeasurement;
    waterLevelDatum?: string;
    waterLevelTime?: string;
    wind?: CoastalObservationMeasurement;
    windTime?: string;
    airPressure?: CoastalObservationMeasurement;
    airPressureTime?: string;
    airGap?: CoastalObservationMeasurement;
    airGapTime?: string;
  };
  tides: {
    nextHighTide?: CoastalObservationMeasurement;
    nextLowTide?: CoastalObservationMeasurement;
    predictionsWindow?: { start?: string; end?: string };
  };
  riskFactors: {
    highTideSoon: boolean;
    observedWaterLevelAvailable: boolean;
    predictedTideAvailable: boolean;
    coastalWindAvailable: boolean;
    pressureAvailable: boolean;
    airGapAvailable: boolean;
    staleData: boolean;
    missingStation: boolean;
    noNearbyStation: boolean;
    datumExplicit: boolean;
    observedVsPredictedSeparated: boolean;
  };
  confidence: number;
  stalenessMinutes: number | null;
  limitations: string[];
  evidenceRefs: string[];
  sourceUrls: string[];
};

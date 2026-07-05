export type OsmElementType = "node" | "way" | "relation";

export type OsmPurpose =
  | "aura_medical"
  | "fenix_shelter"
  | "fenix_exposure"
  | "nav_route_context"
  | "command_center_nearby"
  | "emergency_services"
  | "logistics"
  | "incident_context"
  | "map_viewport"
  | "general";

export type OsmGeometryMode = "centroid" | "centroid_and_simple_geometry" | "full_geometry";

export type OsmTagMatcher = {
  key: string;
  value: string;
};

export type OsmCategoryDefinition = {
  id: string;
  label: string;
  group: "medical" | "emergency" | "shelter" | "nav" | "logistics" | "exposure";
  tags: OsmTagMatcher[];
  moduleUse: string[];
  defaultEnabled: boolean;
  maxRadiusKm: number;
  maxElements: number;
  geometryMode: OsmGeometryMode;
  heavy?: boolean;
  caveats: string[];
};

export type OsmPoi = {
  osmType: OsmElementType;
  osmId: number;
  name?: string;
  category: string;
  categories: string[];
  subcategory?: string;
  tags: Record<string, string>;
  latitude: number | null;
  longitude: number | null;
  geometry?: unknown;
  geometryType: "point" | "line" | "polygon" | "centroid" | "unknown";
  distanceKm?: number | null;
  address?: Record<string, string>;
  contact?: Record<string, string>;
  openingHours?: string;
  operator?: string;
  source: "osm-overpass";
  license: "ODbL";
  attribution: string;
  confidence: number;
  caveats: string[];
};

export type CriticalInfrastructureContext = {
  id: string;
  sourceId: "osm-overpass";
  sourceName: "OpenStreetMap / Overpass";
  purpose: OsmPurpose;
  generatedAt: string;
  query: {
    lat?: number;
    lon?: number;
    radiusKm?: number;
    bbox?: [number, number, number, number];
    categories: string[];
    limit: number;
    timeoutSeconds: number;
  };
  pois: OsmPoi[];
  countsByCategory: Record<string, number>;
  nearestByCategory: Record<string, OsmPoi | null>;
  medical: {
    nearestHospital: OsmPoi | null;
    nearestClinic: OsmPoi | null;
    nearestPharmacy: OsmPoi | null;
    nearestDefibrillator: OsmPoi | null;
    nearestHelipad: OsmPoi | null;
  };
  emergency: {
    nearestFireStation: OsmPoi | null;
    nearestPolice: OsmPoi | null;
    nearestAssemblyPoint: OsmPoi | null;
    shelters: OsmPoi[];
  };
  nav: {
    bridges: OsmPoi[];
    tunnels: OsmPoi[];
    fuelStations: OsmPoi[];
    chargingStations: OsmPoi[];
    roadContext: OsmPoi[];
  };
  fenix: {
    shelters: OsmPoi[];
    schools: OsmPoi[];
    communityCentres: OsmPoi[];
    buildings: OsmPoi[];
    exposureCandidates: OsmPoi[];
  };
  logistics: {
    fuel: OsmPoi[];
    water: OsmPoi[];
    supermarkets: OsmPoi[];
    aerodromes: OsmPoi[];
    ports: OsmPoi[];
  };
  coverageCaveats: string[];
  licenseAttribution: {
    attribution: string;
    license: "ODbL";
    source: "OpenStreetMap / Overpass API";
  };
  dataQualityCaveats: string[];
  cache: {
    cacheKey: string;
    ttlMinutes: number;
    fromCache: boolean;
  };
  confidence: number;
  limitations: string[];
  evidenceRefs: string[];
};

export type OsmOverpassRequestParams = {
  lat?: number;
  lon?: number;
  radiusKm?: number;
  bbox?: string | [number, number, number, number];
  purpose?: OsmPurpose | string;
  categories?: string[];
  limit?: number;
  timeoutSeconds?: number;
  persist?: boolean;
  incidentId?: string;
  routeAnalysisId?: string;
  fenixSimulationId?: string;
  includeGeometry?: boolean;
  geometryMode?: OsmGeometryMode;
  includeTags?: boolean;
  maxElements?: number;
  cacheTtlMinutes?: number;
};

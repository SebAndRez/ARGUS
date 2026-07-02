export type OfficialRouteDomain = "TERRESTRIAL" | "MARITIME" | "AERIAL";

export type OfficialRouteSourceType =
  | "GOVERNMENT"
  | "TRANSPORT_AUTHORITY"
  | "AVIATION_AUTHORITY"
  | "MARITIME_AUTHORITY"
  | "OPEN_DATA"
  | "CURATED"
  | "DEMO";

export type OfficialRouteStatus =
  | "OFFICIAL_ACTIVE"
  | "OFFICIAL_STALE"
  | "NEEDS_SOURCE"
  | "NEEDS_REVIEW"
  | "DEMO_ONLY"
  | "UNAVAILABLE";

export type OfficialRouteGeometry = {
  type: "LineString";
  coordinates: Array<[number, number]>;
};

export type OfficialRoute = {
  id: string;
  domain: OfficialRouteDomain;
  name: string;
  countryCode: string;
  sourceName: string;
  sourceUrl?: string;
  sourceType: OfficialRouteSourceType;
  status: OfficialRouteStatus;
  lastUpdatedAt?: string;
  geometry?: OfficialRouteGeometry;
  restrictions?: string[];
  notes?: string;
  isDemo: boolean;
};

export type OfficialRouteMetadata = {
  sourceType: OfficialRouteSourceType;
  officialStatus: OfficialRouteStatus;
  isDemo: boolean;
  disclaimer: string;
};


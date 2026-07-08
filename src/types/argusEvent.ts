/**
 * ARGUS EVENT — global operational standard.
 *
 * This is the country-agnostic contract produced by the proactive ingestion
 * pipeline (official sources + news/OSINT + citizen reports) once correlated
 * (see `@/lib/correlation/argusCorrelationEngine`). It is distinct from:
 * - `ArgusNormalizedEvent` (`@/types/ingestion`): raw per-source normalization
 *   for the existing global automated feeds (USGS, GDACS, NASA FIRMS, ...).
 * - `ConflictZone` / `ConflictEvent` (`@/types/conflictZone`): dedicated to
 *   armed conflict / geopolitical risk, kept as-is.
 * - `CrisisEvent` (`@/types/crisis`): citizen-submitted reports/SOS/alerts.
 *
 * `ArgusEvent` covers hazard/official-alert style events (weather, floods,
 * landslides, road disruption, quakes, wildfires, etc.) built from official
 * sources and/or news, with explicit governance over who said what — see
 * `sourceType` / `attribution` / `officialAuthorityMentioned` below.
 */

export type ArgusEventType =
  | "OFFICIAL_ALERT"
  | "SEVERE_WEATHER"
  | "HEAVY_RAIN"
  | "FLOOD"
  | "LANDSLIDE"
  | "ROAD_CLOSURE"
  | "EARTHQUAKE"
  | "TSUNAMI"
  | "VOLCANIC_ACTIVITY"
  | "WILDFIRE"
  | "POWER_OUTAGE"
  | "CIVIL_UNREST"
  | "CONFLICT"
  | "HEALTH_EMERGENCY"
  | "INFRASTRUCTURE_FAILURE"
  | "NEWS_REPORTED_INCIDENT"
  | "CITIZEN_REPORT"
  | "RISK_ZONE";

export type ArgusSeverity = "info" | "low" | "medium" | "high" | "critical";

export type ArgusEventStatus =
  | "observation"
  | "risk"
  | "active"
  | "confirmed"
  | "monitoring"
  | "resolved"
  | "archived";

/**
 * `medium_high` exists specifically for the "news citing an official
 * authority" case (Caso B) — stronger than a bare press report, but not yet
 * a directly-consumed official source.
 */
export type ArgusConfidence = "low" | "medium" | "medium_high" | "high" | "verified";

/**
 * Governs attribution. `official` / `technical` mean ARGUS consumed the
 * authority's own feed directly (Caso A). `news` / `regional_news` mean
 * ARGUS read a media report — even if that report cites an official
 * authority, the attribution stays with the outlet and
 * `officialAuthorityMentioned` + `needsOfficialConfirmation` record the
 * mention (Caso B). Never blend the two.
 */
export type ArgusSourceType =
  | "official"
  | "technical"
  | "news"
  | "regional_news"
  | "municipal"
  | "social_official"
  | "citizen"
  | "global_feed"
  | "model_context";

export type ArgusGeometryPrecision =
  | "exact_point"
  | "approximate_point"
  | "administrative_region"
  | "administrative_commune"
  | "route_segment"
  | "river_basin"
  | "polygon_official"
  | "polygon_estimated"
  | "buffer_estimated";

export type ArgusGeometry =
  | { type: "point"; coordinates: [latitude: number, longitude: number] }
  | { type: "polygon"; coordinates: Array<[latitude: number, longitude: number]> }
  | { type: "route"; coordinates: Array<[latitude: number, longitude: number]> }
  | {
      /**
       * Used when ARGUS knows the affected administrative regions but has no
       * official polygon boundary to draw. `anchor` is a representative point
       * for camera-centering. `polygonEstimate`, if present, is a
       * hand-drawn/estimated buffer around those regions for visualization —
       * never an official boundary (see `geometryPrecision`).
       */
      type: "region_reference";
      anchor: [latitude: number, longitude: number];
      regionNames: string[];
      polygonEstimate?: Array<[latitude: number, longitude: number]>;
    };

export interface ArgusSourceReference {
  sourceId: string;
  sourceName: string;
  sourceType: ArgusSourceType;
  url?: string;
  publishedAt?: string;
  excerpt?: string;
  /** Official authorities named inside this specific source's content. */
  officialAuthorityMentioned?: string[];
}

export interface ArgusEvent {
  id: string;
  title: string;
  country: string;
  region?: string;
  province?: string;
  commune?: string;
  eventType: ArgusEventType;
  severity: ArgusSeverity;
  status: ArgusEventStatus;
  confidence: ArgusConfidence;
  sourceType: ArgusSourceType;
  sources: ArgusSourceReference[];
  geometry: ArgusGeometry;
  geometryPrecision: ArgusGeometryPrecision;
  validFrom?: string;
  validUntil?: string;
  detectedAt: string;
  lastUpdated: string;
  /** Who ARGUS is attributing this event to — the direct authority (Caso A) or the outlet (Caso B). */
  attribution: string;
  officialAuthorityMentioned?: string[];
  needsOfficialConfirmation?: boolean;
  operationalSummary: string;
  recommendedActions?: string[];
  /** IDs of other `ArgusEvent`s this one was correlated against. */
  relatedSignals?: string[];
  tags?: string[];
  isDemo?: boolean;
}

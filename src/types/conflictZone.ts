import type { NewsEvidence } from "@/types/newsEvidence";

export type ConflictGeometryType = "point" | "polygon" | "bbox";
export type ConflictRiskLevel = "low" | "medium" | "high" | "critical";
export type ConflictZoneType =
  | "war_zone"
  | "disputed_control"
  | "occupied_area"
  | "recent_attack_area"
  | "humanitarian_crisis"
  | "border_tension"
  | "terrorism_risk"
  | "civil_unrest"
  | "disaster_confirmed";
export type TerritorialControlStatus =
  | "reported_control"
  | "disputed"
  | "occupied"
  | "contested"
  | "unknown";
export type ConflictConfidence = "low" | "medium" | "high";
export type ConflictEventType =
  | "airstrike"
  | "shelling"
  | "artillery"
  | "drone"
  | "missile"
  | "ied_explosion"
  | "armed_clash"
  | "violent_unrest"
  | "infrastructure_attack"
  | "humanitarian_alert"
  | "confirmed_disaster";

export type ConflictCoordinates =
  | [latitude: number, longitude: number]
  | Array<[latitude: number, longitude: number]>
  | {
      north: number;
      south: number;
      east: number;
      west: number;
    };

export interface ConflictSourceLink {
  sourceName: string;
  sourceTier: "official" | "technical" | "major_media" | "osint" | "unknown";
  url?: string;
  summary: string;
}

export interface ConflictZone {
  id: string;
  name: string;
  region: string;
  country: string;
  geometryType: ConflictGeometryType;
  coordinates: ConflictCoordinates;
  riskLevel: ConflictRiskLevel;
  zoneType: ConflictZoneType;
  controlStatus?: TerritorialControlStatus;
  controlledBy?: string;
  confidence: ConflictConfidence;
  lastUpdatedAt: string;
  lastReviewedAt: string;
  sources: ConflictSourceLink[];
  summary: string;
  recommendedAction: string;
  isActive: boolean;
}

export interface ConflictEvent {
  id: string;
  title: string;
  eventType: ConflictEventType;
  lat: number;
  lng: number;
  country: string;
  region: string;
  occurredAt: string;
  sourceName: string;
  sourceUrl?: string;
  confidence: ConflictConfidence;
  severity: ConflictRiskLevel;
  relatedZoneId?: string;
  rawProvider?: "gdelt" | "reliefweb" | "manual_curated" | "acled" | "liveuamap";
}

export interface ConflictProximityWarning {
  id: string;
  level: "info" | "warning" | "danger" | "critical";
  distanceKm: number;
  title: string;
  reason: string;
  recommendedAction: string;
  zone?: ConflictZone;
  event?: ConflictEvent;
}

export interface ConflictIntelligenceSnapshot {
  zones: ConflictZone[];
  events: ConflictEvent[];
  newsEvidence: NewsEvidence[];
}

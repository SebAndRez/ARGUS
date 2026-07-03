export type ArgusNotificationSeverity =
  | "P0_CRITICAL"
  | "P1_HIGH"
  | "P2_MEDIUM"
  | "P3_LOW"
  | "P4_INFO";

export type ArgusNotificationScope =
  | "LOCAL"
  | "NATIONAL"
  | "INTERNATIONAL"
  | "GLOBAL";

export type ArgusNotificationType =
  | "EARTHQUAKE"
  | "TSUNAMI"
  | "FIRE"
  | "WEATHER"
  | "FLOOD"
  | "VOLCANO"
  | "CONFLICT"
  | "ROUTE"
  | "MEDICAL"
  | "SOS"
  | "REPORT"
  | "MISSING_PERSON"
  | "SENSOR"
  | "FENIX"
  | "SOURCE_UPDATE"
  | "SYSTEM";

export type ArgusNotificationStatus =
  | "NEW"
  | "UPDATED"
  | "MONITORING"
  | "RESOLVED"
  | "DISMISSED";

export type ArgusNotificationSourceType =
  | "OFFICIAL"
  | "OPEN_DATA"
  | "CITIZEN"
  | "ARGUS_ESTIMATE"
  | "INSTITUTIONAL"
  | "SYSTEM";

export interface ArgusNotificationAction {
  id: string;
  label: string;
  url: string;
  kind: "map" | "source" | "fenix" | "route" | "report" | "event" | "system";
  primary?: boolean;
}

export interface ArgusNotification {
  id: string;
  title: string;
  description: string;
  type: ArgusNotificationType;
  severity: ArgusNotificationSeverity;
  scope: ArgusNotificationScope;
  status: ArgusNotificationStatus;
  createdAt: string;
  updatedAt: string;
  eventTime: string;
  sourceType: ArgusNotificationSourceType;
  sourceName: string;
  confidence: number;
  lat: number | null;
  lng: number | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  distanceKm: number | null;
  relatedEventId: string | null;
  relatedReportId: string | null;
  relatedIncidentId: string | null;
  relatedFenixScenarioId: string | null;
  relatedRouteId: string | null;
  actionUrl: string;
  actions: ArgusNotificationAction[];
  icon: string;
  colorToken: string;
  isRead: boolean;
  isPinned: boolean;
}

export interface ArgusNotificationSummary {
  total: number;
  unread: number;
  critical: number;
  high: number;
  local: number;
  national: number;
  international: number;
  global: number;
  latestAt: string | null;
}

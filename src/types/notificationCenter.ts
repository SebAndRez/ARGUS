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
  | "REMINDER"
  | "SHELTER"
  | "CONNECTIVITY"
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

/**
 * Canonical classification of *what a notification is*, independent of its
 * `severity` and `verificationStatus` (Prompt 11 §5-§6 — these three
 * dimensions must never collapse into one field). This is the field clients
 * should read to decide how to label/badge a notification; `sourceType`
 * remains as raw provenance (who technically produced it) but is no longer
 * the primary classification signal — see `classifyNotification()` in
 * `src/lib/notifications/notificationCenterEngine.ts`, the single place this
 * is computed for every notification builder.
 */
export type NotificationCategory =
  | "official_alert"
  | "confirmed_incident"
  | "candidate_signal"
  | "citizen_report"
  | "argus_analysis"
  | "prediction"
  | "recommendation"
  | "source_health"
  | "preparedness_reminder"
  | "system_notice"
  | "demo";

/**
 * How well-corroborated a notification's underlying claim is — a dimension
 * distinct from `category` (what it is) and `severity` (how bad it is).
 * Absent for categories where verification doesn't apply conceptually
 * (`source_health`, `preparedness_reminder`, `system_notice`, `demo`) rather
 * than forced into a placeholder value.
 */
export type VerificationStatus =
  | "unverified"
  | "candidate"
  | "corroborated"
  | "official"
  | "model_generated"
  | "rejected";

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
  /**
   * Explicit structural demo marker — set by `finalize()` in
   * `notificationCenterEngine.ts` from `canonicalizeDemoLikeNotification`'s
   * `isDemoLike` verdict (src/lib/security/demoDataGuard.ts), never derived
   * from title/sourceName text at the call site. Optional/absent means
   * "not demo-like" for every real notification.
   */
  isDemo?: boolean;
  /** Canonical classification — see `NotificationCategory`. Always serialized. */
  category: NotificationCategory;
  /**
   * See `VerificationStatus`. Absent (not a placeholder value) for
   * categories where verification doesn't apply — `source_health`,
   * `preparedness_reminder`, `system_notice`, `demo`.
   */
  verificationStatus?: VerificationStatus;
  /**
   * Derived, never elevated by severity alone (Prompt 11 §6-§7): true only
   * for `category: "official_alert"` backed by a recognized official source
   * and never true for `demo`/`prediction` regardless of confidence or
   * severity.
   */
  isOfficial: boolean;
}

export interface ArgusNotificationSummary {
  total: number;
  unread: number;
  /**
   * Only `category: "official_alert"` / `"confirmed_incident"` that are
   * operationally active (see `isActiveForCriticalCount` in
   * `notificationCenterEngine.ts`) count here — predictions, analysis,
   * candidates, source health, reminders and demo items never do, regardless
   * of `severity` (Prompt 11 §13).
   */
  critical: number;
  high: number;
  local: number;
  national: number;
  international: number;
  global: number;
  latestAt: string | null;
  /** Count of notifications per canonical category, computed from the same list as the fields above. */
  byCategory: Record<NotificationCategory, number>;
}

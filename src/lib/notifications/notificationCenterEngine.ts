import type { CrisisEvent } from "@/types/crisis";
import type { ArgusNormalizedEvent } from "@/types/ingestion";
import type { ConflictEvent, ConflictZone } from "@/types/conflictZone";
import type { ArgusRoute } from "@/types/map";
import type {
  ArgusNotification,
  ArgusNotificationAction,
  ArgusNotificationScope,
  ArgusNotificationSeverity,
  ArgusNotificationSourceType,
  ArgusNotificationStatus,
  ArgusNotificationSummary,
  ArgusNotificationType,
  NotificationCategory,
  VerificationStatus,
} from "@/types/notificationCenter";
import {
  getNotificationColorToken,
  getNotificationIcon,
  severityOrder,
} from "@/lib/notifications/notificationVisuals";
import { canonicalizeGdacsSeverity } from "@/lib/vigia/gdacsSeverity";
import { canonicalizeDemoLikeNotification } from "@/lib/security/demoDataGuard";
import { classifyLifecycleVisibility } from "@/lib/lifecycle/operationalVisibilityPolicy";

type VestaReminderItem = {
  id: string;
  title: string;
  dueAt: Date | string;
  status: string;
};

/**
 * Loose projection of a `KnowledgeIncident` row (`prisma/schema.prisma`) —
 * intentionally not importing the Prisma type here so this module stays
 * decoupled from the DB client; the caller (`/api/notifications`) is
 * responsible for querying and shaping this from `prisma.knowledgeIncident`.
 */
export type KnowledgeIncidentItem = {
  id: string;
  externalId?: string | null;
  title: string;
  summary: string;
  domain: string;
  subtype?: string | null;
  severity: string;
  confidenceScore: number;
  sourceId: string;
  sourceName: string;
  country?: string | null;
  region?: string | null;
  locality?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  occurredAt?: Date | string | null;
  detectedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  tagsJson?: unknown;
  technicalFactorsJson?: unknown;
  impactJson?: unknown;
  casualtiesJson?: unknown;
};

/**
 * Proyeccion de un refugio (`CriticalPoi` categoria "shelter" +
 * `CriticalPoiOperationalStatus`) que amerita una alerta operacional (lleno,
 * cerrado, comprometido, ruta cortada o dato desactualizado — spec ARGUS
 * v1.0.3.4 §18). El caller (`/api/notifications`) es responsable de aplicar
 * el filtro de "amerita alerta"; este tipo solo describe la forma minima
 * necesaria para renderizar la notificacion.
 */
export type ShelterOperationalAlertItem = {
  poiId: string;
  poiName: string;
  latitude: number | null;
  longitude: number | null;
  countryCode?: string | null;
  shelterStatus: string;
  routeStatus?: string | null;
  isStale: boolean;
  sourceType: string;
  sourceName: string;
  confidence: number;
  lastUpdatedAt: Date | string;
};

/**
 * Transicion de conectividad de emergencia (ARGUS v1.0.3.6 §16) que amerita
 * notificacion — el caller (`/api/notifications`) deriva `alertReason` a
 * partir del `eventType` mas reciente en `TelecomConnectivityEvidence` para
 * la region, mismo split de responsabilidad que `ShelterOperationalAlertItem`
 * (este tipo solo describe la forma minima para renderizar la notificacion).
 */
export type ConnectivityAlertItem = {
  regionKey: string;
  adminLevel1: string;
  adminLevel2?: string | null;
  latitude: number | null;
  longitude: number | null;
  countryCode?: string | null;
  roamingType: string;
  networkState: string;
  isStale: boolean;
  verificationStatus: string;
  sourceType: string;
  sourceName: string;
  confidence: number;
  lastUpdatedAt: Date | string;
  alertReason: "activated" | "expanded" | "ended" | "degraded" | "outage" | "restored" | "point_added" | "marked_stale";
};

type SourceHealthItem = {
  id?: string;
  sourceId?: string;
  name?: string;
  sourceName?: string;
  status?: string;
  lastKnownStatus?: string;
  warnings?: string[];
  isOfficial?: boolean;
  persistedCount?: number;
  latestIngestionRun?: {
    status?: string;
    error?: string | null;
    fetchedAt?: Date | string;
  } | null;
};

export interface BuildNotificationInput {
  events?: CrisisEvent[];
  externalEvents?: ArgusNormalizedEvent[];
  conflictEvents?: ConflictEvent[];
  conflictZones?: ConflictZone[];
  routes?: ArgusRoute[];
  sourceHealth?: SourceHealthItem[];
  reminders?: VestaReminderItem[];
  /**
   * `KnowledgeIncident` rows (tornado, structural collapse, severe weather,
   * official alerts ingested through the knowledge-intake pipeline, etc).
   * The caller may pass any subset it likes — `buildArgusNotifications`
   * itself only turns `severity: "high" | "critical"` rows into
   * notifications (see `isNotifiableKnowledgeSeverity` below), so lower
   * severities passed in are silently dropped rather than trusted to the
   * caller's query.
   */
  knowledgeIncidents?: KnowledgeIncidentItem[];
  shelterAlerts?: ShelterOperationalAlertItem[];
  connectivityAlerts?: ConnectivityAlertItem[];
  readIds?: string[];
  userLocation?: { lat: number; lng: number; countryCode?: string | null };
}

const DEFAULT_COUNTRY = "CL";
const OFFICIAL_KNOWLEDGE_SOURCES = new Set([
  "senapred_eventos",
  "usgs_earthquake",
  "gdacs",
  "nasa-eonet",
  "nws",
  "noaa-ncei-tsunami",
  "noaa-storm-events",
  "who-don",
  "smithsonian-gvp",
  "usgs-volcano-hans",
]);

function toIso(value: Date | string | null | undefined, fallback = new Date()) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return fallback.toISOString();
}

function toFiniteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function calculateDistanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
) {
  const earthRadiusKm = 6371;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function scopeForLocation(
  lat: number | null,
  lng: number | null,
  countryCode: string | null,
  userLocation?: BuildNotificationInput["userLocation"]
): ArgusNotificationScope {
  if (lat === null || lng === null) return "GLOBAL";
  if (userLocation) {
    const distanceKm = calculateDistanceKm(userLocation, { lat, lng });
    if (distanceKm <= 75) return "LOCAL";
    if (
      countryCode &&
      userLocation.countryCode &&
      countryCode.toUpperCase() === userLocation.countryCode.toUpperCase()
    ) {
      return "NATIONAL";
    }
  }
  if (!countryCode) return "INTERNATIONAL";
  if (countryCode.toUpperCase() === DEFAULT_COUNTRY) {
    return "NATIONAL";
  }
  return "INTERNATIONAL";
}

function mapSeverity(value: string | null | undefined): ArgusNotificationSeverity {
  const normalized = value?.toLowerCase();
  if (normalized === "critical" || normalized === "p0_critical") return "P0_CRITICAL";
  if (normalized === "high" || normalized === "p1_high") return "P1_HIGH";
  if (normalized === "medium" || normalized === "p2_medium") return "P2_MEDIUM";
  if (normalized === "low" || normalized === "p3_low") return "P3_LOW";
  return "P4_INFO";
}

function mapStatus(value: string | null | undefined): ArgusNotificationStatus {
  const normalized = value?.toLowerCase();
  if (normalized === "resolved" || normalized === "cancelled") return "RESOLVED";
  if (normalized === "discarded" || normalized === "dismissed") return "DISMISSED";
  if (normalized === "under_review" || normalized === "assigned" || normalized === "escalated") {
    return "MONITORING";
  }
  if (normalized === "validated" || normalized === "updated") return "UPDATED";
  return "NEW";
}

/**
 * Report/HelpRequest moderation status → `VerificationStatus`. A citizen
 * report never reaches `"official"` through this path alone (Prompt 11
 * §7/§19) — at most `"corroborated"` once validated/escalated/assigned.
 */
function verificationForReportStatus(status: string | null | undefined): VerificationStatus {
  const normalized = status?.toUpperCase();
  if (normalized === "DISCARDED" || normalized === "CANCELLED") return "rejected";
  if (
    normalized === "VALIDATED" ||
    normalized === "ESCALATED" ||
    normalized === "RESOLVED" ||
    normalized === "ASSIGNED"
  ) {
    return "corroborated";
  }
  return "unverified";
}

function typeFromCategory(category: string | null | undefined, fallback: ArgusNotificationType) {
  const normalized = category?.toLowerCase() ?? "";
  if (normalized.includes("earthquake") || normalized.includes("sismo")) return "EARTHQUAKE";
  if (normalized.includes("tsunami")) return "TSUNAMI";
  if (normalized.includes("fire") || normalized.includes("incendio") || normalized.includes("wildfire")) return "FIRE";
  if (
    normalized.includes("weather") ||
    normalized.includes("clima") ||
    normalized.includes("storm") ||
    normalized.includes("tornado") ||
    normalized.includes("waterspout") ||
    normalized.includes("tromba") ||
    normalized.includes("severe_wind") ||
    normalized.includes("viento") ||
    normalized.includes("hurricane") ||
    normalized.includes("cyclone")
  ) {
    return "WEATHER";
  }
  if (normalized.includes("flood") || normalized.includes("inund")) return "FLOOD";
  if (normalized.includes("volcano") || normalized.includes("volcan")) return "VOLCANO";
  if (normalized.includes("medical") || normalized.includes("medic")) return "MEDICAL";
  if (normalized.includes("missing_person")) return "MISSING_PERSON";
  if (normalized.includes("conflict") || normalized.includes("war")) return "CONFLICT";
  return fallback;
}

/**
 * Minimum rule requested for P0: a `KnowledgeIncident` only becomes a
 * notification once it has reached "high" or "critical" severity — tornado,
 * structural/roof/bridge collapse with occupants, trapped people, and
 * confirmed severe-weather/official-alert domains are expected to already
 * carry that severity by the time they reach this function (see the
 * per-source severity mapping in `src/lib/knowledge-intake/adapters/*` and
 * `src/lib/adapters/senapred/senapredEventosAdapter.ts`).
 */
function isNotifiableKnowledgeSeverity(severity: string | null | undefined): boolean {
  const normalized = severity?.toLowerCase();
  return normalized === "high" || normalized === "critical";
}

function sourceTypeForExternal(event: ArgusNormalizedEvent): ArgusNotificationSourceType {
  if (["usgs_earthquake", "noaa_tsunami", "noaa-ncei-tsunami", "nws"].includes(event.sourceId)) {
    return "OFFICIAL";
  }
  return "OPEN_DATA";
}

function sourceTypeForKnowledge(incident: KnowledgeIncidentItem): ArgusNotificationSourceType {
  if (OFFICIAL_KNOWLEDGE_SOURCES.has(incident.sourceId)) return "OFFICIAL";
  if (incident.sourceId === "nasa_firms" || incident.sourceId === "copernicus_effis" || incident.sourceId === "copernicus_ems") {
    return "OPEN_DATA";
  }
  return "ARGUS_ESTIMATE";
}

function statusForKnowledge(incident: KnowledgeIncidentItem): ArgusNotificationStatus {
  const tags = Array.isArray(incident.tagsJson) ? incident.tagsJson.map(String) : [];
  const technicalFactors = incident.technicalFactorsJson && typeof incident.technicalFactorsJson === "object"
    ? incident.technicalFactorsJson as Record<string, unknown>
    : {};
  const lifecycle = typeof technicalFactors.lifecycle === "string" ? technicalFactors.lifecycle : null;
  if (tags.includes("lifecycle:cancelled") || lifecycle === "resolved" || lifecycle === "archived") return "RESOLVED";
  if (tags.includes("lifecycle:modified") || lifecycle === "monitoring" || lifecycle === "contained") return "UPDATED";
  return "MONITORING";
}

function buildActions(notification: {
  type: ArgusNotificationType;
  lat: number | null;
  lng: number | null;
  actionUrl: string;
  sourceUrl?: string | null;
  relatedRouteId?: string | null;
  relatedReportId?: string | null;
}) {
  const actions: ArgusNotificationAction[] = [
    {
      id: "map",
      label: "Ir al mapa",
      url: notification.actionUrl,
      kind: "map",
      primary: true,
    },
  ];

  if (notification.sourceUrl) {
    actions.push({
      id: "source",
      label: "Ver fuente",
      url: notification.sourceUrl,
      kind: "source",
    });
  } else if (notification.relatedRouteId) {
    actions.push({
      id: "route",
      label: "Ver ruta",
      url: `/app?routeId=${encodeURIComponent(notification.relatedRouteId)}`,
      kind: "route",
    });
  } else if (notification.relatedReportId) {
    actions.push({
      id: "report",
      label: "Ver reporte",
      url: `/app?eventId=${encodeURIComponent(notification.relatedReportId)}`,
      kind: "report",
    });
  } else if (notification.lat !== null && notification.lng !== null) {
    actions.push({
      id: "fenix",
      label: "Abrir Fenix",
      url: `/dashboard/fenix?lat=${notification.lat}&lng=${notification.lng}`,
      kind: "fenix",
    });
  }

  return actions;
}

/**
 * ARGUS v1.0.3.3 — every notification, of every type, funnels through this
 * single choke point, so demo/placeholder canonicalization is enforced here
 * rather than duplicated per `*ToNotification` builder. Caps `severity`
 * (which also drives `isPinned` below) and remaps `sourceType` away from
 * `category=official` for demo-like content in production — see
 * `canonicalizeDemoLikeNotification` for the exact rule and why "test"-style
 * common words never trip it from free text alone.
 */
function finalize(
  partial: Omit<ArgusNotification, "icon" | "colorToken" | "isRead" | "isPinned" | "actions"> & {
    sourceUrl?: string | null;
  },
  readIds: Set<string>
): ArgusNotification {
  const { sourceUrl: _sourceUrl, ...notificationFields } = partial;
  void _sourceUrl;
  const demoPatch = canonicalizeDemoLikeNotification({
    severity: partial.severity,
    sourceType: partial.sourceType,
    title: partial.title,
    description: partial.description,
    sourceName: partial.sourceName,
    relatedIncidentId: partial.relatedIncidentId,
    relatedEventId: partial.relatedEventId,
    sourceUrl: partial.sourceUrl,
    // Explicit structural flag always wins inside `isDemoLikeSource` — this
    // is what lets demoEvents/demoRoutes be recognized as demo without
    // relying on "demo" appearing somewhere in sourceName/title text.
    isDemo: partial.isDemo ?? null,
  });
  const severity = demoPatch.severity;
  const sourceType = demoPatch.sourceType;
  // Prompt 11 §8.8/§18: a demo-like item is always `category: "demo"`,
  // `isOfficial: false`, and has no meaningful verification status — this
  // overrides whatever the builder computed from the (pre-demo-check) raw
  // source signal, the same way `severity`/`sourceType` are already capped
  // above. Never the other direction: a genuinely official/confirmed item
  // that isn't demo-like keeps the category the builder assigned.
  const category = demoPatch.isDemoLike ? "demo" : partial.category;
  const verificationStatus = demoPatch.isDemoLike ? undefined : partial.verificationStatus;
  const isOfficial = demoPatch.isDemoLike ? false : partial.isOfficial;
  const actions = buildActions({
    type: partial.type,
    lat: partial.lat,
    lng: partial.lng,
    actionUrl: partial.actionUrl,
    sourceUrl: partial.sourceUrl,
    relatedRouteId: partial.relatedRouteId,
    relatedReportId: partial.relatedReportId,
  });

  return {
    ...notificationFields,
    severity,
    sourceType,
    // Canonical demo verdict, independent of whatever value (if any) the
    // caller passed in — this is what `/api/notifications` filters on to
    // exclude unauthorized demo data before slots/priority/summary are
    // computed, so it must reflect the guard's own detection, not just the
    // caller's raw flag.
    isDemo: demoPatch.isDemoLike,
    category,
    verificationStatus,
    isOfficial,
    actions,
    icon: getNotificationIcon(partial.type),
    colorToken: getNotificationColorToken(severity),
    isRead: readIds.has(partial.id),
    isPinned:
      severity === "P0_CRITICAL" &&
      partial.status !== "RESOLVED" &&
      partial.status !== "DISMISSED",
  };
}

/**
 * Fenix demo scenarios only cover wildfire, coastal tsunami and urban flood
 * (`src/data/fenixDemo.ts`) — pointing every notification type at the
 * wildfire scenario regardless of hazard was misleading (a flood or civil
 * unrest notification linking to a wildfire preview). Returns `null` when no
 * matching scenario exists rather than falling back to wildfire.
 */
function fenixScenarioIdForType(type: ArgusNotificationType): string | null {
  if (type === "FIRE") return "fenix-wildfire-urban-edge";
  if (type === "TSUNAMI") return "fenix-coastal-tsunami";
  if (type === "FLOOD") return "fenix-urban-flood";
  return null;
}

function eventToNotification(
  event: CrisisEvent,
  readIds: Set<string>,
  userLocation?: BuildNotificationInput["userLocation"]
) {
  const lat = toFiniteNumber(event.latitude);
  const lng = toFiniteNumber(event.longitude);
  const eventTime = toIso(event.createdAt);
  const updatedAt = toIso(event.updatedAt, new Date(eventTime));
  const type =
    event.type === "SOS"
      ? "SOS"
      : typeFromCategory(event.category, event.type === "ALERT" ? "SYSTEM" : "REPORT");
  const countryCode = event.locationText?.includes("Chile") ? "CL" : null;
  const distanceKm =
    userLocation && lat !== null && lng !== null
      ? calculateDistanceKm(userLocation, { lat, lng })
      : null;
  // Prompt 11 §19: a citizen report/help request never auto-promotes to
  // `confirmed_incident`/`official_alert` here — at most `corroborated`
  // once the Report/HelpRequest moderation status reflects validation.
  const isCitizenSourced = event.type === "SOS" || event.type === "REPORT";

  return finalize(
    {
      id: `argus-event-${event.id}`,
      title: event.title,
      description: event.aiSummary ?? event.description,
      type,
      severity: mapSeverity(event.severity),
      scope: scopeForLocation(lat, lng, countryCode, userLocation),
      status: mapStatus(event.status),
      createdAt: eventTime,
      updatedAt,
      eventTime,
      sourceType: isCitizenSourced ? "CITIZEN" : "ARGUS_ESTIMATE",
      category: isCitizenSourced ? "citizen_report" : "system_notice",
      verificationStatus: isCitizenSourced ? verificationForReportStatus(event.status) : undefined,
      isOfficial: false,
      sourceName: event.isDemo ? "ARGUS demo events" : event.type === "SOS" ? "ARGUS SOS" : "ARGUS reportes",
      confidence: Math.max(0, Math.min(100, Number(event.aiConfidence ?? event.confidence ?? 60))),
      lat,
      lng,
      countryCode,
      region: null,
      city: event.locationText ?? null,
      distanceKm,
      relatedEventId: event.id,
      relatedReportId: event.recordType === "Report" || event.type === "REPORT" ? event.id : null,
      relatedIncidentId: event.recordType === "HelpRequest" || event.type === "SOS" ? event.id : null,
      relatedFenixScenarioId: lat !== null && lng !== null ? fenixScenarioIdForType(type) : null,
      relatedRouteId: null,
      actionUrl:
        lat !== null && lng !== null
          ? `/app?lat=${lat}&lng=${lng}&notificationId=argus-event-${event.id}`
          : `/app?eventId=${encodeURIComponent(event.id)}`,
      sourceUrl: null,
      isDemo: event.isDemo,
    },
    readIds
  );
}

function externalToNotification(
  event: ArgusNormalizedEvent,
  readIds: Set<string>,
  userLocation?: BuildNotificationInput["userLocation"]
) {
  const lat = toFiniteNumber(event.latitude);
  const lng = toFiniteNumber(event.longitude);
  const eventTime = toIso(event.occurredAt);
  const updatedAt = toIso(event.updatedAt, new Date(eventTime));
  const countryCode = event.country ?? null;
  const distanceKm =
    userLocation && lat !== null && lng !== null
      ? calculateDistanceKm(userLocation, { lat, lng })
      : null;
  const type = typeFromCategory(event.category, "SYSTEM");
  const officialSource = sourceTypeForExternal(event) === "OFFICIAL";

  return finalize(
    {
      id: `external-${event.sourceId}-${event.externalId || event.id}`,
      title: event.title,
      description: event.description || event.whyItMatters || "Evento externo normalizado por ARGUS.",
      type,
      severity: mapSeverity(event.severity),
      scope: scopeForLocation(lat, lng, countryCode, userLocation),
      status: "MONITORING",
      createdAt: eventTime,
      updatedAt,
      eventTime,
      sourceType: sourceTypeForExternal(event),
      category: officialSource ? "official_alert" : "confirmed_incident",
      verificationStatus: officialSource ? "official" : "corroborated",
      isOfficial: officialSource,
      sourceName: event.sourceName,
      confidence: Math.max(0, Math.min(100, Number(event.confidence ?? 70))),
      lat,
      lng,
      countryCode,
      region: event.locationName ?? null,
      city: event.locationName ?? null,
      distanceKm,
      relatedEventId: event.id,
      relatedReportId: null,
      relatedIncidentId: null,
      relatedFenixScenarioId: lat !== null && lng !== null ? fenixScenarioIdForType(type) : null,
      relatedRouteId: null,
      actionUrl:
        lat !== null && lng !== null
          ? `/app?lat=${lat}&lng=${lng}&notificationId=external-${event.sourceId}-${event.externalId || event.id}`
          : `/app?eventId=${encodeURIComponent(event.id)}`,
      sourceUrl: event.url ?? null,
    },
    readIds
  );
}

function conflictToNotification(
  event: ConflictEvent,
  readIds: Set<string>,
  userLocation?: BuildNotificationInput["userLocation"]
) {
  const eventTime = toIso(event.occurredAt);
  const distanceKm = userLocation
    ? calculateDistanceKm(userLocation, { lat: event.lat, lng: event.lng })
    : null;
  // Curated/hand-maintained conflict entries (`src/data/conflictZones.ts`)
  // are preliminary signal pending validation, never a corroborated feed —
  // see the `event-gaza-humanitarian-alert` root cause documented in
  // `demoDataGuard.ts`. Only genuinely fed (non-curated) entries count as
  // `confirmed_incident`.
  const isCurated = event.rawProvider === "manual_curated";

  return finalize(
    {
      id: `conflict-${event.id}`,
      title: event.title,
      description: `${event.eventType.replace(/_/g, " ")} reportado por ${event.sourceName}.`,
      type: "CONFLICT",
      severity: mapSeverity(event.severity),
      scope: scopeForLocation(event.lat, event.lng, event.country, userLocation),
      status: "MONITORING",
      createdAt: eventTime,
      updatedAt: eventTime,
      eventTime,
      sourceType: isCurated ? "ARGUS_ESTIMATE" : "OPEN_DATA",
      category: isCurated ? "candidate_signal" : "confirmed_incident",
      verificationStatus: isCurated ? "candidate" : "corroborated",
      isOfficial: false,
      sourceName: event.sourceName,
      confidence: event.confidence === "high" ? 85 : event.confidence === "medium" ? 65 : 45,
      lat: event.lat,
      lng: event.lng,
      countryCode: event.country,
      region: event.region,
      city: null,
      distanceKm,
      relatedEventId: event.id,
      relatedReportId: null,
      relatedIncidentId: event.relatedZoneId ?? null,
      // CONFLICT has no matching Fenix demo scenario (wildfire/tsunami/flood only).
      relatedFenixScenarioId: null,
      relatedRouteId: null,
      actionUrl: `/app?lat=${event.lat}&lng=${event.lng}&notificationId=conflict-${event.id}`,
      sourceUrl: event.sourceUrl ?? null,
    },
    readIds
  );
}

function routeToNotification(route: ArgusRoute, readIds: Set<string>) {
  const [firstPoint] = route.coordinates;
  const lat = firstPoint?.[0] ?? null;
  const lng = firstPoint?.[1] ?? null;
  const demoRouteTime = "2026-06-16T08:00:00.000Z";

  return finalize(
    {
      id: `route-${route.id}`,
      title: route.title,
      description: route.description ?? `Ruta ${route.type} disponible para inteligencia operacional.`,
      type: "ROUTE",
      severity: route.isDemo ? "P4_INFO" : "P3_LOW",
      scope: "NATIONAL",
      status: "MONITORING",
      createdAt: demoRouteTime,
      updatedAt: demoRouteTime,
      eventTime: demoRouteTime,
      sourceType: "ARGUS_ESTIMATE",
      category: "system_notice",
      verificationStatus: undefined,
      isOfficial: false,
      sourceName: "ARGUS Routing Intelligence demo",
      confidence: Math.max(0, Math.min(100, Number(route.confidence ?? 60))),
      lat,
      lng,
      countryCode: DEFAULT_COUNTRY,
      region: null,
      city: null,
      distanceKm: null,
      relatedEventId: null,
      relatedReportId: null,
      relatedIncidentId: null,
      relatedFenixScenarioId: null,
      relatedRouteId: route.id,
      actionUrl:
        lat !== null && lng !== null
          ? `/app?lat=${lat}&lng=${lng}&notificationId=route-${route.id}`
          : `/app?routeId=${route.id}`,
      sourceUrl: null,
      isDemo: route.isDemo,
    },
    readIds
  );
}

function reminderToNotification(reminder: VestaReminderItem, readIds: Set<string>) {
  const dueDate = new Date(reminder.dueAt);
  const overdueDays = Math.floor((Date.now() - dueDate.getTime()) / (24 * 60 * 60 * 1000));
  const severity: ArgusNotificationSeverity = overdueDays > 14 ? "P2_MEDIUM" : overdueDays > 0 ? "P3_LOW" : "P4_INFO";
  const time = toIso(dueDate);

  return finalize(
    {
      id: `vesta-reminder-${reminder.id}`,
      title: `VESTA: ${reminder.title}`,
      description:
        overdueDays > 0
          ? `Recordatorio preventivo vencido hace ${overdueDays} dia(s).`
          : `Recordatorio preventivo con vencimiento ${dueDate.toLocaleDateString("es-CL")}.`,
      type: "REMINDER",
      severity,
      scope: "GLOBAL",
      status: reminder.status === "done" ? "RESOLVED" : "NEW",
      createdAt: time,
      updatedAt: time,
      eventTime: time,
      sourceType: "SYSTEM",
      category: "preparedness_reminder",
      verificationStatus: undefined,
      isOfficial: false,
      sourceName: "ARGUS VESTA",
      confidence: 100,
      lat: null,
      lng: null,
      countryCode: null,
      region: null,
      city: null,
      distanceKm: null,
      relatedEventId: null,
      relatedReportId: null,
      relatedIncidentId: reminder.id,
      relatedFenixScenarioId: null,
      relatedRouteId: null,
      actionUrl: "/modules/vesta",
      sourceUrl: null,
    },
    readIds
  );
}

/**
 * Un refugio puede calificar por mas de un motivo a la vez (lleno + ruta
 * cortada, por ejemplo); se reporta uno por notificacion con esta
 * prioridad — comprometido/ruta cortada primero (afecta si se puede llegar
 * o quedarse), luego lleno/cerrado (afecta si conviene recomendarlo), y
 * "dato desactualizado" solo cuando ningun otro motivo aplica.
 */
function shelterAlertToNotification(alert: ShelterOperationalAlertItem, readIds: Set<string>, userLocation?: BuildNotificationInput["userLocation"]) {
  const lat = toFiniteNumber(alert.latitude);
  const lng = toFiniteNumber(alert.longitude);
  const time = toIso(alert.lastUpdatedAt);
  const distanceKm = userLocation && lat !== null && lng !== null ? calculateDistanceKm(userLocation, { lat, lng }) : null;
  const id = `shelter-alert-${alert.poiId}`;

  let severity: ArgusNotificationSeverity;
  let title: string;
  let description: string;
  if (alert.shelterStatus === "compromised") {
    severity = "P1_HIGH";
    title = `Refugio no recomendable: ${alert.poiName}`;
    description = "El refugio fue marcado como comprometido/no recomendable por su fuente.";
  } else if (alert.routeStatus === "blocked") {
    severity = "P1_HIGH";
    title = `Ruta cortada hacia refugio: ${alert.poiName}`;
    description = "La ruta de acceso conocida hacia este refugio esta reportada como bloqueada.";
  } else if (alert.shelterStatus === "full") {
    severity = "P2_MEDIUM";
    title = `Refugio lleno: ${alert.poiName}`;
    description = "El refugio alcanzo su capacidad reportada. Considerar alternativas.";
  } else if (alert.shelterStatus === "closed") {
    severity = "P2_MEDIUM";
    title = `Refugio cerrado: ${alert.poiName}`;
    description = "El refugio fue reportado como cerrado.";
  } else {
    severity = "P3_LOW";
    title = `Dato desactualizado: ${alert.poiName}`;
    description = "El estado operacional de este refugio no se ha confirmado dentro de la ventana de vigencia esperada.";
  }

  return finalize(
    {
      id,
      title,
      description,
      type: "SHELTER",
      severity,
      scope: scopeForLocation(lat, lng, alert.countryCode ?? null, userLocation),
      status: "MONITORING",
      createdAt: time,
      updatedAt: time,
      eventTime: time,
      sourceType: "SYSTEM",
      category: "system_notice",
      verificationStatus: undefined,
      isOfficial: false,
      sourceName: alert.sourceName,
      confidence: Math.max(0, Math.min(100, alert.confidence)),
      lat,
      lng,
      countryCode: alert.countryCode ?? null,
      region: null,
      city: null,
      distanceKm,
      relatedEventId: null,
      relatedReportId: null,
      relatedIncidentId: alert.poiId,
      relatedFenixScenarioId: null,
      relatedRouteId: null,
      actionUrl: lat !== null && lng !== null ? `/app?lat=${lat}&lng=${lng}&criticalPoiId=${alert.poiId}` : `/app?criticalPoiId=${alert.poiId}`,
      sourceUrl: null,
    },
    readIds
  );
}

/**
 * Mapeo severidad/titulo por `alertReason` (spec ARGUS v1.0.3.6 §16):
 * activacion/degradacion son P1, expansion/fin son P2, restablecimiento y
 * nuevo punto de conectividad son P3, dato desactualizado es P4. `category`
 * distingue "official_alert" (verificationStatus oficial) de
 * "candidate_signal" (aun sin confirmar) para activaciones — nunca se marca
 * como alerta oficial algo que no lo es.
 */
function connectivityAlertToNotification(
  alert: ConnectivityAlertItem,
  readIds: Set<string>,
  userLocation?: BuildNotificationInput["userLocation"]
) {
  const lat = toFiniteNumber(alert.latitude);
  const lng = toFiniteNumber(alert.longitude);
  const time = toIso(alert.lastUpdatedAt);
  const distanceKm = userLocation && lat !== null && lng !== null ? calculateDistanceKm(userLocation, { lat, lng }) : null;
  const locationLabel = alert.adminLevel2 ? `${alert.adminLevel2}, ${alert.adminLevel1}` : alert.adminLevel1;
  const isOfficial = alert.verificationStatus === "official";

  let severity: ArgusNotificationSeverity;
  let title: string;
  let description: string;
  let category: NotificationCategory;
  switch (alert.alertReason) {
    case "activated":
      severity = "P1_HIGH";
      title = `Roaming de emergencia activado en ${locationLabel}`;
      description = "Se reporto la activacion de roaming de emergencia para esta zona.";
      category = isOfficial ? "official_alert" : "candidate_signal";
      break;
    case "expanded":
      severity = "P2_MEDIUM";
      title = `Roaming de emergencia ampliado a ${locationLabel}`;
      description = "La activacion de roaming de emergencia se extendio a esta region/comuna.";
      category = isOfficial ? "official_alert" : "candidate_signal";
      break;
    case "ended":
      severity = "P2_MEDIUM";
      title = `Roaming de emergencia finalizado en ${locationLabel}`;
      description = "La activacion de roaming de emergencia para esta zona fue reportada como finalizada.";
      category = "system_notice";
      break;
    case "degraded":
    case "outage":
      severity = "P1_HIGH";
      title = `Red movil degradada en ${locationLabel}`;
      description = "Se reporto degradacion o interrupcion de la red movil en esta zona.";
      category = isOfficial ? "official_alert" : "candidate_signal";
      break;
    case "restored":
      severity = "P3_LOW";
      title = `Red movil restablecida en ${locationLabel}`;
      description = "Se reporto el restablecimiento de la red movil en esta zona.";
      category = "system_notice";
      break;
    case "point_added":
      severity = "P3_LOW";
      title = `Nuevo punto de conectividad cerca de ${locationLabel}`;
      description = "Se registro un carro movil, wifi de emergencia o punto de carga en esta zona.";
      category = "recommendation";
      break;
    case "marked_stale":
    default:
      severity = "P4_INFO";
      title = `Dato de conectividad desactualizado: ${locationLabel}`;
      description = "El estado de conectividad de emergencia de esta zona no se ha confirmado dentro de la ventana de vigencia esperada.";
      category = "system_notice";
      break;
  }

  return finalize(
    {
      id: `connectivity-alert-${encodeURIComponent(alert.regionKey)}-${alert.alertReason}`,
      title,
      description,
      type: "CONNECTIVITY",
      severity,
      scope: scopeForLocation(lat, lng, alert.countryCode ?? null, userLocation),
      status: "MONITORING",
      createdAt: time,
      updatedAt: time,
      eventTime: time,
      sourceType: isOfficial ? "OFFICIAL" : "OPEN_DATA",
      category,
      verificationStatus: alert.verificationStatus as VerificationStatus,
      isOfficial,
      sourceName: alert.sourceName,
      confidence: Math.max(0, Math.min(100, alert.confidence)),
      lat,
      lng,
      countryCode: alert.countryCode ?? null,
      region: alert.adminLevel1,
      city: alert.adminLevel2 ?? null,
      distanceKm,
      relatedEventId: null,
      relatedReportId: null,
      relatedIncidentId: null,
      relatedFenixScenarioId: null,
      relatedRouteId: null,
      actionUrl: lat !== null && lng !== null ? `/app?lat=${lat}&lng=${lng}&telecomRegion=${encodeURIComponent(alert.adminLevel1)}` : `/app?telecomRegion=${encodeURIComponent(alert.adminLevel1)}`,
      sourceUrl: null,
    },
    readIds
  );
}

function knowledgeIncidentToNotification(
  incident: KnowledgeIncidentItem,
  readIds: Set<string>,
  userLocation?: BuildNotificationInput["userLocation"]
) {
  const lat = toFiniteNumber(incident.latitude);
  const lng = toFiniteNumber(incident.longitude);
  const eventTime = toIso(incident.occurredAt ?? incident.detectedAt ?? incident.createdAt);
  const updatedAt = toIso(incident.updatedAt, new Date(eventTime));
  const countryCode = incident.country ?? null;
  const distanceKm =
    userLocation && lat !== null && lng !== null
      ? calculateDistanceKm(userLocation, { lat, lng })
      : null;
  const id = `knowledge-incident-${incident.id}`;
  const type = typeFromCategory(incident.domain, "SYSTEM");
  // ARGUS v1.0.3.2: canonicalize at read time so an already-persisted stale
  // GDACS Green row never surfaces as P0_CRITICAL, even before a repair/
  // re-ingest corrects the stored value.
  const canonicalSeverity = canonicalizeGdacsSeverity({
    sourceId: incident.sourceId,
    sourceName: incident.sourceName,
    tags: Array.isArray(incident.tagsJson) ? incident.tagsJson.map(String) : [],
    title: incident.title,
    description: incident.summary,
    severity: incident.severity,
    technicalFactors: (incident.technicalFactorsJson as Record<string, unknown> | null) ?? undefined,
    impact: (incident.impactJson as { peopleAffected?: number } | null) ?? undefined,
    casualties: (incident.casualtiesJson as { deaths?: number; displaced?: number } | null) ?? undefined,
  }).severity;
  // Prompt 11 §8.1/§21 Caso 1: SENAPRED/USGS/GDACS/etc. (the
  // `OFFICIAL_KNOWLEDGE_SOURCES` allowlist) are `official_alert`; FIRMS/EFFIS/
  // EMS satellite feeds are corroborated-but-not-official `confirmed_incident`;
  // anything else reaching notifiable severity through Global Watch without a
  // recognized source is a preliminary `candidate_signal` — never promoted to
  // official by severity alone.
  const knowledgeSourceType = sourceTypeForKnowledge(incident);
  const knowledgeCategory: NotificationCategory =
    knowledgeSourceType === "OFFICIAL"
      ? "official_alert"
      : knowledgeSourceType === "OPEN_DATA"
        ? "confirmed_incident"
        : "candidate_signal";
  const knowledgeVerification: VerificationStatus =
    knowledgeSourceType === "OFFICIAL"
      ? "official"
      : knowledgeSourceType === "OPEN_DATA"
        ? "corroborated"
        : "candidate";

  return finalize(
    {
      id,
      title: incident.title,
      description: incident.summary,
      type,
      severity: mapSeverity(canonicalSeverity),
      scope: scopeForLocation(lat, lng, countryCode, userLocation),
      status: statusForKnowledge(incident),
      createdAt: toIso(incident.createdAt),
      updatedAt,
      eventTime,
      sourceType: knowledgeSourceType,
      category: knowledgeCategory,
      verificationStatus: knowledgeVerification,
      isOfficial: knowledgeSourceType === "OFFICIAL",
      sourceName: incident.sourceName,
      confidence: Math.max(0, Math.min(100, Number(incident.confidenceScore ?? 70))),
      lat,
      lng,
      countryCode,
      region: incident.region ?? incident.locality ?? null,
      city: incident.locality ?? null,
      distanceKm,
      relatedEventId: incident.id,
      relatedReportId: null,
      relatedIncidentId: incident.id,
      relatedFenixScenarioId: lat !== null && lng !== null ? fenixScenarioIdForType(type) : null,
      relatedRouteId: null,
      actionUrl:
        lat !== null && lng !== null
          ? `/app?lat=${lat}&lng=${lng}&notificationId=${id}`
          : `/app?eventId=${encodeURIComponent(incident.id)}`,
      sourceUrl: null,
    },
    readIds
  );
}

function sourceToNotification(source: SourceHealthItem, readIds: Set<string>) {
  const sourceId = source.sourceId ?? source.id ?? "unknown";
  const name = source.sourceName ?? source.name ?? sourceId;
  const status = source.lastKnownStatus ?? source.status ?? source.latestIngestionRun?.status ?? "not_checked";
  const hasProblem =
    ["error", "failed", "degraded", "offline", "unconfigured"].includes(status) ||
    Boolean(source.latestIngestionRun?.error) ||
    Boolean(source.warnings?.length);
  const time = toIso(source.latestIngestionRun?.fetchedAt);

  return finalize(
    {
      id: `source-${sourceId}-${status}`,
      title: hasProblem ? `Fuente requiere revision: ${name}` : `Fuente operativa: ${name}`,
      description:
        source.latestIngestionRun?.error ??
        source.warnings?.[0] ??
        `Estado ${status}. Registros persistidos: ${source.persistedCount ?? 0}.`,
      type: "SOURCE_UPDATE",
      severity: hasProblem ? "P2_MEDIUM" : "P4_INFO",
      scope: "GLOBAL",
      status: hasProblem ? "UPDATED" : "MONITORING",
      createdAt: time,
      updatedAt: time,
      eventTime: time,
      sourceType: source.isOfficial ? "OFFICIAL" : "SYSTEM",
      // Source health is a technical status of ARGUS's own ingestion, never
      // a crisis signal — always `source_health`, never `official_alert`
      // even when the underlying source is an official one (Prompt 11 §20).
      category: "source_health",
      verificationStatus: undefined,
      isOfficial: false,
      sourceName: "ARGUS Source Registry",
      confidence: hasProblem ? 70 : 80,
      lat: null,
      lng: null,
      countryCode: null,
      region: null,
      city: null,
      distanceKm: null,
      relatedEventId: null,
      relatedReportId: null,
      relatedIncidentId: sourceId,
      relatedFenixScenarioId: null,
      relatedRouteId: null,
      actionUrl: "/dashboard",
      sourceUrl: null,
    },
    readIds
  );
}

export function buildArgusNotifications(input: BuildNotificationInput) {
  const readIds = new Set(input.readIds ?? []);
  const notifications = [
    ...(input.events ?? []).map((event) => eventToNotification(event, readIds, input.userLocation)),
    ...(input.externalEvents ?? []).map((event) => externalToNotification(event, readIds, input.userLocation)),
    ...(input.conflictEvents ?? []).map((event) => conflictToNotification(event, readIds, input.userLocation)),
    ...(input.knowledgeIncidents ?? [])
      .filter((incident) => isNotifiableKnowledgeSeverity(incident.severity))
      .map((incident) => knowledgeIncidentToNotification(incident, readIds, input.userLocation)),
    ...(input.routes ?? []).map((route) => routeToNotification(route, readIds)),
    ...(input.sourceHealth ?? []).map((source) => sourceToNotification(source, readIds)),
    ...(input.reminders ?? []).map((reminder) => reminderToNotification(reminder, readIds)),
    ...(input.shelterAlerts ?? []).map((alert) => shelterAlertToNotification(alert, readIds, input.userLocation)),
    ...(input.connectivityAlerts ?? []).map((alert) => connectivityAlertToNotification(alert, readIds, input.userLocation)),
  ];

  return notifications.sort((a, b) => {
    const timeDifference = new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime();
    if (timeDifference !== 0) return timeDifference;
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

export function sortNotificationsBySeverity(notifications: ArgusNotification[]) {
  return [...notifications].sort((a, b) => {
    const severityDifference = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDifference !== 0) return severityDifference;
    return new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime();
  });
}

/**
 * Prompt 11 §11: composite ordering rank combining `category` and, only for
 * the top four slots, `severity` — matching the explicit precedence list
 * ("Predicción crítica ≠ alerta oficial crítica"; the alert always wins).
 * From `candidate_signal` down, rank is purely categorical: severity no
 * longer breaks ties at that point (the mandate's own list doesn't
 * qualify tiers 5-12 by severity), leaving `notificationOrderTier` (lifecycle/
 * severity) as the secondary sort key for same-rank items.
 */
export function categoryPriorityRank(notification: ArgusNotification): number {
  const { category, severity } = notification;
  if (category === "official_alert" && severity === "P0_CRITICAL") return 0;
  if (category === "confirmed_incident" && severity === "P0_CRITICAL") return 1;
  if (category === "official_alert" && severity === "P1_HIGH") return 2;
  if (category === "confirmed_incident" && severity === "P1_HIGH") return 3;
  if (category === "official_alert" || category === "confirmed_incident") return 4;
  if (category === "candidate_signal") return 5;
  if (category === "recommendation") return 6;
  if (category === "argus_analysis") return 7;
  if (category === "prediction") return 8;
  if (category === "citizen_report") return 9;
  if (category === "preparedness_reminder") return 10;
  if (category === "source_health" || category === "system_notice") return 11;
  return 12; // demo
}

function notificationSignature(notification: ArgusNotification) {
  const lat = notification.lat === null ? "x" : Math.round(notification.lat * 10) / 10;
  const lng = notification.lng === null ? "x" : Math.round(notification.lng * 10) / 10;
  const bucket = Math.floor(new Date(notification.eventTime).getTime() / (6 * 60 * 60 * 1000));
  return `${notification.type}:${lat}:${lng}:${bucket}`;
}

/**
 * Ordering tier for the operational feed. A RESOLVED/DISMISSED alert must
 * never outrank an active or monitoring one just because its stored
 * severity is still "critical" (lifecycle sweeps update status, not
 * severity) — so resolved status is checked before severity, not after.
 * Within P0/P1, NEW/UPDATED ("active") ranks above MONITORING; lower
 * severities don't bother with that distinction.
 *
 *   0 active   P0_CRITICAL   1 monitoring P0_CRITICAL
 *   2 active   P1_HIGH       3 monitoring P1_HIGH
 *   4 active/monitoring P2_MEDIUM
 *   5 resolved/dismissed (any severity)
 *   6 everything else (P3_LOW / P4_INFO)
 */
export function notificationOrderTier(notification: ArgusNotification): number {
  if (notification.status === "RESOLVED" || notification.status === "DISMISSED") return 5;
  const isMonitoring = notification.status === "MONITORING";
  if (notification.severity === "P0_CRITICAL") return isMonitoring ? 1 : 0;
  if (notification.severity === "P1_HIGH") return isMonitoring ? 3 : 2;
  if (notification.severity === "P2_MEDIUM") return 4;
  return 6;
}

/**
 * Sorts by `categoryPriorityRank` then `notificationOrderTier` then most
 * recent, then drops later duplicates sharing the same
 * type/rounded-location/6h-time-bucket signature.
 */
export function dedupeOperationalNotifications(notifications: ArgusNotification[]): ArgusNotification[] {
  const sorted = [...notifications].sort((a, b) => {
    const category = categoryPriorityRank(a) - categoryPriorityRank(b);
    if (category !== 0) return category;
    const tier = notificationOrderTier(a) - notificationOrderTier(b);
    if (tier !== 0) return tier;
    return new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime();
  });
  const seen = new Set<string>();
  return sorted.filter((notification) => {
    const signature = notificationSignature(notification);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

/**
 * Reserved slots for high/critical `KnowledgeIncident` notifications (ARGUS
 * Global Watch + SENAPRED, tagged `knowledge-incident-*` by
 * `knowledgeIncidentToNotification`) at the top of the feed. Without this,
 * a red-alert wildfire or earthquake competes for a spot in the final
 * `limit` slice purely by `eventTime`, and gets crowded out by citizen
 * reports/routes/source-health items that happen to be more recent — the
 * caller's own query is expected to cap around 60 rows, so this cap mainly
 * guards against a *smaller* caller-supplied `limit` (e.g. `?limit=20`)
 * reserving the entire page for Global Watch alone.
 */
export const GLOBAL_WATCH_PRIORITY_CAP = 40;

function isGlobalWatchPriorityNotification(notification: ArgusNotification): boolean {
  return (
    notification.id.startsWith("knowledge-incident-") &&
    (notification.severity === "P0_CRITICAL" || notification.severity === "P1_HIGH") &&
    notification.status !== "RESOLVED" &&
    notification.status !== "DISMISSED"
  );
}

/**
 * `buildArgusNotifications` already sorts everything by `eventTime` desc
 * (then severity), so within each partition below "most recent first" is
 * preserved — this only changes *which* items survive the final `limit`
 * truncation, not the relative order of same-partition items. Partitioning
 * by id prefix means no item can appear in both groups, so this can't
 * introduce duplicates. Prompt 11 §12: predictions/candidates/reminders
 * never occupy a Global Watch slot because `isGlobalWatchPriorityNotification`
 * only matches `knowledge-incident-*` ids, and those always resolve to
 * `official_alert`/`confirmed_incident`/`candidate_signal` categories —
 * never `prediction` (built separately, a different id prefix).
 */
export function prioritizeGlobalWatchNotifications(
  notifications: ArgusNotification[],
  limit: number
): ArgusNotification[] {
  const ordered = dedupeOperationalNotifications(notifications);
  const priority = ordered.filter(isGlobalWatchPriorityNotification);
  const rest = ordered.filter((notification) => !isGlobalWatchPriorityNotification(notification));

  const prioritySlots = Math.min(priority.length, GLOBAL_WATCH_PRIORITY_CAP, limit);
  const remainingSlots = Math.max(0, limit - prioritySlots);

  return [...priority.slice(0, prioritySlots), ...rest.slice(0, remainingSlots)];
}

/**
 * ARGUS v1.0.3.3 — the single, testable choke point excluding unauthorized
 * demo/placeholder notifications before any slot/priority/summary logic
 * runs (see tests/p0/notification-demo-guard.test.ts). Callers must run
 * this before `prioritizeGlobalWatchNotifications`/`buildNotificationSummary`
 * so an excluded demo item can never influence a slot count, a critical
 * count, or a dedup decision against a real notification.
 */
export function filterAuthorizedNotifications(
  notifications: ArgusNotification[],
  demoAllowed: boolean
): ArgusNotification[] {
  return notifications.filter((notification) => notification.isDemo !== true || demoAllowed);
}

/**
 * Fail-closed replacement for "if no real data, fall back to a demo
 * dataset" — the fallback is only ever built when `demoAllowed` is true.
 * Mirrors the exact ternary previously inlined in
 * `src/app/api/notifications/route.ts`, extracted so it can be unit-tested
 * without a Prisma-backed caller (see Case G, "ausencia de datos reales",
 * in tests/p0/notification-demo-guard.test.ts).
 */
export function resolveDemoFallback<T>(persistedItems: T[], demoAllowed: boolean, buildDemoItems: () => T[]): T[] {
  if (persistedItems.length > 0) return persistedItems;
  return demoAllowed ? buildDemoItems() : [];
}

/**
 * Prompt 11 §13: the operational critical/high counter must include only
 * `official_alert`/`confirmed_incident` — predictions, ARGUS analysis,
 * recommendations, candidate signals, citizen reports, source health,
 * reminders and demo items never count, *regardless of severity*. A
 * `category: "prediction"` item stamped `P0_CRITICAL` still does not count
 * (Prompt 11 §11 example: "Predicción crítica ≠ alerta oficial crítica").
 */
const OPERATIONAL_CRITICAL_CATEGORIES: ReadonlySet<NotificationCategory> = new Set([
  "official_alert",
  "confirmed_incident",
]);

/**
 * Prompt 10 — un incidente crítico ya `RESOLVED`/`DISMISSED` conserva su
 * `severity` original (la severidad no cambia al resolverse, solo el
 * `status`), así que antes de esta corrección seguía sumando al contador
 * `critical`/`high` — la campana mostraba una alerta activa que ya no lo
 * era. `total`/`unread`/`scope` se dejan intactos a propósito: una
 * notificación de resolución puede seguir apareciendo en el feed general
 * (Prompt 10 §14), solo no debe contarse como alerta activa. Prompt 11
 * extends this with the category gate above.
 */
function isActiveForCriticalCount(notification: ArgusNotification): boolean {
  return (
    OPERATIONAL_CRITICAL_CATEGORIES.has(notification.category) &&
    classifyLifecycleVisibility(notification.status).visible
  );
}

const NOTIFICATION_CATEGORY_KEYS: NotificationCategory[] = [
  "official_alert",
  "confirmed_incident",
  "candidate_signal",
  "citizen_report",
  "argus_analysis",
  "prediction",
  "recommendation",
  "source_health",
  "preparedness_reminder",
  "system_notice",
  "demo",
];

function buildCategoryBreakdown(notifications: ArgusNotification[]): Record<NotificationCategory, number> {
  const breakdown = NOTIFICATION_CATEGORY_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as Record<NotificationCategory, number>);
  notifications.forEach((item) => {
    breakdown[item.category] += 1;
  });
  return breakdown;
}

/**
 * The single, shared summary calculation — imported directly by both
 * `/api/notifications` (server) and `NotificationCenterPanel.tsx` (client,
 * no I/O in this module so it's safe to import from a "use client"
 * component) so server and client counts can never diverge (Prompt 11 §23).
 */
export function buildNotificationSummary(notifications: ArgusNotification[]): ArgusNotificationSummary {
  return {
    total: notifications.length,
    unread: notifications.filter((item) => !item.isRead).length,
    critical: notifications.filter((item) => item.severity === "P0_CRITICAL" && isActiveForCriticalCount(item)).length,
    high: notifications.filter((item) => item.severity === "P1_HIGH" && isActiveForCriticalCount(item)).length,
    local: notifications.filter((item) => item.scope === "LOCAL").length,
    national: notifications.filter((item) => item.scope === "NATIONAL").length,
    international: notifications.filter((item) => item.scope === "INTERNATIONAL").length,
    global: notifications.filter((item) => item.scope === "GLOBAL").length,
    latestAt: notifications[0]?.eventTime ?? null,
    byCategory: buildCategoryBreakdown(notifications),
  };
}

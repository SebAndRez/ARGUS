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
  ArgusNotificationType,
} from "@/types/notificationCenter";
import {
  getNotificationColorToken,
  getNotificationIcon,
  severityOrder,
} from "@/lib/notifications/notificationVisuals";

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

function finalize(
  partial: Omit<ArgusNotification, "icon" | "colorToken" | "isRead" | "isPinned" | "actions"> & {
    sourceUrl?: string | null;
  },
  readIds: Set<string>
): ArgusNotification {
  const { sourceUrl: _sourceUrl, ...notificationFields } = partial;
  void _sourceUrl;
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
    actions,
    icon: getNotificationIcon(partial.type),
    colorToken: getNotificationColorToken(partial.severity),
    isRead: readIds.has(partial.id),
    isPinned:
      partial.severity === "P0_CRITICAL" &&
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
      sourceType: event.type === "SOS" || event.type === "REPORT" ? "CITIZEN" : "ARGUS_ESTIMATE",
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
      sourceType: event.rawProvider === "manual_curated" ? "ARGUS_ESTIMATE" : "OPEN_DATA",
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
      severity: route.status?.toLowerCase().includes("demo") ? "P4_INFO" : "P3_LOW",
      scope: "NATIONAL",
      status: "MONITORING",
      createdAt: demoRouteTime,
      updatedAt: demoRouteTime,
      eventTime: demoRouteTime,
      sourceType: "ARGUS_ESTIMATE",
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

  return finalize(
    {
      id,
      title: incident.title,
      description: incident.summary,
      type,
      severity: mapSeverity(incident.severity),
      scope: scopeForLocation(lat, lng, countryCode, userLocation),
      status: statusForKnowledge(incident),
      createdAt: toIso(incident.createdAt),
      updatedAt,
      eventTime,
      sourceType: sourceTypeForKnowledge(incident),
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

export function buildNotificationSummary(notifications: ArgusNotification[]) {
  return {
    total: notifications.length,
    unread: notifications.filter((item) => !item.isRead).length,
    critical: notifications.filter((item) => item.severity === "P0_CRITICAL").length,
    high: notifications.filter((item) => item.severity === "P1_HIGH").length,
    local: notifications.filter((item) => item.scope === "LOCAL").length,
    national: notifications.filter((item) => item.scope === "NATIONAL").length,
    international: notifications.filter((item) => item.scope === "INTERNATIONAL").length,
    global: notifications.filter((item) => item.scope === "GLOBAL").length,
    latestAt: notifications[0]?.eventTime ?? null,
  };
}

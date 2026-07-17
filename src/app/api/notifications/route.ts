import { NextRequest, NextResponse } from "next/server";
import { demoEvents } from "@/data/demoEvents";
import { curatedConflictEvents } from "@/data/conflictZones";
import { demoRoutes } from "@/data/demoRoutes";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/services/authService";
import { isDemoDataAllowed } from "@/lib/security/productionGuard";
import { logOperationalEvent } from "@/lib/observability/operationalEvents";
import { getPredictiveNotificationPackets } from "@/lib/predictive-core/predictiveFeed";
import { deduplicateEvents } from "@/lib/ingestion/deduplicateEvents";
import { getOrFetchUsgsEarthquakes } from "@/lib/ingestion/ingestUsgsEarthquakes";
import {
  buildArgusNotifications,
  buildNotificationSummary,
  calculateDistanceKm,
  filterAuthorizedNotifications,
  prioritizeGlobalWatchNotifications,
  resolveDemoFallback,
  type KnowledgeIncidentItem,
  type ShelterOperationalAlertItem,
} from "@/lib/notifications/notificationCenterEngine";
import {
  getNotificationColorToken,
  getNotificationIcon,
} from "@/lib/notifications/notificationVisuals";
import type { CrisisEvent } from "@/types/crisis";
import type { EventSeverity, HelpPriority } from "@/types/crisis";
import type { ArgusNormalizedEvent } from "@/types/ingestion";
import type {
  ArgusNotification,
  ArgusNotificationScope,
  ArgusNotificationSeverity,
  ArgusNotificationType,
  NotificationCategory,
} from "@/types/notificationCenter";

export const dynamic = "force-dynamic";

function parseLimit(value: string | null) {
  const limit = Number(value ?? "80");
  return Number.isInteger(limit) ? Math.min(200, Math.max(1, limit)) : 80;
}

function parseCoordinate(value: string | null) {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseReadIds(value: string | null) {
  if (!value) return [];
  return value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 500);
}

async function getPersistedEvents(): Promise<CrisisEvent[]> {
  try {
    const [reports, helpRequests] = await Promise.all([
      prisma.report.findMany({
        orderBy: { createdAt: "desc" },
        take: 80,
      }),
      prisma.helpRequest.findMany({
        orderBy: { createdAt: "desc" },
        take: 80,
      }),
    ]);

    return [
      ...reports.map((report) => ({
        id: report.id,
        title: report.title,
        category: report.category,
        description: report.description,
        latitude: report.latitude,
        longitude: report.longitude,
        locationText: report.locationText,
        severity: report.severity as EventSeverity,
        type: "REPORT" as const,
        status: report.status,
        createdAt: report.createdAt.toISOString(),
        updatedAt: report.updatedAt.toISOString(),
        aiSummary: report.aiSummary,
        aiRecommendation: report.aiRecommendation,
        aiConfidence: report.aiConfidence,
        falseReportRisk: report.falseReportRisk,
        recordType: "Report" as const,
      })),
      ...helpRequests.map((request) => ({
        id: request.id,
        title: request.title,
        category: request.category,
        description: request.description,
        latitude: request.latitude,
        longitude: request.longitude,
        locationText: request.locationText,
        severity: request.priority as EventSeverity,
        priority: request.priority as HelpPriority,
        type: "SOS" as const,
        status: request.status,
        createdAt: request.createdAt.toISOString(),
        updatedAt: request.updatedAt.toISOString(),
        aiSummary: request.aiSummary,
        aiRecommendation: request.aiRecommendation,
        aiConfidence: request.aiConfidence,
        restrictedMode: request.restrictedMode,
        recordType: "HelpRequest" as const,
      })),
    ];
  } catch (error) {
    logOperationalEvent({
      event: "notification_source_fetch_failed",
      level: "error",
      component: "notifications",
      outcome: "failure",
      detail: { source: "reports_help_requests", message: error instanceof Error ? error.message : "unknown" },
    });
    return [];
  }
}

/**
 * `expiresAt` es una columna real de `ExternalEvent` (no JSON) — se filtra
 * directamente en la query (Prompt 10 §9), preservando siempre las filas
 * con `expiresAt: null` (§8: nulo nunca implica expiración). Antes de esta
 * corrección, un sismo USGS con TTL de 60s persistido hace días seguía
 * pudiendo alimentar notificaciones activas indefinidamente.
 */
async function getPersistedExternalEvents(): Promise<ArgusNormalizedEvent[]> {
  try {
    const now = new Date();
    const events = await prisma.externalEvent.findMany({
      where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: [{ occurredAt: "desc" }, { updatedAt: "desc" }],
      take: 120,
    });

    return events.map((event) => ({
      id: event.id,
      sourceId: event.sourceId as ArgusNormalizedEvent["sourceId"],
      sourceName: event.sourceId,
      externalId: event.externalId ?? event.id,
      title: event.title,
      description: event.description ?? event.title,
      category: event.category as ArgusNormalizedEvent["category"],
      severity: event.severity as ArgusNormalizedEvent["severity"],
      confidence: event.confidence ?? 70,
      latitude: event.latitude,
      longitude: event.longitude,
      radiusKm: null,
      occurredAt: (event.occurredAt ?? event.createdAt).toISOString(),
      updatedAt: event.updatedAt?.toISOString() ?? null,
      url: event.sourceUrl,
      rawMagnitude: null,
      rawMagnitudeType: null,
      rawDepthKm: null,
      rawOfficialMmi: null,
      rawAlertLevel: null,
      rawMessageType: null,
      rawConfidence: null,
      rawFrp: null,
      rawBrightness: null,
      satellite: null,
      instrument: null,
      dayNight: null,
      locationName: event.locationName,
      country: event.country,
      recommendedAction: null,
      whyItMatters: null,
      isExternal: true,
    }));
  } catch (error) {
    logOperationalEvent({
      event: "notification_source_fetch_failed",
      level: "error",
      component: "notifications",
      outcome: "failure",
      detail: { source: "external_events", message: error instanceof Error ? error.message : "unknown" },
    });
    return [];
  }
}

/**
 * The USGS earthquake layer on the map fetches straight from
 * getOrFetchUsgsEarthquakes() (live feed or its 60s cache) and only persists
 * to ExternalEvent as a side effect. If the Notification Center only reads
 * ExternalEvent, it can lag behind (or miss) quakes the map already shows -
 * this is what makes it look "stuck" until a hard refresh happens to land
 * after that persistence completes. Calling the same helper here guarantees
 * both surfaces see identical, current USGS data on every request.
 */
async function getExternalEvents(): Promise<ArgusNormalizedEvent[]> {
  const [persistedEvents, usgsResult] = await Promise.all([
    getPersistedExternalEvents(),
    getOrFetchUsgsEarthquakes().catch(() => null),
  ]);

  if (!usgsResult || "error" in usgsResult) {
    return persistedEvents;
  }

  return deduplicateEvents([...persistedEvents, ...usgsResult.events]);
}

/**
 * The knowledge-intake pipeline (NWS tornado/severe-weather alerts, NOAA
 * Storm Events, structural/bridge collapse domains, SENAPRED-fed incidents,
 * etc.) persists to `KnowledgeIncident`, entirely separate from
 * `ExternalEvent`. Before this, nothing here ever read that table, so a
 * high/critical incident classified correctly by knowledge-intake could
 * never produce a notification. Only high/critical rows are fetched — the
 * severity gate is enforced again in `buildArgusNotifications` itself, this
 * query is just an optimization to avoid pulling low-severity rows.
 */
async function getCriticalKnowledgeIncidents(): Promise<KnowledgeIncidentItem[]> {
  try {
    const incidents = await prisma.knowledgeIncident.findMany({
      where: { severity: { in: ["high", "critical"] } },
      orderBy: [{ occurredAt: "desc" }, { detectedAt: "desc" }],
      take: 60,
    });

    return incidents.map((incident) => ({
      id: incident.id,
      externalId: incident.externalId,
      title: incident.title,
      summary: incident.summary,
      domain: incident.domain,
      subtype: incident.subtype,
      severity: incident.severity,
      confidenceScore: incident.confidenceScore,
      sourceId: incident.sourceId,
      sourceName: incident.sourceName,
      country: incident.country,
      region: incident.region,
      locality: incident.locality,
      latitude: incident.latitude,
      longitude: incident.longitude,
      occurredAt: incident.occurredAt,
      detectedAt: incident.detectedAt,
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
      tagsJson: incident.tagsJson,
      technicalFactorsJson: incident.technicalFactorsJson,
      impactJson: incident.impactJson,
      casualtiesJson: incident.casualtiesJson,
    }));
  } catch (error) {
    // Highest-risk silent gap (Prompt 19): this feeds official/critical
    // KnowledgeIncident rows into notifications — a swallowed failure here
    // means a P0 alert can vanish from the bell with no trace.
    logOperationalEvent({
      event: "notification_source_fetch_failed",
      level: "error",
      component: "notifications",
      outcome: "failure",
      detail: { source: "critical_knowledge_incidents", message: error instanceof Error ? error.message : "unknown" },
    });
    return [];
  }
}

async function getSourceHealth() {
  try {
    const [counts, runs] = await Promise.all([
      prisma.externalEvent.groupBy({ by: ["sourceId"], _count: { _all: true } }),
      prisma.ingestionRun.findMany({
        orderBy: { fetchedAt: "desc" },
        take: 50,
        select: {
          sourceId: true,
          status: true,
          fetchedAt: true,
          completedAt: true,
          count: true,
          cached: true,
          error: true,
        },
      }),
    ]);
    const persistedCounts = new Map(
      counts.map((item) => [item.sourceId, item._count._all])
    );
    const latestRuns = new Map<string, (typeof runs)[number]>();
    runs.forEach((run) => {
      if (!latestRuns.has(run.sourceId)) latestRuns.set(run.sourceId, run);
    });

    return Array.from(new Set([...persistedCounts.keys(), ...latestRuns.keys()])).map(
      (sourceId) => ({
        sourceId,
        sourceName: sourceId,
        status: latestRuns.get(sourceId)?.status ?? "ready",
        persistedCount: persistedCounts.get(sourceId) ?? 0,
        latestIngestionRun: latestRuns.get(sourceId) ?? null,
      })
    );
  } catch (error) {
    logOperationalEvent({
      event: "notification_source_fetch_failed",
      level: "error",
      component: "notifications",
      outcome: "failure",
      detail: { source: "source_health", message: error instanceof Error ? error.message : "unknown" },
    });
    return [];
  }
}

/**
 * Recordatorios preventivos de VESTA vencidos o por vencer en los próximos 3
 * días para el usuario autenticado. Solo se consultan si hay sesión: son
 * datos personales, no un feed global.
 */
async function getDueVestaReminders() {
  try {
    const user = await getCurrentUser();
    if (!user) return [];

    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const reminders = await prisma.preparednessReminder.findMany({
      where: {
        status: "pending",
        dueAt: { lte: soon },
        profile: { userId: user.id },
      },
      orderBy: { dueAt: "asc" },
      take: 20,
    });

    return reminders.map((reminder) => ({
      id: reminder.id,
      title: reminder.title,
      dueAt: reminder.dueAt,
      status: reminder.status,
    }));
  } catch (error) {
    logOperationalEvent({
      event: "notification_source_fetch_failed",
      level: "warn",
      component: "notifications",
      outcome: "failure",
      detail: { source: "vesta_reminders", message: error instanceof Error ? error.message : "unknown" },
    });
    return [];
  }
}

/**
 * Refugios que ameritan alerta operacional (lleno/cerrado/comprometido, ruta
 * de acceso cortada, o dato desactualizado — spec ARGUS v1.0.3.4 §18). Lee
 * `CriticalPoiOperationalStatus` (ver `src/lib/criticalPoi/*`), no crea un
 * segundo centro de alertas: se pliega al mismo `Promise.all` y motor que
 * el resto de fuentes de esta ruta.
 */
async function getShelterOperationalAlerts(): Promise<ShelterOperationalAlertItem[]> {
  try {
    const rows = await prisma.criticalPoiOperationalStatus.findMany({
      where: {
        OR: [
          { shelterStatus: { in: ["full", "closed", "compromised"] } },
          { isStale: true },
          { routeStatus: "blocked" },
        ],
      },
      include: { poi: true },
      take: 100,
    });

    return rows
      .filter((row) => row.poi.category === "shelter")
      .map((row) => ({
        poiId: row.poiId,
        poiName: row.poi.name,
        latitude: row.poi.latitude,
        longitude: row.poi.longitude,
        countryCode: row.poi.countryCode,
        shelterStatus: row.shelterStatus,
        routeStatus: row.routeStatus,
        isStale: row.isStale,
        sourceType: row.sourceType,
        sourceName: row.sourceName,
        confidence: row.confidence,
        lastUpdatedAt: row.lastUpdatedAt,
      }));
  } catch (error) {
    logOperationalEvent({
      event: "notification_source_fetch_failed",
      level: "warn",
      component: "notifications",
      outcome: "failure",
      detail: { source: "shelter_operational_alerts", message: error instanceof Error ? error.message : "unknown" },
    });
    return [];
  }
}

function predictiveSeverity(value: string): ArgusNotificationSeverity {
  if (value === "P0_CRITICAL") return "P0_CRITICAL";
  if (value === "P1_HIGH") return "P1_HIGH";
  if (value === "P2_MEDIUM") return "P2_MEDIUM";
  if (value === "P3_LOW") return "P3_LOW";
  return "P4_INFO";
}

function predictiveType(inputId: string): ArgusNotificationType {
  return inputId.toLowerCase().includes("sos") ? "SOS" : "SYSTEM";
}

async function getPredictiveNotifications(readIds: string[]): Promise<ArgusNotification[]> {
  let packets: Awaited<ReturnType<typeof getPredictiveNotificationPackets>> = [];
  try {
    // SEC-NEW-001: `GET /api/notifications` has no session/role check at
    // all (confirmed — no `getCurrentUser()` call anywhere in this route's
    // GET handler), so it must always request the redacted public
    // projection from Predictive Core. Never pass "operator" here without
    // first adding real session gating to this route.
    packets = await getPredictiveNotificationPackets({ limit: 30, audience: "public" });
  } catch (error) {
    logOperationalEvent({
      event: "notification_source_fetch_failed",
      level: "warn",
      component: "notifications",
      outcome: "failure",
      detail: { source: "predictive_notifications", message: error instanceof Error ? error.message : "unknown" },
    });
    return [];
  }
  const readSet = new Set(readIds);

  return packets.map((packet) => {
    const severity = predictiveSeverity(packet.notification?.severity ?? "P4_INFO");
    const actionUrl =
      packet.notification?.actionUrl ?? `/app?analysisId=${packet.analysis.id}`;

    return {
      id: `predictive-${packet.analysis.id}`,
      title: packet.notification?.title ?? packet.analysis.title,
      description: packet.notification?.body ?? packet.analysis.publicMessage,
      type: predictiveType(packet.analysis.inputId),
      severity,
      scope: "GLOBAL",
      status:
        packet.analysis.status === "confirmed_by_official_source"
          ? "UPDATED"
          : "MONITORING",
      createdAt: packet.analysis.createdAt,
      updatedAt: packet.analysis.updatedAt,
      eventTime: packet.analysis.updatedAt,
      sourceType: "ARGUS_ESTIMATE",
      // Prompt 11 §21 Caso 4: a prediction never becomes `official_alert`/
      // `isOfficial: true`, regardless of severity or of the underlying
      // analysis reaching `confirmed_by_official_source` (that only affects
      // `status`, a different dimension — see §6).
      category: "prediction",
      verificationStatus: "model_generated",
      isOfficial: false,
      sourceName: "ARGUS Predictive Intelligence Core",
      confidence: packet.analysis.confidence,
      lat: packet.mapFocus?.latitude ?? null,
      lng: packet.mapFocus?.longitude ?? null,
      countryCode: null,
      region: null,
      city: null,
      distanceKm: null,
      relatedEventId: packet.analysis.inputId,
      relatedReportId: packet.analysis.primaryMode === "citizen" ? packet.analysis.inputId : null,
      relatedIncidentId: packet.analysis.inputId,
      relatedFenixScenarioId: packet.fenixSeed ? `fenix-seed-${packet.analysis.inputId}` : null,
      relatedRouteId: null,
      actionUrl,
      actions: [
        {
          id: "analysis",
          label: "Ver analisis",
          url: actionUrl,
          kind: "event",
          primary: true,
        },
      ],
      icon: getNotificationIcon(predictiveType(packet.analysis.inputId)),
      colorToken: getNotificationColorToken(severity),
      isRead: readSet.has(`predictive-${packet.analysis.id}`),
      isPinned: severity === "P0_CRITICAL",
    };
  });
}

export async function GET(request: NextRequest) {
  const scope = request.nextUrl.searchParams.get("scope") as ArgusNotificationScope | null;
  const severity = request.nextUrl.searchParams.get("severity") as ArgusNotificationSeverity | null;
  const type = request.nextUrl.searchParams.get("type") as ArgusNotificationType | null;
  const category = request.nextUrl.searchParams.get("category") as NotificationCategory | "all" | null;
  const lat = parseCoordinate(request.nextUrl.searchParams.get("lat"));
  const lng = parseCoordinate(request.nextUrl.searchParams.get("lng"));
  const radiusKm = Number(request.nextUrl.searchParams.get("radiusKm") ?? "75");
  const includeGlobal = request.nextUrl.searchParams.get("includeGlobal") === "true";
  const onlyUnread = request.nextUrl.searchParams.get("onlyUnread") === "true";
  const readIds = parseReadIds(request.nextUrl.searchParams.get("readIds"));
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
  const userLocation =
    lat !== null && lng !== null
      ? { lat, lng, countryCode: request.nextUrl.searchParams.get("countryCode") ?? "CL" }
      : undefined;

  const [
    persistedEvents,
    externalEvents,
    sourceHealth,
    predictiveNotifications,
    vestaReminders,
    knowledgeIncidents,
    shelterAlerts,
  ] = await Promise.all([
    getPersistedEvents(),
    getExternalEvents(),
    getSourceHealth(),
    getPredictiveNotifications(readIds),
    getDueVestaReminders(),
    getCriticalKnowledgeIncidents(),
    getShelterOperationalAlerts(),
  ]);
  // Fail-closed: an empty real-data result never auto-fills with demoEvents.
  // The fallback only fires when `isDemoDataAllowed()` (src/lib/security/
  // productionGuard.ts, reused as-is — same ARGUS_ALLOW_DEMO_DATA variable
  // already used by Global Watch/Chile alerts seed mode) says demo content
  // is permitted for this environment: true outside production by default,
  // false in production unless ARGUS_ALLOW_DEMO_DATA="true" exactly.
  const demoAllowed = isDemoDataAllowed();
  const events = resolveDemoFallback(persistedEvents, demoAllowed, () =>
    demoEvents.map((event) => ({ ...event, isDemo: true }))
  );
  const routes = resolveDemoFallback<typeof demoRoutes[number]>([], demoAllowed, () => demoRoutes);

  let notifications = [
    ...predictiveNotifications,
    ...buildArgusNotifications({
      events,
      externalEvents,
      conflictEvents: curatedConflictEvents,
      routes,
      sourceHealth,
      reminders: vestaReminders,
      knowledgeIncidents,
      shelterAlerts,
      readIds,
      userLocation,
    }),
  ];

  // Defense-in-depth safety net: even if a future source forgets to gate
  // itself at the call site above, no `isDemo:true` notification survives
  // past this point unless explicitly authorized — and this runs before any
  // slot allocation, priority ordering, deduplication-against-real-events,
  // or summary/count calculation below, so excluded demo items can never
  // influence any of those.
  notifications = filterAuthorizedNotifications(notifications, demoAllowed);

  if (userLocation) {
    notifications = notifications.map((notification) => {
      if (notification.lat === null || notification.lng === null) return notification;
      return {
        ...notification,
        distanceKm: calculateDistanceKm(userLocation, {
          lat: notification.lat,
          lng: notification.lng,
        }),
      };
    });
  }

  notifications = notifications.filter((notification) => {
    if (scope && notification.scope !== scope) {
      if (!(includeGlobal && notification.scope === "GLOBAL")) return false;
    }
    if (severity && notification.severity !== severity) return false;
    if (type && notification.type !== type) return false;
    if (category && category !== "all" && notification.category !== category) return false;
    if (onlyUnread && notification.isRead) return false;
    if (
      scope === "LOCAL" &&
      userLocation &&
      notification.scope !== "GLOBAL" &&
      notification.distanceKm !== null &&
      Number.isFinite(radiusKm) &&
      notification.distanceKm > radiusKm
    ) {
      return false;
    }
    if (!includeGlobal && notification.scope === "GLOBAL" && scope !== "GLOBAL") {
      return false;
    }
    return true;
  });

  notifications = prioritizeGlobalWatchNotifications(notifications, limit);

  return NextResponse.json({
    notifications,
    summary: buildNotificationSummary(notifications),
  });
}

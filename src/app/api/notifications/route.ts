import { NextRequest, NextResponse } from "next/server";
import { demoEvents } from "@/data/demoEvents";
import { curatedConflictEvents } from "@/data/conflictZones";
import { demoRoutes } from "@/data/demoRoutes";
import { prisma } from "@/lib/prisma";
import { getPredictiveNotificationPackets } from "@/lib/predictive-core/predictiveFeed";
import {
  buildArgusNotifications,
  buildNotificationSummary,
  calculateDistanceKm,
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
  } catch {
    return [];
  }
}

async function getExternalEvents(): Promise<ArgusNormalizedEvent[]> {
  try {
    const events = await prisma.externalEvent.findMany({
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
  } catch {
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
  } catch {
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
    packets = await getPredictiveNotificationPackets({ limit: 30 });
  } catch {
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
      scope: packet.mapFocus ? "LOCAL" : "GLOBAL",
      status:
        packet.analysis.status === "confirmed_by_official_source"
          ? "UPDATED"
          : "MONITORING",
      createdAt: packet.analysis.createdAt,
      updatedAt: packet.analysis.updatedAt,
      eventTime: packet.analysis.updatedAt,
      sourceType:
        packet.analysis.primaryMode === "official"
          ? "OFFICIAL"
          : packet.analysis.primaryMode === "citizen"
            ? "CITIZEN"
            : "ARGUS_ESTIMATE",
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

  const [persistedEvents, externalEvents, sourceHealth, predictiveNotifications] = await Promise.all([
    getPersistedEvents(),
    getExternalEvents(),
    getSourceHealth(),
    getPredictiveNotifications(readIds),
  ]);
  const events = persistedEvents.length
    ? persistedEvents
    : demoEvents.map((event) => ({ ...event, isDemo: true }));

  let notifications = [
    ...predictiveNotifications,
    ...buildArgusNotifications({
      events,
      externalEvents,
      conflictEvents: curatedConflictEvents,
      routes: demoRoutes,
      sourceHealth,
      readIds,
      userLocation,
    }),
  ];

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

  notifications = notifications.slice(0, limit);

  return NextResponse.json({
    notifications,
    summary: buildNotificationSummary(notifications),
  });
}

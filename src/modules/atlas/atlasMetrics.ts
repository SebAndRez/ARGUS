import type { CrisisEvent } from "@/types/crisis";
import type { CommandSourceHealth } from "@/types/incident";
import { argusModules } from "@/data/argusModules";
import { canAccessModule } from "@/lib/modules/moduleAccess";
import type { ArgusRole } from "@/types/rbac";
import type {
  AtlasAlertQueueItem,
  AtlasCitizenReportsSummary,
  AtlasIncidentSummary,
  AtlasKpi,
  AtlasModuleStatus,
  AtlasRiskSummary,
  AtlasSourceSummary,
} from "@/modules/atlas/types";
import {
  atlasSeverityRank,
  formatAtlasLocation,
  formatRelativeTime,
  toAtlasIncidentStatus,
  toAtlasSeverity,
} from "@/modules/atlas/utils";

function isActiveEvent(event: CrisisEvent) {
  return event.status !== "RESOLVED" && event.status !== "DISCARDED";
}

export function buildAtlasIncidentFeed(events: CrisisEvent[]): AtlasIncidentSummary[] {
  return [...events]
    .filter(isActiveEvent)
    .sort((a, b) => {
      const severityDelta =
        atlasSeverityRank[toAtlasSeverity(b.severity)] - atlasSeverityRank[toAtlasSeverity(a.severity)];
      if (severityDelta !== 0) return severityDelta;
      return new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime();
    })
    .slice(0, 12)
    .map((event) => ({
      id: event.id,
      title: event.title,
      type: event.type,
      severity: toAtlasSeverity(event.severity),
      status: toAtlasIncidentStatus(event.status),
      locationLabel: formatAtlasLocation(event),
      updatedAt: event.updatedAt ?? event.createdAt,
      sourceCount: event.sourceId ? 1 : 0,
      citizenReportCount: event.type === "REPORT" ? 1 : 0,
      sourceEvent: event,
    }));
}

export function buildAtlasAlertQueue(events: CrisisEvent[]): AtlasAlertQueueItem[] {
  return [...events]
    .filter((event) => isActiveEvent(event) && ["HIGH", "CRITICAL"].includes(event.severity))
    .sort(
      (a, b) =>
        atlasSeverityRank[toAtlasSeverity(b.severity)] - atlasSeverityRank[toAtlasSeverity(a.severity)]
    )
    .slice(0, 8)
    .map((event) => ({
      id: event.id,
      level: event.severity === "CRITICAL" ? "critical" : "high",
      title: event.title,
      status: toAtlasIncidentStatus(event.status),
      occurredAt: event.updatedAt ?? event.createdAt,
      relatedModule: event.type === "SOS" ? "argus-aura" : undefined,
      suggestedAction:
        event.severity === "CRITICAL"
          ? "Revisar de inmediato y confirmar fuentes"
          : "Monitorear y validar con reportes ciudadanos",
    }));
}

export function buildAtlasCitizenReportsSummary(events: CrisisEvent[]): AtlasCitizenReportsSummary {
  const reports = events.filter((event) => event.type === "REPORT");
  return {
    newCount: reports.filter((event) => event.status === "NEW").length,
    pendingValidationCount: reports.filter((event) => event.status === "UNDER_REVIEW").length,
    confirmedCount: reports.filter((event) => ["VALIDATED", "ESCALATED"].includes(event.status)).length,
    discardedCount: reports.filter((event) => event.status === "DISCARDED").length,
    highReputationReporters: reports.filter((event) => (event.stillHappeningCount ?? 0) >= 3).length,
    withMediaEvidence: 0,
  };
}

export function buildAtlasSourceSummary(sources: CommandSourceHealth[]): AtlasSourceSummary {
  const active = sources.filter((source) => source.status === "ACTIVE");
  const degraded = sources.filter((source) => source.status === "DEGRADED");
  const lastUpdated = sources
    .map((source) => source.lastSeenAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return {
    activeCount: active.length,
    errorCount: degraded.length,
    lastUpdatedLabel: formatRelativeTime(lastUpdated),
    averageConfidenceLabel: sources.length > 0 ? "Confianza mixta (ver detalle por fuente)" : "Sin fuentes activas",
    contradictionCount: 0,
  };
}

export function buildAtlasRiskSummary(events: CrisisEvent[]): AtlasRiskSummary {
  const active = events.filter(isActiveEvent);
  const criticalEvents = active.filter((event) => event.severity === "CRITICAL");
  const highEvents = active.filter((event) => event.severity === "HIGH");

  const globalRisk =
    criticalEvents.length > 0 ? "critical" : highEvents.length > 0 ? "high" : active.length > 0 ? "medium" : "low";

  const topRiskZones = Array.from(
    new Set(
      [...criticalEvents, ...highEvents]
        .slice(0, 5)
        .map((event) => formatAtlasLocation(event))
    )
  );

  return {
    globalRisk,
    criticalEventCount: criticalEvents.length,
    topRiskZones,
    explanation:
      "Cálculo preliminar basado en severidad y volumen de eventos activos. El análisis avanzado será provisto por ARGUS TALOS.",
  };
}

export function buildAtlasModuleStatuses(
  userRole: ArgusRole,
  recommendedModuleIds: string[]
): AtlasModuleStatus[] {
  return argusModules
    .filter((module) => module.id !== "argus-atlas")
    .map((module) => {
      const access = canAccessModule(userRole, module);
      if (!access.canView) {
        return {
          moduleId: module.id,
          name: module.shortName,
          status: "restricted" as const,
          reason: "No visible para este rol",
        };
      }
      if (recommendedModuleIds.includes(module.id) && access.canEnter) {
        return {
          moduleId: module.id,
          name: module.shortName,
          status: "recommended" as const,
          reason: "Sugerido para el evento activo",
        };
      }
      if (!access.canEnter) {
        return {
          moduleId: module.id,
          name: module.shortName,
          status: "restricted" as const,
          reason: access.reason,
        };
      }
      if (module.status === "coming_soon") {
        return { moduleId: module.id, name: module.shortName, status: "pending" as const };
      }
      return { moduleId: module.id, name: module.shortName, status: "available" as const };
    });
}

export function buildAtlasKpis(
  events: CrisisEvent[],
  sourceSummary: AtlasSourceSummary,
  connectedModuleCount: number,
  lastUpdatedIso: string | null
): AtlasKpi[] {
  const active = events.filter(isActiveEvent);
  const critical = active.filter((event) => event.severity === "CRITICAL");
  const pendingReports = active.filter((event) => event.type === "REPORT" && event.status === "NEW");
  const riskZoneCount = new Set(active.filter((e) => ["HIGH", "CRITICAL"].includes(e.severity)).map((e) => formatAtlasLocation(e))).size;

  return [
    {
      id: "active-events",
      label: "Eventos activos",
      value: active.length,
      severity: active.length > 0 ? "medium" : "low",
      helperText: "Reportes, alertas y SOS sin resolver",
    },
    {
      id: "critical-events",
      label: "Eventos críticos",
      value: critical.length,
      severity: critical.length > 0 ? "critical" : "low",
      helperText: "Severidad crítica confirmada",
    },
    {
      id: "pending-reports",
      label: "Reportes pendientes",
      value: pendingReports.length,
      severity: pendingReports.length > 3 ? "medium" : "low",
      helperText: "Reportes ciudadanos por validar",
    },
    {
      id: "active-sources",
      label: "Fuentes activas",
      value: sourceSummary.activeCount,
      severity: sourceSummary.errorCount > 0 ? "medium" : "low",
      helperText: `${sourceSummary.errorCount} con degradación`,
    },
    {
      id: "risk-zones",
      label: "Zonas en riesgo",
      value: riskZoneCount,
      severity: riskZoneCount > 0 ? "high" : "low",
      helperText: "Zonas con severidad alta o crítica",
    },
    {
      id: "connected-modules",
      label: "Módulos conectados",
      value: connectedModuleCount,
      severity: "low",
      helperText: "Módulos ARGUS vinculados a eventos activos",
    },
    {
      id: "last-update",
      label: "Última actualización",
      value: formatRelativeTime(lastUpdatedIso),
      severity: "low",
      helperText: "Frescura de datos del centro de mando",
    },
  ];
}

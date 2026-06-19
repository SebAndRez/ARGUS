import type {
  AlertLifecycleStatus,
  AlertVerificationAction,
  CrisisEvent,
} from "@/types/crisis";

export type LifecycleTone = "info" | "warning" | "success" | "danger" | "muted";
export type RecommendationMode = "citizen" | "operator";

const lifecycleLabels: Record<AlertLifecycleStatus, string> = {
  new: "Nueva",
  verifying: "En verificación",
  confirmed: "Confirmada",
  responding: "En respuesta",
  resolved: "Resuelta",
  expired: "Expirada",
  dismissed: "Descartada",
};

const lifecycleTones: Record<AlertLifecycleStatus, LifecycleTone> = {
  new: "info",
  verifying: "warning",
  confirmed: "success",
  responding: "warning",
  resolved: "success",
  expired: "muted",
  dismissed: "danger",
};

const severityPriority: Record<CrisisEvent["severity"], number> = {
  LOW: 20,
  MEDIUM: 40,
  HIGH: 65,
  CRITICAL: 85,
};

const statusToLifecycle: Record<string, AlertLifecycleStatus> = {
  NEW: "new",
  RECEIVED: "new",
  UNDER_REVIEW: "verifying",
  VALIDATED: "confirmed",
  ASSIGNED: "responding",
  ESCALATED: "responding",
  RESOLVED: "resolved",
  DISCARDED: "dismissed",
  CANCELLED: "dismissed",
};

const clampScore = (score: number) => Math.max(0, Math.min(100, Math.round(score)));

export function getLifecycleStatus(event: CrisisEvent): AlertLifecycleStatus {
  if (event.isExpired) return "expired";
  if (event.lifecycleStatus) return event.lifecycleStatus;
  return statusToLifecycle[event.status?.trim().toUpperCase()] ?? "new";
}

export function getLifecycleLabel(status?: AlertLifecycleStatus | null): string {
  return lifecycleLabels[status ?? "new"];
}

export function getLifecycleTone(status?: AlertLifecycleStatus | null): LifecycleTone {
  return lifecycleTones[status ?? "new"];
}

export function isAlertExpired(event: CrisisEvent, now = new Date()): boolean {
  if (event.isExpired === true || getLifecycleStatus(event) === "expired") return true;
  if (!event.expiresAt) return false;

  const expiresAt = new Date(event.expiresAt);
  return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= now.getTime();
}

export function canReactivateAlert(event: CrisisEvent, now = new Date()): boolean {
  if (event.canReactivate === false) return false;
  return isAlertExpired(event, now) && getLifecycleStatus(event) !== "dismissed";
}

export function deriveConfidenceFromSignals(event: CrisisEvent): number {
  const signalCount =
    (event.stillHappeningCount ?? 0) +
    (event.notHappeningCount ?? 0) +
    (event.falseReportCount ?? 0);
  const explicitConfidence =
    event.aiConfidence ?? (signalCount === 0 ? event.confidence : null);
  const base =
    typeof explicitConfidence === "number" && Number.isFinite(explicitConfidence)
      ? explicitConfidence
      : event.type === "SOS"
        ? 62
        : getLifecycleStatus(event) === "confirmed"
          ? 78
          : 48;
  const stillHappening = event.stillHappeningCount ?? 0;
  const notHappening = event.notHappeningCount ?? 0;
  const falseReports = event.falseReportCount ?? 0;
  const verificationBonus = Math.min(24, stillHappening * 6);
  const contradictionPenalty = Math.min(30, notHappening * 7 + falseReports * 10);
  const lifecycleAdjustment =
    getLifecycleStatus(event) === "confirmed"
      ? 8
      : getLifecycleStatus(event) === "expired"
        ? -18
        : getLifecycleStatus(event) === "dismissed"
          ? -30
          : 0;

  return clampScore(base + verificationBonus - contradictionPenalty + lifecycleAdjustment);
}

export function derivePriorityScore(event: CrisisEvent): number {
  const confidence = deriveConfidenceFromSignals(event);
  const lifecycle = getLifecycleStatus(event);
  const lifecycleAdjustment =
    lifecycle === "responding"
      ? 8
      : lifecycle === "confirmed"
        ? 5
        : lifecycle === "expired" || lifecycle === "resolved"
          ? -25
          : lifecycle === "dismissed"
            ? -40
            : 0;
  const sosAdjustment = event.type === "SOS" ? 12 : 0;

  return clampScore(severityPriority[event.severity] + confidence * 0.2 + lifecycleAdjustment + sosAdjustment);
}

export function deriveWhyItMatters(event: CrisisEvent): string {
  if (getLifecycleStatus(event) === "expired") {
    return "La alerta perdió vigencia y necesita una nueva observación antes de volver a activarse.";
  }
  if (event.whyItMatters?.trim()) return event.whyItMatters;
  if (event.type === "SOS") return "Una persona pidió ayuda y la situación requiere atención prioritaria.";
  if (event.severity === "CRITICAL") return "Puede existir peligro inmediato para personas cercanas.";
  if (event.severity === "HIGH") return "La situación puede empeorar o afectar la movilidad del sector.";
  return "La información ciudadana ayuda a saber si la situación sigue activa o cambió.";
}

export function deriveRecommendedAction(
  event: CrisisEvent,
  mode: RecommendationMode = "citizen"
): string {
  const lifecycle = getLifecycleStatus(event);
  if (mode === "operator" && lifecycle === "expired") {
    return "Solicitar una nueva verificación antes de reactivar la alerta.";
  }
  if (mode === "operator" && lifecycle === "dismissed") {
    return "Mantener registro y revisar evidencia si aparecen nuevas señales.";
  }
  if (mode === "citizen" && lifecycle === "expired") {
    return "No asumas que sigue activa. Reactívala solo si realmente observas la situación.";
  }
  if (mode === "citizen" && lifecycle === "resolved") {
    return "La situación figura resuelta. Mantente atento a instrucciones oficiales.";
  }
  if (mode === "citizen" && lifecycle === "dismissed") {
    return "La alerta fue descartada. Reporta solo si aparece nueva evidencia.";
  }

  const explicit =
    mode === "operator"
      ? event.operatorRecommendedAction?.trim() ||
        event.recommendedAction?.trim() ||
        event.aiRecommendation?.trim()
      : event.recommendedAction?.trim() || event.aiRecommendation?.trim();
  if (explicit) return explicit;

  if (mode === "operator") {
    if (event.type === "SOS") return "Verificar ubicación, evaluar prioridad y coordinar respuesta.";
    return "Contrastar señales, actualizar el estado y mantener seguimiento geoespacial.";
  }

  if (event.type === "SOS") return "No te expongas. Despeja el acceso y sigue instrucciones oficiales.";
  if (event.severity === "CRITICAL") return "Aléjate del área y sigue instrucciones oficiales.";
  if (event.severity === "HIGH") return "Evita el sector y busca una ruta alternativa.";
  return "Mantén distancia y verifica solo si puedes hacerlo sin ponerte en riesgo.";
}

export function applyDemoVerification(
  event: CrisisEvent,
  action: AlertVerificationAction,
  verifiedAt = new Date()
): CrisisEvent {
  if (action === "cannot_verify") {
    return {
      ...event,
      lastUpdatedLabel: "Sin verificación nueva · respuesta demo registrada",
    };
  }

  const stillHappeningCount = event.stillHappeningCount ?? 0;
  const notHappeningCount = event.notHappeningCount ?? 0;
  const falseReportCount = event.falseReportCount ?? 0;
  const verificationCount = event.verificationCount ?? 0;
  const next: CrisisEvent = {
    ...event,
    verificationCount: verificationCount + 1,
    lastVerifiedAt: verifiedAt.toISOString(),
    lastUpdatedLabel: "Verificado recién en modo demo",
  };

  if (action === "still_happening") {
    next.stillHappeningCount = stillHappeningCount + 1;
    next.lifecycleStatus =
      getLifecycleStatus(event) === "confirmed" || getLifecycleStatus(event) === "responding"
        ? getLifecycleStatus(event)
        : "verifying";
  }

  if (action === "not_happening") {
    next.notHappeningCount = notHappeningCount + 1;
    next.lifecycleStatus = getLifecycleStatus(event) === "new" ? "verifying" : getLifecycleStatus(event);
  }

  if (action === "false_report") {
    next.falseReportCount = falseReportCount + 1;
    next.lifecycleStatus = "verifying";
  }

  if (action === "reactivate") {
    next.lifecycleStatus = "verifying";
    next.isExpired = false;
    next.canReactivate = false;
    next.stillHappeningCount = stillHappeningCount + 1;
    next.expiresAt = null;
  }

  next.confidence = deriveConfidenceFromSignals(next);
  next.priorityScore = derivePriorityScore(next);
  next.whyItMatters = deriveWhyItMatters(next);
  next.recommendedAction = deriveRecommendedAction(next, "citizen");
  next.operatorRecommendedAction = deriveRecommendedAction(next, "operator");

  return next;
}

export function enrichEventLifecycle(
  event: CrisisEvent,
  options: { expiredDemo?: boolean } = {}
): CrisisEvent {
  const lifecycleStatus = options.expiredDemo ? "expired" : getLifecycleStatus(event);
  const enriched: CrisisEvent = {
    ...event,
    lifecycleStatus,
    verificationCount: event.verificationCount ?? 0,
    stillHappeningCount: event.stillHappeningCount ?? 0,
    notHappeningCount: event.notHappeningCount ?? 0,
    falseReportCount: event.falseReportCount ?? 0,
    isExpired: options.expiredDemo || event.isExpired || lifecycleStatus === "expired",
    canReactivate:
      event.canReactivate ?? (options.expiredDemo || lifecycleStatus === "expired"),
  };

  return {
    ...enriched,
    confidence: deriveConfidenceFromSignals(enriched),
    priorityScore: event.priorityScore ?? derivePriorityScore(enriched),
    whyItMatters: deriveWhyItMatters(enriched),
    recommendedAction: deriveRecommendedAction(enriched, "citizen"),
    operatorRecommendedAction: deriveRecommendedAction(enriched, "operator"),
  };
}

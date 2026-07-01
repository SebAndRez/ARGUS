import type { SafetyCheck } from "@/types/mobileSafety";
import type {
  IncidentCommandView,
  IncidentPriority,
  IncidentSeverity,
} from "@/types/incident";

function priorityForSafetyCheck(check: SafetyCheck): IncidentPriority {
  if (check.status === "ESCALATED" || check.status === "USER_TRAPPED") {
    return "P1_HIGH";
  }
  if (check.status === "USER_NEEDS_HELP" || check.status === "USER_INJURED") {
    return "P2_MEDIUM";
  }
  if (check.status === "NO_RESPONSE") return "P3_LOW";
  return "P4_INFO";
}

function severityForSafetyCheck(check: SafetyCheck): IncidentSeverity {
  if (check.status === "ESCALATED" || check.status === "USER_TRAPPED") {
    return "HIGH";
  }
  if (check.status === "USER_NEEDS_HELP" || check.status === "USER_INJURED") {
    return "MEDIUM";
  }
  return "INFO";
}

export function buildIncidentFromSafetyCheck(
  check: SafetyCheck
): IncidentCommandView | null {
  if (
    typeof check.lastApproxLat !== "number" ||
    typeof check.lastApproxLng !== "number"
  ) {
    return null;
  }

  const priority = priorityForSafetyCheck(check);
  const severity = severityForSafetyCheck(check);
  const title =
    check.status === "ESCALATED"
      ? "Safety Check escalado"
      : check.status === "USER_SAFE"
        ? "Safety Check respondido"
        : "Safety Check post-sismo";

  return {
    id: `incident-${check.id}`,
    title,
    type: "mobile_safety",
    subtype: check.status.toLowerCase(),
    status: check.status === "USER_SAFE" ? "CLOSED" : "MONITORING",
    priority,
    severity,
    confidence: check.isDemo ? 58 : 70,
    locationLat: check.lastApproxLat,
    locationLng: check.lastApproxLng,
    radiusKm: check.lastAccuracyBand === "district" ? 4 : 12,
    sourceSummary: "ARGUS Mobile Safety Agent demo",
    argusSummary:
      "Check-in ciudadano de seguridad posterior a posible sacudida. No confirma emergencia medica ni ubicacion exacta.",
    recommendedAction:
      "Verifique respuesta del usuario y escale solo mediante protocolos humanos o fuentes oficiales.",
    officialStatus: "No oficial",
    createdAt: check.createdAt,
    updatedAt: check.respondedAt ?? check.escalationAt ?? check.createdAt,
    lastEvidenceAt: check.respondedAt ?? check.escalationAt ?? check.createdAt,
    isDemo: true,
    evidence: [
      {
        id: `evidence-${check.id}`,
        incidentId: `incident-${check.id}`,
        sourceType: "CITIZEN",
        sourceId: check.id,
        sourceName: "Mobile Safety Agent",
        evidenceKind: "SAFETY_CHECK",
        reliability: 55,
        confidenceImpact: 8,
        title: "Estado de check-in",
        summary: `Estado reportado: ${check.status}`,
        observedAt: check.respondedAt ?? check.createdAt,
        createdAt: check.createdAt,
      },
    ],
    timeline: [
      {
        id: `timeline-${check.id}`,
        incidentId: `incident-${check.id}`,
        entryType: "CREATED",
        title: "Safety Check creado",
        summary:
          "ARGUS genero un check-in demo. Requiere validacion humana si escala.",
        source: "ARGUS Mobile Safety",
        createdAt: check.createdAt,
      },
    ],
    links: [],
    priorityExplanation: {
      priority,
      score: priority === "P1_HIGH" ? 78 : priority === "P2_MEDIUM" ? 62 : 35,
      reasons: [`Estado actual: ${check.status}`],
      limitations: [
        "Demo Web/PWA: no representa background sensor nativo ni push real.",
      ],
    },
    recommendedActions: [
      "Revisar estado de respuesta.",
      "No escalar automaticamente sin politica operacional humana.",
    ],
    limitations: [
      "Ubicacion aproximada y opcional.",
      "No reemplaza llamadas de emergencia ni protocolos oficiales.",
    ],
  };
}

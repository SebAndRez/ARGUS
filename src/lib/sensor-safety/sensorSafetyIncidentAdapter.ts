import type { SensorSafetyDetection } from "@/types/sensorSafety";
import type {
  IncidentCommandView,
  IncidentEvidence,
  IncidentPriority,
  IncidentSeverity,
} from "@/types/incident";

function priorityForDetection(detection: SensorSafetyDetection): IncidentPriority {
  if (["USER_TRAPPED", "USER_INJURED"].includes(detection.status)) return "P1_HIGH";
  if (detection.status === "NO_RESPONSE" || detection.status === "ESCALATED") {
    return "P2_MEDIUM";
  }
  if (detection.status === "CHECK_IN_REQUIRED") return "P3_LOW";
  return "P4_INFO";
}

function severityForDetection(detection: SensorSafetyDetection): IncidentSeverity {
  if (detection.severity === "critical") return "CRITICAL";
  if (detection.severity === "high") return "HIGH";
  if (detection.severity === "medium") return "MEDIUM";
  if (detection.severity === "low") return "LOW";
  return "INFO";
}

function evidenceKind(detection: SensorSafetyDetection): IncidentEvidence["evidenceKind"] {
  if (detection.type === "VEHICLE_CRASH" || detection.type === "VEHICLE_ROLLOVER") {
    return "POSSIBLE_VEHICLE_CRASH";
  }
  if (detection.type === "HARD_FALL") return "POSSIBLE_FALL";
  if (detection.type === "NO_RESPONSE") return "NO_RESPONSE_CHECK_IN";
  return "SAFETY_CHECK";
}

export function buildIncidentFromSensorSafetyDetection(
  detection: SensorSafetyDetection
): IncidentCommandView | null {
  if (
    typeof detection.approximateLat !== "number" ||
    typeof detection.approximateLng !== "number"
  ) {
    return null;
  }

  const priority = priorityForDetection(detection);
  const now = new Date().toISOString();
  return {
    id: `incident-${detection.id}`,
    title: `Sensor Safety: ${detection.type}`,
    type: "mobile_safety",
    subtype: detection.module.toLowerCase(),
    status: detection.status === "RESOLVED" ? "CLOSED" : "ARGUS_HYPOTHESIS",
    priority,
    severity: severityForDetection(detection),
    confidence: detection.confidence,
    locationLat: detection.approximateLat,
    locationLng: detection.approximateLng,
    radiusKm: detection.accuracyBand === "district" ? 4 : 10,
    sourceSummary:
      "Deteccion preliminar por ARGUS Sensor Safety Suite. No confirma accidente ni lesion.",
    argusSummary: detection.argusSummary,
    recommendedAction: detection.recommendedAction,
    officialStatus: "No oficial",
    createdAt: detection.detectedAt,
    updatedAt: now,
    lastEvidenceAt: detection.detectedAt,
    isDemo: detection.isDemo,
    // Backed by src/lib/sensor-safety/sensorSafetyStore.ts's in-memory
    // store — never persisted, runtime-only.
    dataMode: "runtime_placeholder",
    persistent: false,
    severityMode: "simulated",
    evidence: [
      {
        id: `evidence-${detection.id}`,
        incidentId: `incident-${detection.id}`,
        sourceType: "SENSOR_SAFETY",
        sourceId: detection.id,
        sourceName: "ARGUS Sensor Safety Suite",
        evidenceKind: evidenceKind(detection),
        reliability: detection.confidence,
        confidenceImpact: Math.round(detection.confidence / 4),
        title: "Deteccion preliminar Sensor Safety",
        summary:
          "Deteccion preliminar por ARGUS Sensor Safety Suite. No confirma accidente ni lesion.",
        observedAt: detection.detectedAt,
        createdAt: detection.detectedAt,
      },
    ],
    timeline: [
      {
        id: `timeline-${detection.id}`,
        incidentId: `incident-${detection.id}`,
        entryType: "CREATED",
        title: "Deteccion preliminar",
        summary: detection.argusSummary,
        source: "ARGUS Sensor Safety",
        createdAt: detection.detectedAt,
      },
    ],
    links: [],
    priorityExplanation: {
      priority,
      score: detection.confidence,
      reasons: [
        "Sensor Safety genera una hipotesis preliminar.",
        "La prioridad requiere respuesta del usuario, evidencia externa o revision humana.",
      ],
      limitations: ["Nunca P0 solo por sensor o no respuesta."],
    },
    recommendedActions: [
      "Solicitar Safety Check.",
      "Verificar respuesta del usuario.",
      "Escalar solo si existe consentimiento y protocolo humano.",
    ],
    limitations: [
      "Demo/runtime web.",
      "Requiere app movil nativa para funcionar cerrada o minimizada.",
      "No reemplaza servicios de emergencia.",
    ],
  };
}

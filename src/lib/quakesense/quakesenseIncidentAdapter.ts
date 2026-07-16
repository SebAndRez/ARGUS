import { argusIncidentLimitations } from "@/lib/command/recommendedActions";
import type { IncidentCommandView, IncidentEvidence } from "@/types/incident";
import type { QuakeSenseCluster } from "@/types/quakesense";

function priorityForCluster(cluster: QuakeSenseCluster) {
  if (cluster.status === "OFFICIAL_CORRELATED" && cluster.signalCount >= 5) return "P1_HIGH" as const;
  if (cluster.signalCount >= 5) return "P2_MEDIUM" as const;
  if (cluster.signalCount >= 2) return "P3_LOW" as const;
  return "P4_INFO" as const;
}

export function buildQuakeSenseEvidence(cluster: QuakeSenseCluster): IncidentEvidence {
  return {
    id: `${cluster.id}-evidence`,
    incidentId: `incident-${cluster.id}`,
    sourceType: "CITIZEN",
    sourceId: cluster.id,
    sourceName: "ARGUS QuakeSense",
    evidenceKind: "SENSOR_SHAKE_PATTERN",
    reliability: cluster.confidence,
    confidenceImpact: Math.round(cluster.confidence / 3),
    title: "Patron ciudadano de sacudida",
    summary:
      "Patron de sacudida detectado por sensores ciudadanos. Estimacion ARGUS, no confirmacion oficial.",
    observedAt: cluster.firstDetectedAt,
    createdAt: cluster.lastDetectedAt,
  };
}

export function buildIncidentFromQuakeSenseCluster(
  cluster: QuakeSenseCluster
): IncidentCommandView {
  const evidence = buildQuakeSenseEvidence(cluster);
  const priority = priorityForCluster(cluster);
  const now = new Date().toISOString();

  return {
    id: `incident-${cluster.id}`,
    title: "ARGUS QuakeSense: posible sacudida detectada",
    type: "earthquake_sensor",
    subtype: "quakesense_web_pwa",
    status: cluster.status === "OFFICIAL_CORRELATED" ? "OFFICIAL_CONFIRMED" : "ARGUS_HYPOTHESIS",
    priority,
    severity: priority === "P1_HIGH" ? "HIGH" : priority === "P2_MEDIUM" ? "MEDIUM" : "INFO",
    confidence: cluster.confidence,
    locationLat: cluster.centerLat,
    locationLng: cluster.centerLng,
    radiusKm: cluster.radiusKm,
    sourceSummary: `${cluster.signalCount} senales ciudadanas agregadas.`,
    argusSummary: cluster.argusSummary,
    recommendedAction: cluster.recommendedAction,
    officialStatus:
      cluster.status === "OFFICIAL_CORRELATED"
        ? "Correlacionado con fuente oficial"
        : "Pendiente de confirmacion oficial",
    createdAt: cluster.firstDetectedAt,
    updatedAt: now,
    lastEvidenceAt: cluster.lastDetectedAt,
    isDemo: cluster.isDemo,
    // Backed entirely by src/lib/quakesense/quakesenseMemoryStore.ts, a
    // `globalThis` store — never persisted, reset on every restart/cold
    // start, so this is a runtime placeholder regardless of `cluster.isDemo`.
    dataMode: "runtime_placeholder",
    persistent: false,
    severityMode: "simulated",
    evidence: [evidence],
    timeline: [
      {
        id: `${cluster.id}-created`,
        incidentId: `incident-${cluster.id}`,
        entryType: "CREATED",
        title: "Alerta preliminar QuakeSense",
        summary: cluster.argusSummary,
        source: "ARGUS QuakeSense",
        createdAt: cluster.firstDetectedAt,
      },
    ],
    links: [],
    priorityExplanation: {
      priority,
      score: cluster.confidence,
      reasons: [
        "Red ciudadana de sensores detecto posible patron de sacudida.",
        "Prioridad limitada hasta confirmacion oficial o evidencia adicional.",
      ],
      limitations: ["Nunca P0 sin fuente oficial, dano masivo o SOS critico."],
    },
    recommendedActions: [
      "Verificar CSN, SENAPRED, SHOA, USGS o fuente oficial competente.",
      "Mantener como alerta preliminar hasta correlacion externa.",
      "Revisar reportes ciudadanos cercanos si aparecen.",
    ],
    limitations: argusIncidentLimitations,
  };
}

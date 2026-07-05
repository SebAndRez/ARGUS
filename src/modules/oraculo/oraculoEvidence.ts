import type { VigiaReport } from "@/modules/vigia/types";
import type {
  OraculoAtlasSummary,
  OraculoConnector,
  OraculoContradiction,
  OraculoEvidence,
  OraculoFenixEvidencePacket,
  OraculoSource,
  OraculoTalosEvidencePacket,
} from "@/modules/oraculo/types";

const vigiaTypeToCategory: Record<string, OraculoEvidence["category"]> = {
  fire: "wildfire",
  smoke: "wildfire",
  earthquake_damage: "earthquake",
  flood: "flood",
  landslide: "infrastructure",
  road_block: "infrastructure",
  traffic_accident: "infrastructure",
  medical_emergency: "citizen_report",
  public_disorder: "citizen_report",
  infrastructure_damage: "infrastructure",
  power_outage: "infrastructure",
  missing_person_context: "citizen_report",
  animal_risk: "other",
  other: "other",
};

/**
 * Convierte un `VigiaReport` en `OraculoEvidence` interna. No importa datos
 * sensibles a la vista pública: el alias del reportante se mantiene (ya es
 * público en VIGÍA), pero no se agregan campos de identidad adicionales.
 *
 * Reglas:
 * - confirmado -> sube score y queda `verified`/`partially_verified`;
 * - pendiente/en revisión -> evidencia no verificada;
 * - rechazado -> no debe alimentar evidencia activa (retorna `null`);
 * - duplicado -> se conserva pero etiquetado para agrupación, no se descarta.
 */
export function convertVigiaReportToOraculoEvidence(report: VigiaReport): OraculoEvidence | null {
  if (report.status === "rejected") return null;

  const reputationBoost = Math.min(15, Math.round(report.reporter.reputationScore / 10));
  const evidenceBoost = report.evidence.length > 0 ? 10 : 0;
  let baseScore = 30 + reputationBoost + evidenceBoost;

  let verificationStatus: OraculoEvidence["verificationStatus"] = "unverified";
  if (report.status === "confirmed") {
    verificationStatus = "verified";
    baseScore += 20;
  } else if (report.status === "escalated") {
    verificationStatus = "partially_verified";
    baseScore += 10;
  } else if (report.status === "under_review") {
    verificationStatus = "pending_review";
  }

  const tags = [...(report.tags ?? []), report.type];
  if (report.status === "duplicate") tags.push("duplicate_group");

  return {
    id: `oraculo-vigia-${report.id}`,
    title: report.title,
    summary: report.description,
    sourceId: "argus-vigia-reports",
    sourceName: "ARGUS VIGÍA",
    sourceType: "citizen",
    category: vigiaTypeToCategory[report.type] ?? "citizen_report",
    relatedReportId: report.id,
    relatedModule: "VIGIA",
    observedAt: report.createdAt,
    collectedAt: report.updatedAt,
    location: {
      lat: report.location.lat,
      lng: report.location.lng,
      label: report.location.label,
      isApproximate: report.location.isApproximate,
    },
    confidence: report.confidence === "unknown" ? "unknown" : report.confidence,
    reliabilityScore: Math.max(0, Math.min(100, baseScore)),
    verificationStatus,
    contradictionStatus: "none",
    tags,
    attribution: report.reporter.alias,
    isDemo: report.isDemo,
  };
}

/**
 * Resumen tipado que ATLAS podrá consumir para mostrar el estado de
 * evidencia/fuentes de ORÁCULO. No se conecta automáticamente aquí — solo
 * se prepara el dato.
 */
export function getOraculoAtlasSummary(
  evidenceList: OraculoEvidence[],
  sourceList: OraculoSource[],
  contradictionList: OraculoContradiction[]
): OraculoAtlasSummary {
  const activeSources = sourceList.filter((source) => source.status === "active").length;
  const degradedSources = sourceList.filter((source) => source.status === "degraded" || source.status === "manual_review").length;
  const averageConfidence =
    evidenceList.length > 0
      ? Math.round(evidenceList.reduce((sum, evidence) => sum + evidence.reliabilityScore, 0) / evidenceList.length)
      : 0;
  const criticalEvidenceCount = evidenceList.filter(
    (evidence) => evidence.confidence === "low" || evidence.confidence === "unknown"
  ).length;
  const openContradictions = contradictionList.filter((contradiction) => contradiction.requiresHumanReview).length;

  const eventIds = new Set(evidenceList.map((evidence) => evidence.relatedEventId ?? evidence.relatedReportId).filter(Boolean));
  let eventsWithInsufficientEvidence = 0;
  let eventsWithStrongEvidence = 0;
  eventIds.forEach((eventId) => {
    const related = evidenceList.filter(
      (evidence) => evidence.relatedEventId === eventId || evidence.relatedReportId === eventId
    );
    if (related.length <= 1 && related.every((e) => e.confidence === "low" || e.confidence === "unknown")) {
      eventsWithInsufficientEvidence += 1;
    }
    if (related.length >= 2 && related.some((e) => e.confidence === "high" || e.confidence === "verified")) {
      eventsWithStrongEvidence += 1;
    }
  });

  return {
    activeSources,
    averageConfidence,
    criticalEvidenceCount,
    openContradictions,
    eventsWithInsufficientEvidence,
    eventsWithStrongEvidence,
    degradedSources,
  };
}

/**
 * Prepara evidencia verificada/con ubicación para que TALOS calcule riesgo
 * operacional a futuro. ORÁCULO no calcula el riesgo final.
 */
export function prepareEvidenceForTalos(
  evidenceList: OraculoEvidence[],
  contradictionList: OraculoContradiction[] = []
): OraculoTalosEvidencePacket[] {
  return evidenceList
    .filter((evidence) => evidence.confidence !== "unknown")
    .map((evidence) => {
      const relatedContradictions = contradictionList.filter((contradiction) =>
        contradiction.evidenceIds.includes(evidence.id)
      );
      const warnings: string[] = [];
      if (!evidence.location?.lat) warnings.push("Sin ubicación precisa.");
      if (evidence.verificationStatus === "unverified") warnings.push("Evidencia sin verificar.");

      return {
        evidenceId: evidence.id,
        category: evidence.category,
        reliabilityScore: evidence.reliabilityScore,
        hasLocation: Boolean(evidence.location?.lat && evidence.location?.lng),
        observedAt: evidence.observedAt,
        collectedAt: evidence.collectedAt,
        contradictionIds: relatedContradictions.map((c) => c.id),
        warnings,
      };
    });
}

/**
 * Placeholder de preparación de evidencia histórica/contextual para
 * escenarios futuros de FÉNIX. Solo entrega datos limpios y trazables — no
 * simula nada.
 */
export function prepareEvidenceForFenixScenario(evidenceList: OraculoEvidence[]): OraculoFenixEvidencePacket[] {
  return evidenceList.map((evidence) => ({
    evidenceId: evidence.id,
    title: evidence.title,
    summary: evidence.summary,
    category: evidence.category,
    location: evidence.location,
    collectedAt: evidence.collectedAt,
    reliabilityScore: evidence.reliabilityScore,
    tags: evidence.tags,
  }));
}

/**
 * Conectores mock/placeholder. Ninguno hace llamadas reales todavía — el
 * proyecto ya tiene adaptadores propios para USGS/Open-Meteo/ReliefWeb/GDACS
 * (`src/lib/knowledge-intake/*`, `src/app/api/knowledge-intake/live/*`);
 * este archivo solo declara la interfaz de conector que ORÁCULO usará
 * cuando se decida exponerlos aquí también.
 */
export const oraculoConnectors: OraculoConnector[] = [
  { id: "connector-usgs", sourceId: "usgs_earthquake", name: "USGS Earthquake", enabled: true, requiresApiKey: false },
  { id: "connector-open-meteo", sourceId: "open-meteo", name: "Open-Meteo", enabled: true, requiresApiKey: false },
  { id: "connector-reliefweb", sourceId: "reliefweb", name: "ReliefWeb", enabled: false, requiresApiKey: true },
  { id: "connector-gdelt", sourceId: "gdelt", name: "GDELT", enabled: true, requiresApiKey: false },
  { id: "connector-wmo", sourceId: "wmo", name: "WMO", enabled: false, requiresApiKey: false },
  { id: "connector-vigia", sourceId: "argus-vigia-reports", name: "ARGUS VIGÍA", enabled: true, requiresApiKey: false },
];

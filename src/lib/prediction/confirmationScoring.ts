import type {
  ArgusProbabilityBand,
  ArgusRiskEvidence,
  ArgusRiskStatus,
} from "@/types/riskAssessment";
import { clampScore } from "@/lib/prediction/evidenceScoring";

export type ArgusSourceReliability =
  | "citizen"
  | "official"
  | "technical"
  | "visual"
  | "historical"
  | "unknown";

export interface ArgusReliabilityClassification {
  band: ArgusSourceReliability;
  reliable: boolean;
  score: number;
  label: string;
}

export interface ArgusConfidenceSummary {
  confidence: number;
  status: ArgusRiskStatus;
  probabilityBand: ArgusProbabilityBand;
  independentConfirmations: number;
  hasOfficialSource: boolean;
  hasCitizenReport: boolean;
  hasHistoricalContext: boolean;
  label: string;
  explanation: string;
}

const OFFICIAL_SOURCE_IDS = new Set([
  "usgs",
  "usgs_earthquake",
  "gdacs",
  "noaa",
  "noaa_tsunami",
  "nasa_firms",
  "met_norway",
  "reliefweb",
  "senapred",
  "shoa",
]);

const VISUAL_KIND_HINTS = ["camera", "visual", "stream", "source_visual"];
const HISTORICAL_KIND_HINTS = ["historical", "knowledge", "doctrinal"];

function normalize(value?: string | null) {
  return value?.trim().toLowerCase().replace(/-/g, "_") ?? "";
}

function confidenceBand(confidence: number): ArgusProbabilityBand {
  if (confidence >= 85) return "critical";
  if (confidence >= 70) return "high";
  if (confidence >= 45) return "medium";
  if (confidence >= 20) return "low";
  return "very_low";
}

function statusFromConfirmation(
  confidence: number,
  hasOfficialSource: boolean,
  independentConfirmations: number
): ArgusRiskStatus {
  if (hasOfficialSource && independentConfirmations >= 2 && confidence >= 88) {
    return "confirmed";
  }
  if (confidence >= 70) return "probable";
  if (confidence >= 40) return "possible";
  if (confidence >= 20) return "watch";
  return "insufficient_data";
}

export function classifySourceReliability(
  sourceId?: string | null,
  evidenceKind?: string | null
): ArgusReliabilityClassification {
  const normalizedSource = normalize(sourceId);
  const normalizedKind = normalize(evidenceKind);

  if (
    normalizedSource === "citizen_report" ||
    normalizedSource === "report" ||
    normalizedKind.includes("citizen") ||
    normalizedKind.includes("report")
  ) {
    return {
      band: "citizen",
      reliable: true,
      score: 42,
      label: "Reporte ciudadano",
    };
  }

  if (
    HISTORICAL_KIND_HINTS.some((hint) => normalizedKind.includes(hint)) ||
    normalizedSource.includes("knowledge")
  ) {
    return {
      band: "historical",
      reliable: false,
      score: 18,
      label: "Contexto historico",
    };
  }

  if (
    VISUAL_KIND_HINTS.some((hint) => normalizedKind.includes(hint)) ||
    normalizedSource.includes("camera")
  ) {
    return {
      band: "visual",
      reliable: true,
      score: 35,
      label: "Fuente visual auxiliar",
    };
  }

  if (OFFICIAL_SOURCE_IDS.has(normalizedSource)) {
    return {
      band: "official",
      reliable: true,
      score: 78,
      label: "Fuente oficial",
    };
  }

  if (normalizedSource) {
    return {
      band: "technical",
      reliable: true,
      score: 62,
      label: "Fuente tecnica",
    };
  }

  return {
    band: "unknown",
    reliable: false,
    score: 25,
    label: "Evidencia no clasificada",
  };
}

export function countIndependentConfirmations(evidence: ArgusRiskEvidence[]) {
  const independentSources = new Set<string>();

  evidence.forEach((item, index) => {
    const classification = classifySourceReliability(item.sourceId, item.kind);
    if (!classification.reliable || classification.band === "historical") return;
    const sourceKey =
      classification.band === "citizen"
        ? `${normalize(item.sourceId) || "citizen"}:${item.externalEventId ?? item.id ?? index}`
        : normalize(item.sourceId) || item.id;
    independentSources.add(sourceKey);
  });

  return independentSources.size;
}

export function calculateArgusConfidenceFromEvidence(
  evidence: ArgusRiskEvidence[]
): ArgusConfidenceSummary {
  const classifications = evidence.map((item) =>
    classifySourceReliability(item.sourceId, item.kind)
  );
  const independentConfirmations = countIndependentConfirmations(evidence);
  const hasOfficialSource = classifications.some(
    (item) => item.band === "official"
  );
  const hasCitizenReport = classifications.some((item) => item.band === "citizen");
  const hasHistoricalContext = classifications.some(
    (item) => item.band === "historical"
  );
  const hasVisualOnly =
    classifications.length > 0 &&
    classifications.every((item) => item.band === "visual");

  let confidence = 30;
  let explanation =
    "Hipotesis inicial con evidencia limitada. Requiere confirmacion adicional.";

  if (evidence.length === 0) {
    confidence = 22;
    explanation = "Sin evidencia suficiente para elevar una hipotesis ARGUS.";
  } else if (hasVisualOnly) {
    confidence = 32;
    explanation =
      "Fuente visual disponible. ARGUS no analiza video automaticamente.";
  } else if (hasOfficialSource && independentConfirmations >= 2) {
    confidence = 82;
    explanation =
      "Hipotesis reforzada por multiples fuentes independientes.";
  } else if (hasOfficialSource) {
    confidence = 72;
    explanation =
      "Fuente oficial o tecnica primaria detectada. Se mantiene como estimacion.";
  } else if (hasCitizenReport && independentConfirmations >= 2) {
    confidence = 56;
    explanation =
      "Multiples reportes ciudadanos sugieren un patron, pero aun requiere validacion.";
  } else if (hasCitizenReport) {
    confidence = 38;
    explanation =
      "Hipotesis inicial basada en reporte ciudadano. Requiere confirmacion adicional.";
  } else if (independentConfirmations >= 2) {
    confidence = 68;
    explanation =
      "Evidencia tecnica de multiples fuentes sugiere posible relacion.";
  }

  if (hasHistoricalContext) {
    confidence += 6;
    explanation += " Contexto historico usado como apoyo, no como confirmacion.";
  }

  const normalizedConfidence = clampScore(confidence);
  const status = statusFromConfirmation(
    normalizedConfidence,
    hasOfficialSource,
    independentConfirmations
  );

  return {
    confidence: normalizedConfidence,
    status,
    probabilityBand: confidenceBand(normalizedConfidence),
    independentConfirmations,
    hasOfficialSource,
    hasCitizenReport,
    hasHistoricalContext,
    label:
      independentConfirmations >= 2
        ? "2+ confirmaciones"
        : hasOfficialSource
          ? "Fuente oficial"
          : hasCitizenReport
            ? "Reporte ciudadano"
            : "1 fuente",
    explanation,
  };
}

export function buildArgusHypothesisStatus(evidence: ArgusRiskEvidence[]) {
  return calculateArgusConfidenceFromEvidence(evidence);
}

export function getConfirmationBadges(evidence: ArgusRiskEvidence[]) {
  const summary = calculateArgusConfidenceFromEvidence(evidence);
  const badges = [summary.label];

  if (summary.hasOfficialSource && summary.label !== "Fuente oficial") {
    badges.push("Fuente oficial");
  }
  if (summary.hasCitizenReport && summary.label !== "Reporte ciudadano") {
    badges.push("Reporte ciudadano");
  }
  if (summary.hasHistoricalContext) badges.push("Contexto historico");

  return badges;
}

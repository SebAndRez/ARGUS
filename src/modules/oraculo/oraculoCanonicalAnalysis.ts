import type { ModuleIncidentSummary } from "@/types/moduleOperationalContext";

/**
 * ARGUS Prompt 17 §13 — ORÁCULO sobre un incidente canónico.
 *
 * No se creó un motor nuevo de IA/análisis: el motor OSINT existente de
 * ORÁCULO (`oraculoScoring.ts`/`oraculoContradictions.ts`) opera sobre
 * `OraculoEvidence[]` con forma de reporte ciudadano/prensa — forzar un
 * `KnowledgeIncident` de Global Watch a esa forma sería semánticamente
 * incorrecto (un incidente de FIRMS/GDACS no es "evidencia OSINT" en el
 * sentido que ese motor espera). En su lugar, esta función construye una
 * anotación de análisis ligera y honesta directamente sobre los campos ya
 * agregados del incidente canónico (confianza, cantidad de fuentes,
 * verificación) — "conecta el análisis existente... cuando resulte
 * técnicamente válido" (Prompt 17 §13), sin inventar una segunda forma de
 * evidencia ni un segundo motor de contradicciones.
 */

export type OraculoCanonicalAnalysis = {
  analysisType: "source_reliability_snapshot";
  generatedAt: string;
  /** 0-100, derivado de `ArgusConfidence` del incidente — nunca inventado. */
  confidence: number;
  basedOnIncidentId: string;
  basedOnEvidenceCount: number;
  isPrediction: false;
  isOfficial: false;
  summary: string;
};

const CONFIDENCE_TO_SCORE: Record<ModuleIncidentSummary["confidence"], number> = {
  low: 30,
  medium: 55,
  medium_high: 70,
  high: 85,
  verified: 97,
};

export function buildOraculoCanonicalAnalysis(summary: ModuleIncidentSummary): OraculoCanonicalAnalysis {
  const score = CONFIDENCE_TO_SCORE[summary.confidence] ?? 50;
  const verificationText =
    summary.verificationStatus === "official"
      ? "El incidente proviene de una fuente reconocida como alerta oficial."
      : summary.verificationStatus === "corroborated"
        ? "El incidente está corroborado por una o más fuentes abiertas/técnicas."
        : summary.verificationStatus === "candidate"
          ? "El incidente es una señal preliminar, todavía sin corroboración suficiente."
          : "El incidente no tiene verificación institucional asociada.";

  return {
    analysisType: "source_reliability_snapshot",
    generatedAt: new Date().toISOString(),
    confidence: score,
    basedOnIncidentId: summary.id,
    basedOnEvidenceCount: summary.sourceSummary.sourceCount,
    isPrediction: false,
    isOfficial: false,
    summary: `${verificationText} Respaldado por ${summary.sourceSummary.sourceCount} fuente(s), fuente primaria: ${summary.sourceSummary.primarySource ?? "desconocida"}.`,
  };
}

import type {
  TalosAssessmentInput,
  TalosConfidenceLevel,
  TalosEscalationLikelihood,
  TalosImpactLevel,
  TalosRiskAssessment,
  TalosRiskFactor,
} from "@/modules/talos/types";
import { combineTalosRiskMatrix } from "@/modules/talos/talosRiskMatrix";
import { generateTalosExplanation } from "@/modules/talos/talosExplanations";
import { getTalosModuleRecommendations } from "@/modules/talos/talosRecommendations";
import { computeTalosPriorityRank } from "@/modules/talos/utils";

const RESOLVED_STATUSES = new Set(["RESOLVED", "resolved", "DISCARDED", "rejected", "CANCELLED"]);

function severityRank(severity?: string): number {
  const normalized = (severity ?? "").toUpperCase();
  if (normalized === "CRITICAL") return 3;
  if (normalized === "HIGH") return 2;
  if (normalized === "MEDIUM") return 1;
  return 0;
}

function baseImpactFromSeverity(severity?: string): TalosImpactLevel {
  const rank = severityRank(severity);
  if (rank === 3) return "severe";
  if (rank === 2) return "major";
  if (rank === 1) return "moderate";
  return "minor";
}

function bumpImpact(impact: TalosImpactLevel, steps: number): TalosImpactLevel {
  const order: TalosImpactLevel[] = ["minor", "moderate", "major", "severe", "catastrophic"];
  const index = Math.max(0, Math.min(order.length - 1, order.indexOf(impact) + steps));
  return order[index];
}

function bumpEscalation(escalation: TalosEscalationLikelihood, steps: number): TalosEscalationLikelihood {
  const order: TalosEscalationLikelihood[] = ["unlikely", "possible", "likely", "imminent", "active"];
  const index = Math.max(0, Math.min(order.length - 1, order.indexOf(escalation) + steps));
  return order[index];
}

function confidenceFromScore(score: number): TalosConfidenceLevel {
  if (score >= 85) return "verified";
  if (score >= 65) return "high";
  if (score >= 40) return "medium";
  if (score >= 15) return "low";
  return "unknown";
}

/**
 * Motor de scoring de TALOS: simple, explicable y ajustable. Cada factor
 * queda registrado con su contribución y su explicación — nada de "caja
 * negra". El riesgo final se calcula combinando impacto + escalamiento a
 * través de la matriz (`talosRiskMatrix.ts`), no solo un score aislado.
 */
export function calculateTalosRiskAssessment(input: TalosAssessmentInput): TalosRiskAssessment {
  const { event, vigiaSignal, oraculoSignal, context } = input;
  const factors: TalosRiskFactor[] = [];
  const now = Date.now();

  // 1. Severidad declarada del evento.
  const sevRank = severityRank(event.severity);
  const severityContribution = sevRank === 3 ? 30 : sevRank === 2 ? 20 : sevRank === 1 ? 10 : 0;
  factors.push({
    id: "severity",
    label: "Severidad del evento",
    type: "severity",
    weight: 30,
    contribution: severityContribution,
    direction: severityContribution > 0 ? "increases_risk" : "neutral",
    explanation: `Severidad declarada: ${event.severity ?? "desconocida"}.`,
  });

  // 2. Confianza de fuentes (ORÁCULO).
  const officialSources = oraculoSignal?.officialSourceCount ?? 0;
  const sourceConfidenceContribution = officialSources > 0 ? 12 : oraculoSignal ? 4 : 0;
  factors.push({
    id: "source_confidence",
    label: "Confianza de fuentes",
    type: "source_confidence",
    weight: 12,
    contribution: sourceConfidenceContribution,
    direction: sourceConfidenceContribution > 0 ? "increases_risk" : "neutral",
    explanation:
      officialSources > 0
        ? `${officialSources} fuente(s) oficial(es) respaldan el evento.`
        : oraculoSignal
          ? "Evidencia externa disponible, sin fuente oficial confirmada."
          : "Sin evidencia externa de ORÁCULO disponible.",
  });

  // 3. Cantidad de reportes ciudadanos (VIGÍA).
  const reportCount = vigiaSignal?.reportCount ?? 0;
  const citizenContribution = reportCount >= 3 ? 12 : reportCount >= 1 ? 6 : 0;
  factors.push({
    id: "citizen_reports",
    label: "Reportes ciudadanos",
    type: "citizen_reports",
    weight: 12,
    contribution: citizenContribution,
    direction: citizenContribution > 0 ? "increases_risk" : "neutral",
    explanation:
      reportCount > 0
        ? `${reportCount} reporte(s) ciudadano(s) VIGÍA (${vigiaSignal?.confirmedCount ?? 0} confirmado(s)).`
        : "Sin reportes ciudadanos asociados.",
  });

  // 4. Evidencia verificada de ORÁCULO.
  const verifiedContribution = (oraculoSignal?.verifiedCount ?? 0) > 0 ? 8 : 0;
  factors.push({
    id: "verified_evidence",
    label: "Evidencia verificada",
    type: "source_confidence",
    weight: 8,
    contribution: verifiedContribution,
    direction: verifiedContribution > 0 ? "increases_risk" : "neutral",
    explanation:
      verifiedContribution > 0
        ? `${oraculoSignal?.verifiedCount} evidencia(s) verificada(s) por ORÁCULO.`
        : "Sin evidencia verificada todavía.",
  });

  // 5. Contradicciones abiertas — bajan confianza, no necesariamente el riesgo.
  const contradictionCount = oraculoSignal?.contradictionCount ?? 0;
  factors.push({
    id: "contradiction",
    label: "Contradicciones abiertas",
    type: "contradiction",
    weight: 0,
    contribution: 0,
    direction: "neutral",
    explanation:
      contradictionCount > 0
        ? `${contradictionCount} contradicción(es) detectada(s) por ORÁCULO: reduce la confianza del análisis, no oculta el riesgo.`
        : "Sin contradicciones detectadas.",
  });

  // 6. Cercanía a población o infraestructura crítica.
  const populationEstimate = context?.populationExposureEstimate ?? 0;
  const proximityContribution =
    (populationEstimate > 10000 ? 12 : populationEstimate > 1000 ? 6 : 0) + (context?.nearCriticalInfrastructure ? 8 : 0);
  factors.push({
    id: "population_exposure",
    label: "Exposición poblacional / infraestructura crítica",
    type: "population_exposure",
    weight: 20,
    contribution: proximityContribution,
    direction: proximityContribution > 0 ? "increases_risk" : "neutral",
    explanation:
      populationEstimate > 0
        ? `Estimación de ${populationEstimate.toLocaleString("es-CL")} persona(s) potencialmente expuestas${context?.nearCriticalInfrastructure ? ", cerca de infraestructura crítica" : ""}.`
        : context?.nearCriticalInfrastructure
          ? "Cercanía a infraestructura crítica."
          : "Sin datos de exposición poblacional.",
  });

  // 7. Antigüedad del evento.
  const referenceIso = event.updatedAt ?? event.createdAt;
  const ageHours = referenceIso ? (now - new Date(referenceIso).getTime()) / 3_600_000 : null;
  let timeContribution = 0;
  let timeExplanation = "Sin marca de tiempo confiable.";
  if (ageHours !== null && Number.isFinite(ageHours)) {
    if (ageHours <= 1) {
      timeContribution = 6;
      timeExplanation = "Evento muy reciente (última hora).";
    } else if (ageHours > 24) {
      timeContribution = -6;
      timeExplanation = "Evento con más de 24 horas de antigüedad sin resolución.";
    } else {
      timeExplanation = `Evento reportado hace ${Math.round(ageHours)} hora(s).`;
    }
  }
  factors.push({
    id: "time",
    label: "Antigüedad del evento",
    type: "time",
    weight: 6,
    contribution: timeContribution,
    direction: timeContribution > 0 ? "increases_risk" : timeContribution < 0 ? "reduces_risk" : "neutral",
    explanation: timeExplanation,
  });

  // 8. Posible afectación de rutas.
  const mobilityContribution = context?.routesAffected ? 8 : 0;
  factors.push({
    id: "mobility",
    label: "Afectación de rutas",
    type: "mobility",
    weight: 8,
    contribution: mobilityContribution,
    direction: mobilityContribution > 0 ? "increases_risk" : "neutral",
    explanation: context?.routesAffected ? "Rutas posiblemente afectadas por el evento." : "Sin afectación de rutas reportada.",
  });

  // 9. Impacto médico.
  const medicalRank = { none: 0, low: 3, medium: 8, high: 14, critical: 20 }[context?.medicalImpact ?? "none"];
  factors.push({
    id: "medical",
    label: "Impacto médico",
    type: "medical",
    weight: 20,
    contribution: medicalRank,
    direction: medicalRank > 0 ? "increases_risk" : "neutral",
    explanation: context?.medicalImpact && context.medicalImpact !== "none"
      ? `Impacto médico estimado: ${context.medicalImpact}.`
      : "Sin impacto médico estimado.",
  });

  // 10. Impacto logístico.
  const logisticsRank = { none: 0, low: 2, medium: 5, high: 8, critical: 12 }[context?.logisticsImpact ?? "none"];
  factors.push({
    id: "logistics",
    label: "Impacto logístico",
    type: "logistics",
    weight: 12,
    contribution: logisticsRank,
    direction: logisticsRank > 0 ? "increases_risk" : "neutral",
    explanation: context?.logisticsImpact && context.logisticsImpact !== "none"
      ? `Impacto logístico estimado: ${context.logisticsImpact}.`
      : "Sin impacto logístico estimado.",
  });

  // 11. Contexto meteorológico.
  const weatherRank = { none: 0, low: 2, medium: 6, high: 10, critical: 14 }[context?.weatherRisk ?? "none"];
  factors.push({
    id: "weather",
    label: "Contexto meteorológico",
    type: "weather",
    weight: 14,
    contribution: weatherRank,
    direction: weatherRank > 0 ? "increases_risk" : "neutral",
    explanation: context?.weatherRisk && context.weatherRisk !== "none"
      ? `Riesgo meteorológico contextual: ${context.weatherRisk}.`
      : "Sin riesgo meteorológico relevante.",
  });

  // 12. Estado del evento.
  const isClosed = RESOLVED_STATUSES.has(event.status ?? "");
  factors.push({
    id: "infrastructure",
    label: "Estado del evento",
    type: "infrastructure",
    weight: 0,
    contribution: isClosed ? -100 : 0,
    direction: isClosed ? "reduces_risk" : "neutral",
    explanation: isClosed ? `Evento en estado "${event.status}": riesgo minimizado.` : `Estado actual: ${event.status ?? "desconocido"}.`,
  });

  const rawScore = factors.reduce((sum, factor) => sum + factor.contribution, 0);
  const riskScore = Math.max(0, Math.min(100, Math.round(20 + rawScore)));

  // Impacto: severidad base + bump por exposición/medico/infraestructura.
  let impact = baseImpactFromSeverity(event.severity);
  const impactBumpSteps =
    (populationEstimate > 10000 ? 1 : 0) +
    (context?.medicalImpact === "critical" ? 1 : 0) +
    (context?.nearCriticalInfrastructure && sevRank >= 2 ? 1 : 0);
  impact = bumpImpact(impact, impactBumpSteps);

  // Escalamiento: estado + reportes recientes + clima.
  let escalation: TalosEscalationLikelihood = sevRank === 3 ? "likely" : sevRank === 2 ? "possible" : "unlikely";
  const escalationBumpSteps =
    ((vigiaSignal?.recentCount ?? 0) >= 3 ? 1 : 0) +
    (context?.weatherRisk === "critical" || context?.weatherRisk === "high" ? 1 : 0);
  escalation = bumpEscalation(escalation, escalationBumpSteps);
  if (isClosed) escalation = "unlikely";

  // Confianza: fuentes oficiales/verificadas suben, contradicciones y falta
  // de evidencia bajan — nunca reducen el riesgo directamente.
  let confidenceScore = 25;
  if (officialSources > 0) confidenceScore += 25;
  if ((oraculoSignal?.verifiedCount ?? 0) > 0) confidenceScore += 20;
  if ((oraculoSignal?.averageConfidenceScore ?? 0) >= 70) confidenceScore += 10;
  if ((vigiaSignal?.confirmedCount ?? 0) > 0) confidenceScore += 10;
  if (contradictionCount > 0) confidenceScore -= 20;
  if (oraculoSignal?.hasLicensePendingSource) confidenceScore -= 5;
  if (!vigiaSignal && !oraculoSignal) confidenceScore -= 15;
  confidenceScore = Math.max(0, Math.min(100, confidenceScore));
  const confidence = confidenceFromScore(confidenceScore);

  const matrix = combineTalosRiskMatrix(impact, escalation, confidence);
  const riskLevel = isClosed ? "minimal" : matrix.riskLevel;

  const draft: Omit<TalosRiskAssessment, "explanation" | "recommendations"> = {
    id: `talos-${event.id}`,
    eventId: event.id,
    title: event.title,
    category: event.category,
    riskLevel,
    riskScore: isClosed ? Math.min(riskScore, 10) : riskScore,
    confidence,
    impact,
    escalationLikelihood: escalation,
    priorityRank: computeTalosPriorityRank(riskLevel, riskScore, confidenceScore),
    location: event.location,
    factors,
    generatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceSummary: {
      vigiaReports: vigiaSignal?.reportCount ?? 0,
      oraculoEvidence: (oraculoSignal?.officialSourceCount ?? 0) + (oraculoSignal?.citizenSourceCount ?? 0),
      officialSources: oraculoSignal?.officialSourceCount ?? 0,
      citizenSources: oraculoSignal?.citizenSourceCount ?? (vigiaSignal ? vigiaSignal.reportCount : 0),
      contradictionCount,
    },
  };

  const recommendations = getTalosModuleRecommendations(draft as TalosRiskAssessment);
  const explanation = generateTalosExplanation({ ...draft, recommendations, explanation: "" } as TalosRiskAssessment);

  return { ...draft, recommendations, explanation };
}

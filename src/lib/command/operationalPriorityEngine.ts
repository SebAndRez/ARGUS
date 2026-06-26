import type {
  IncidentPriority,
  IncidentPriorityExplanation,
  IncidentSeverity,
} from "@/types/incident";

function priorityFromScore(score: number): IncidentPriority {
  if (score >= 85) return "P0_CRITICAL";
  if (score >= 68) return "P1_HIGH";
  if (score >= 45) return "P2_MEDIUM";
  if (score >= 22) return "P3_LOW";
  return "P4_INFO";
}

export function calculateOperationalPriority(input: {
  severity: IncidentSeverity;
  confidence: number;
  sourceTypes: string[];
  exposedPopulation?: number;
  officialConfirmed?: boolean;
  citizenReportCount?: number;
}): IncidentPriorityExplanation {
  const reasons: string[] = [];
  const limitations: string[] = [
    "Prioridad operacional para revision, no confirmacion automatica.",
  ];
  let score = Math.min(40, Math.max(0, input.confidence * 0.35));

  if (input.severity === "CRITICAL") {
    score += 35;
    reasons.push("Severidad critica reportada.");
  } else if (input.severity === "HIGH") {
    score += 24;
    reasons.push("Severidad alta reportada.");
  } else if (input.severity === "MEDIUM") {
    score += 13;
  }

  if (input.officialConfirmed) {
    score += 30;
    reasons.push("Fuente oficial o tecnica fuerte presente.");
  }

  const independentSources = new Set(input.sourceTypes).size;
  if (independentSources >= 2) {
    score += 18;
    reasons.push("Dos o mas fuentes independientes elevan prioridad.");
  }

  if ((input.citizenReportCount ?? 0) >= 3) {
    score += 10;
    reasons.push("Multiples reportes ciudadanos cercanos requieren verificacion.");
  }

  if ((input.exposedPopulation ?? 0) > 10000) {
    score += 15;
    reasons.push("Poblacion potencialmente expuesta relevante.");
  }

  const finalScore = Math.min(100, Math.round(score));
  const priority = priorityFromScore(finalScore);

  if (reasons.length === 0) {
    reasons.push("Evidencia limitada; mantener monitoreo.");
  }

  return {
    priority,
    score: finalScore,
    reasons,
    limitations,
  };
}

import type { TalosAtlasSummary, TalosRiskAssessment } from "@/modules/talos/types";

/**
 * Resumen tipado que ATLAS podrá consumir como "panel de riesgo avanzado".
 * No se conecta automáticamente aquí — solo se prepara el dato.
 */
export function getTalosAtlasSummary(assessments: TalosRiskAssessment[]): TalosAtlasSummary {
  const criticalEvents = assessments.filter((a) => a.riskLevel === "critical").length;
  const highEvents = assessments.filter((a) => a.riskLevel === "high").length;

  const topPriority = [...assessments].sort((a, b) => b.priorityRank - a.priorityRank)[0] ?? null;

  const averageRiskScore =
    assessments.length > 0
      ? Math.round(assessments.reduce((sum, a) => sum + a.riskScore, 0) / assessments.length)
      : 0;

  const recentThreshold = Date.now() - 3 * 60 * 60 * 1000;
  const recentAssessments = assessments.filter((a) => new Date(a.generatedAt).getTime() >= recentThreshold).length;

  const recommendedModules = Array.from(
    new Set(assessments.flatMap((a) => a.recommendations.map((r) => r.moduleId)))
  );

  const lowConfidenceEvents = assessments.filter((a) => a.confidence === "unknown" || a.confidence === "low").length;
  const eventsWithContradictions = assessments.filter((a) => a.sourceSummary.contradictionCount > 0).length;

  return {
    criticalEvents,
    highEvents,
    topPriorityAssessmentId: topPriority?.id ?? null,
    averageRiskScore,
    recentAssessments,
    recommendedModules,
    lowConfidenceEvents,
    eventsWithContradictions,
  };
}

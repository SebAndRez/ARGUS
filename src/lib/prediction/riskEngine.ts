import type { Prisma } from "@prisma/client";
import type { ArgusNormalizedEvent } from "@/types/ingestion";
import type {
  ArgusRiskAssessment,
  ArgusRiskEngineInput,
} from "@/types/riskAssessment";
import { findHistoricalHazardContext } from "@/lib/prediction/historicalContext";
import { evaluateEarthquakeImpactRisk } from "@/lib/prediction/rules/earthquakeImpactRisk";
import { evaluateFireSmokeRisk } from "@/lib/prediction/rules/fireSmokeRisk";
import { evaluateHumanitarianImpactRisk } from "@/lib/prediction/rules/humanitarianImpactRisk";
import { evaluateTsunamiRisk } from "@/lib/prediction/rules/tsunamiRisk";

const SEVERITY_RANK: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function generateRiskAssessments(
  input: ArgusRiskEngineInput
): ArgusRiskAssessment[] {
  const assessments = [
    ...evaluateTsunamiRisk(input.externalEvents),
    ...evaluateEarthquakeImpactRisk(input.externalEvents),
    ...evaluateFireSmokeRisk(input.externalEvents),
    ...evaluateHumanitarianImpactRisk(input.externalEvents),
  ];

  const withContext = assessments.map((assessment) => {
    const relatedEvents = input.externalEvents.filter((event) =>
      assessment.relatedExternalEventIds.includes(event.id)
    );
    const historicalContext = findHistoricalHazardContext(
      relatedEvents.length > 0 ? relatedEvents : input.externalEvents,
      input.historicalFacts ?? [],
      input.historicalDocuments ?? []
    );

    return historicalContext ? { ...assessment, historicalContext } : assessment;
  });

  return Array.from(
    new Map(withContext.map((assessment) => [assessment.id, assessment])).values()
  )
    .sort((left, right) => {
      const severityDelta =
        (SEVERITY_RANK[right.severity] ?? 0) -
        (SEVERITY_RANK[left.severity] ?? 0);
      if (severityDelta !== 0) return severityDelta;
      const probabilityDelta = right.probabilityScore - left.probabilityScore;
      if (probabilityDelta !== 0) return probabilityDelta;
      return right.confidence - left.confidence;
    })
    .slice(0, 5);
}

export function riskAssessmentToJson(
  assessment: ArgusRiskAssessment
): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(assessment)) as Prisma.InputJsonValue;
}

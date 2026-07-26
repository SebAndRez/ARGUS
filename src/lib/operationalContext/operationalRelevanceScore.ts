import { priorityRank } from "@/lib/criticalPoi/criticalPoiTypes";
import { getCategoryWeight } from "@/data/threatResourceMatrix";
import type { OperationalResourceCandidate, ResourceOperationalState, ThreatResourceProfile } from "@/types/operationalContext";

/**
 * ARGUS Operational Context Engine — Fase 5 (Operational Relevance Score).
 *
 * Función pura, sin I/O — variables: distancia, estado operacional,
 * prioridad (`CriticalPriority`, reutiliza `priorityRank` de
 * `criticalPoiTypes.ts`), peso de categoría por amenaza (Fase 4/matrix), y
 * una penalización cuando el recurso mismo está dentro del área de impacto
 * (`atRisk` — un hospital adentro del polígono del incendio es menos útil
 * como destino seguro, aunque exista y esté "operativo").
 */

const STATE_FACTOR: Record<ResourceOperationalState, number> = {
  operational: 1,
  limited: 0.75,
  unconfirmed: 0.6,
  saturated: 0.5,
  out_of_service: 0.1,
  evacuated: 0.05,
  closed: 0.05,
};

const MIN_DISTANCE_FACTOR = 0.1;
const AT_RISK_FACTOR = 0.5;
const UNAVAILABLE_PROVIDER_SCORE = 1;

export interface ScoreResourceContext {
  profile: ThreatResourceProfile;
  state: ResourceOperationalState;
  radiusKm: number;
  atRisk: boolean;
}

export function scoreResource(candidate: OperationalResourceCandidate, ctx: ScoreResourceContext): number {
  if (!candidate.providerAvailable) return UNAVAILABLE_PROVIDER_SCORE;

  const categoryWeight = getCategoryWeight(ctx.profile, candidate.category);
  const distanceFactor = Math.max(MIN_DISTANCE_FACTOR, 1 - candidate.distanceKm / Math.max(ctx.radiusKm, 1));
  const stateFactor = STATE_FACTOR[ctx.state];
  const priorityFactor = candidate.priority ? 1.2 - priorityRank[candidate.priority] * 0.1 : 1;
  const atRiskFactor = ctx.atRisk ? AT_RISK_FACTOR : 1;

  return Math.round(categoryWeight * distanceFactor * stateFactor * priorityFactor * atRiskFactor);
}

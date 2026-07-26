import { getCriticalPoiCategory } from "@/lib/criticalPoi/criticalPoiCategoryRegistry";
import { getExternalResourceProvider } from "@/data/externalResourceProviderRegistry";
import { RESOURCE_OPERATIONAL_STATE_LABELS } from "@/types/operationalContext";
import { deriveOperationalState } from "@/lib/operationalContext/resourceOperationalState";
import { scoreResource, type ScoreResourceContext } from "@/lib/operationalContext/operationalRelevanceScore";
import type { OperationalResourceCandidate, OperationalResourceCard, ThreatResourceProfile } from "@/types/operationalContext";

/**
 * ARGUS Operational Context Engine — Fase 7 (Operational Cards).
 *
 * Construye tarjetas ordenadas por relevancia a partir de los candidatos ya
 * reunidos (Fase 3), su estado operacional (Fase 8) y su puntaje (Fase 5).
 * Pura — no hace I/O, no re-consulta nada.
 */

function categoryLabel(candidate: OperationalResourceCandidate): string {
  if (candidate.kind === "critical_poi") {
    return getCriticalPoiCategory(candidate.category)?.label ?? candidate.category;
  }
  return getExternalResourceProvider(candidate.category as never)?.label ?? candidate.category;
}

function detailFor(candidate: OperationalResourceCandidate): string | undefined {
  if (candidate.kind === "external" && !candidate.providerAvailable) {
    return "Sin proveedor de datos configurado todavía";
  }
  return undefined;
}

export function buildOperationalCards(
  resources: OperationalResourceCandidate[],
  profile: ThreatResourceProfile,
  radiusKm: number,
  impactPolygonContains: (lat: number, lng: number) => boolean
): OperationalResourceCard[] {
  const cards = resources.map((candidate): OperationalResourceCard => {
    const atRisk = candidate.kind === "critical_poi" && impactPolygonContains(candidate.lat, candidate.lng);
    const state = candidate.poi ? deriveOperationalState(candidate.poi) : "unconfirmed";
    const scoreCtx: ScoreResourceContext = { profile, state, radiusKm, atRisk };

    return {
      id: candidate.id,
      category: candidate.category,
      categoryLabel: categoryLabel(candidate),
      name: candidate.name,
      distanceKm: candidate.providerAvailable ? Math.round(candidate.distanceKm * 10) / 10 : null,
      state,
      stateLabel: RESOURCE_OPERATIONAL_STATE_LABELS[state],
      priority: candidate.priority,
      score: scoreResource(candidate, scoreCtx),
      detail: detailFor(candidate),
      atRisk,
    };
  });

  return cards.sort((a, b) => b.score - a.score);
}

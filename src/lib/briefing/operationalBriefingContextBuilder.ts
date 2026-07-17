import { createHash } from "crypto";
import type { ModuleIncidentSummary } from "@/types/moduleOperationalContext";
import type { IncidentImpactAssessment } from "@/types/incidentImpactAssessment";
import type { TerritorialDossier } from "@/types/territorialDossier";
import {
  DEFAULT_CONTEXT_BUDGET,
  type ContextBudget,
  type ContextTruncationReport,
  type OperationalBriefingContext,
} from "@/types/operationalBriefing";
import { getArgusMarkerSeverityRank, normalizeArgusMapSeverity } from "@/lib/mapSymbols/argusMapSymbols";

/**
 * ARGUS — construcción del contexto operacional (Prompt 8, "Context
 * Builder" + "Context Serializer"). Compone, nunca recalcula: toma el
 * incidente canónico (Prompt 3/17), el análisis de impacto ya calculado
 * (Prompt 6) y el expediente territorial ya calculado (Prompt 7), y produce
 * una proyección mínima, acotada por `ContextBudget`, con procedencia
 * (`contextHash`) para detectar cambios sin comparar objetos completos.
 */

const CRITICAL_ASSET_PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 };

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

/**
 * Hash determinista y estable del contexto — usado para detectar si dos
 * cálculos del mismo incidente produjeron el mismo resultado sin comparar
 * objetos completos (Prompt 8 §28/§50: "contexto hash"). No es un secreto,
 * no requiere aleatoriedad — sha256 sobre una serialización estable basta.
 */
function computeContextHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

export interface BuildOperationalBriefingContextOptions {
  budget?: ContextBudget;
  now?: Date;
}

export function buildOperationalBriefingContext(
  incident: ModuleIncidentSummary,
  impact: IncidentImpactAssessment,
  dossier: TerritorialDossier,
  options: BuildOperationalBriefingContextOptions = {}
): OperationalBriefingContext {
  const budget = options.budget ?? DEFAULT_CONTEXT_BUDGET;
  const now = options.now ?? new Date();

  const sortedInfrastructure = [...impact.infrastructure.assets].sort(
    (a, b) => CRITICAL_ASSET_PRIORITY_RANK[a.priority] - CRITICAL_ASSET_PRIORITY_RANK[b.priority] || (a.distanceKm ?? 0) - (b.distanceKm ?? 0)
  );
  const infrastructure = sortedInfrastructure.slice(0, budget.maxInfrastructureAssets);

  const sortedRelatedIncidents = [...dossier.relatedIncidents.data].sort(
    (a, b) => getArgusMarkerSeverityRank(normalizeArgusMapSeverity(b.severity)) - getArgusMarkerSeverityRank(normalizeArgusMapSeverity(a.severity))
  );
  const relatedIncidents = sortedRelatedIncidents.slice(0, budget.maxRelatedIncidents);

  const sortedRelations = [...dossier.relationships].sort((a, b) => b.confidence - a.confidence);
  const relations = sortedRelations.slice(0, budget.maxRelations);

  const suggestedActions = impact.suggestedActions.slice(0, budget.maxActions).map((action) => ({
    ...action,
    action: truncateText(action.action, budget.maxTextLength),
    reason: truncateText(action.reason, budget.maxTextLength),
  }));

  const gaps = [...impact.limitations, ...dossier.limitations]
    .filter((line, index, all) => all.indexOf(line) === index) // dedup identical lines (population/routes/services overlap between impact and dossier)
    .slice(0, budget.maxGaps)
    .map((line) => truncateText(line, budget.maxTextLength));

  const truncation: ContextTruncationReport = {
    contextTruncated:
      infrastructure.length < sortedInfrastructure.length ||
      relatedIncidents.length < sortedRelatedIncidents.length ||
      relations.length < sortedRelations.length,
    omittedInfrastructureCount: Math.max(0, sortedInfrastructure.length - infrastructure.length),
    omittedRelatedIncidentCount: Math.max(0, sortedRelatedIncidents.length - relatedIncidents.length),
    omittedRelationCount: Math.max(0, sortedRelations.length - relations.length),
  };

  const contextForHash = {
    incidentId: incident.id,
    severity: incident.severity,
    confidence: incident.confidence,
    lifecycle: incident.lifecycle,
    updatedAt: incident.timing.updatedAt,
    infrastructure: infrastructure.map((asset) => `${asset.poiId}:${asset.spatialRelation}`),
    relatedIncidents: relatedIncidents.map((related) => related.id),
    relations: relations.map((relation) => relation.id),
    dossierStatus: dossier.overallStatus,
  };

  return {
    incident: {
      id: incident.id,
      title: incident.title,
      type: incident.type,
      severity: incident.severity,
      confidence: incident.confidence,
      lifecycle: incident.lifecycle,
      verificationStatus: incident.verificationStatus,
      primarySource: incident.sourceSummary.primarySource,
      sourceCount: incident.sourceSummary.sourceCount,
      startedAt: incident.timing.startedAt,
      updatedAt: incident.timing.updatedAt,
      isDemo: incident.isDemo,
    },
    territory: dossier.territory,
    relatedIncidents,
    infrastructure,
    infrastructureDataState: impact.infrastructure.dataState,
    populationAvailable: impact.population.dataState !== "NOT_AVAILABLE",
    populationReason: impact.population.dataState === "NOT_AVAILABLE" ? impact.population.reason : null,
    relations,
    suggestedActions,
    priority: { level: impact.priority.level, score: impact.priority.score, methodology: impact.priority.methodology },
    gaps,
    overallDossierStatus: dossier.overallStatus,
    truncation,
    contextHash: computeContextHash(contextForHash),
    generatedAt: now.toISOString(),
  };
}

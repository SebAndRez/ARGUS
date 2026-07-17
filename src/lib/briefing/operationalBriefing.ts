import type { ModuleIncidentSummary } from "@/types/moduleOperationalContext";
import { buildIncidentImpactAssessment } from "@/lib/impact/incidentImpactAssessment";
import { buildTerritorialDossier } from "@/lib/territory/territorialDossier";
import { buildOperationalBriefingContext } from "@/lib/briefing/operationalBriefingContextBuilder";
import { buildDeterministicBriefing } from "@/lib/briefing/deterministicBriefingBuilder";
import { compareBriefingContexts } from "@/lib/briefing/briefingComparison";
import { isGenerativeBriefingEnabled } from "@/lib/briefing/briefingLanguageProvider";
import type { BriefingComparisonResult, ContextBudget, DeterministicBriefing, OperationalBriefingContext } from "@/types/operationalBriefing";

/**
 * ARGUS — punto de entrada único de la síntesis operacional (Prompt 8).
 * Orquesta, en este orden, exactamente los servicios ya construidos en los
 * Prompts 6/7 — nunca recalcula severidad, confianza, impacto, territorio o
 * relaciones:
 *
 * incidente (Prompt 17) → impacto (Prompt 6) → expediente territorial
 * (Prompt 7) → contexto operacional → briefing determinista.
 *
 * La capa generativa opcional (`briefingLanguageProvider.ts`) nunca se
 * invoca aquí — `isGenerativeBriefingEnabled()` es permanentemente `false`
 * en este pase (ver docstring de ese módulo).
 */

export interface OperationalBriefingResult {
  context: OperationalBriefingContext;
  briefing: DeterministicBriefing;
  comparison: BriefingComparisonResult;
  generativeProviderStatus: "PREPARADO_DESHABILITADO";
}

export interface BuildOperationalBriefingOptions {
  budget?: ContextBudget;
  now?: Date;
  /** Contexto de una versión previa para comparar — no se resuelve automáticamente (sin persistencia en este pase, ver deuda técnica). */
  previousContext?: OperationalBriefingContext | null;
}

export async function buildOperationalBriefing(
  incident: ModuleIncidentSummary,
  options: BuildOperationalBriefingOptions = {}
): Promise<OperationalBriefingResult> {
  const now = options.now ?? new Date();

  const [impact, dossier] = await Promise.all([
    buildIncidentImpactAssessment(incident, { now }),
    buildTerritorialDossier(incident, { now }),
  ]);

  const context = buildOperationalBriefingContext(incident, impact, dossier, { budget: options.budget, now });
  const briefing = buildDeterministicBriefing(context);
  const comparison = compareBriefingContexts(options.previousContext ?? null, context);

  // isGenerativeBriefingEnabled() es siempre false en este pase — se
  // consulta aquí únicamente para dejar el punto de extensión conectado
  // (nunca se llama a briefingLanguageProvider.rewrite()).
  void isGenerativeBriefingEnabled();

  return { context, briefing, comparison, generativeProviderStatus: "PREPARADO_DESHABILITADO" };
}

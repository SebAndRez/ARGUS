import type {
  BriefingActionItem,
  BriefingFreshness,
  CompositeRiskSignal,
  DeterministicBriefing,
  InformationGap,
  OperationalBriefingContext,
} from "@/types/operationalBriefing";
import type { ImpactPriorityLevel } from "@/types/incidentImpactAssessment";

/**
 * ARGUS — briefing determinista (Prompt 8, "Deterministic Briefing
 * Builder"). Produce el resultado completo sin depender de ningún proveedor
 * generativo — regla crítica del mandato §13: la ausencia de un LLM no debe
 * romper el detalle del incidente, Command Center, AURA, FÉNIX, VIGÍA ni
 * notificaciones. Este módulo es, por diseño, la única fuente de verdad del
 * briefing en este pase (ver `briefingLanguageProvider.ts` — nunca invocado).
 */

export const BRIEFING_VERSION = "1.0.0";

const LIFECYCLE_LABEL: Record<string, string> = {
  active: "ACTIVO",
  monitoring: "MONITOREO",
  confirmed: "ACTIVO",
  risk: "EN VERIFICACIÓN",
  observation: "EN VERIFICACIÓN",
  resolved: "RESUELTO",
  archived: "EXPIRADO",
};

function lifecycleLabel(lifecycle: string): string {
  return LIFECYCLE_LABEL[lifecycle] ?? lifecycle.toUpperCase();
}

function buildExecutiveSummary(context: OperationalBriefingContext): string {
  const { incident, priority } = context;
  const territoryLabel = describeTerritory(context);
  const insideOrBorderCount = context.infrastructure.filter(
    (asset) => asset.spatialRelation === "INSIDE" || asset.spatialRelation === "BORDER"
  ).length;
  const topAction = context.suggestedActions[0]?.action;

  const parts = [
    `${incident.title} (${incident.type}) — severidad ${incident.severity}, confianza ${incident.confidence}.`,
    `Ubicación: ${territoryLabel}.`,
    insideOrBorderCount > 0
      ? `${insideOrBorderCount} activo(s) crítico(s) dentro/en el borde del área.`
      : "Sin infraestructura crítica confirmada dentro del área.",
    `Prioridad operacional: ${priority.level}.`,
    topAction ? `Acción principal: ${topAction}` : "Sin acción prioritaria calculada.",
  ];
  return parts.join(" ");
}

function describeTerritory(context: OperationalBriefingContext): string {
  const { territory } = context;
  if (territory.intersectedAdministrativeAreas.length > 0) return territory.intersectedAdministrativeAreas.join(", ");
  if (territory.regionCode) return `región ${territory.regionCode}${territory.countryCode ? `, ${territory.countryCode}` : ""}`;
  return "territorio no resuelto";
}

function buildCompositeRisks(context: OperationalBriefingContext): CompositeRiskSignal[] {
  const risks: CompositeRiskSignal[] = [];
  const insideOrBorder = context.infrastructure.filter(
    (asset) => asset.spatialRelation === "INSIDE" || asset.spatialRelation === "BORDER"
  );
  const isHighSeverity = context.incident.severity === "high" || context.incident.severity === "critical";

  // Única regla implementada en este pase: severidad alta/crítica + al
  // menos un activo crítico real dentro/en el borde del área — reutiliza
  // exclusivamente señales ya calculadas (severidad canónica + clasificación
  // espacial del Prompt 6), nunca inventa una correlación física
  // (lluvia+suelo+pendiente, etc.) para la que ARGUS no tiene datos reales
  // conectados (mandato §19: "no usar un LLM para inventar correlaciones" —
  // tampoco una regla nueva sin fuente real).
  if (isHighSeverity && insideOrBorder.length > 0) {
    risks.push({
      rule: "Severidad alta/crítica + infraestructura crítica real dentro del área",
      conditionsPresent: [
        `Severidad: ${context.incident.severity}`,
        `${insideOrBorder.length} activo(s) crítico(s) dentro/en el borde`,
      ],
      conditionsMissing: [],
      level: insideOrBorder.length >= 3 ? "critical" : "high",
      confidence: context.infrastructureDataState === "CALCULATED" ? 70 : 40,
      recommendation: "Priorizar verificación del estado operacional de los activos listados en Impacto.",
    });
  } else if (isHighSeverity) {
    risks.push({
      rule: "Severidad alta/crítica + infraestructura crítica real dentro del área",
      conditionsPresent: [`Severidad: ${context.incident.severity}`],
      conditionsMissing: ["Infraestructura crítica confirmada dentro/en el borde del área"],
      level: "medium",
      confidence: 30,
      recommendation: "Sin condición suficiente para elevar riesgo compuesto — monitorear infraestructura cercana.",
    });
  }

  return risks;
}

function buildActions(context: OperationalBriefingContext): BriefingActionItem[] {
  return context.suggestedActions.map((action) => ({
    action: action.action,
    reason: action.reason,
    priority: action.priority,
    status: action.status === "SUGGESTED" ? "RECOMENDACION" : "ACCION_PENDIENTE",
    evidenceIds: action.relatedAssetIds ?? [],
  }));
}

function urgencyFromGapText(gap: string): ImpactPriorityLevel {
  const lowered = gap.toLowerCase();
  if (lowered.includes("población") || lowered.includes("infraestructura")) return "medium";
  return "low";
}

function buildGaps(context: OperationalBriefingContext): InformationGap[] {
  return context.gaps.map((gap) => ({
    description: gap,
    potentialImpact: "Reduce la confianza de las secciones dependientes de este dato.",
    urgency: urgencyFromGapText(gap),
    suggestedVerificationMethod: "Confirmar con la fuente primaria u operador de campo antes de decisiones críticas.",
  }));
}

function computeFreshness(context: OperationalBriefingContext): BriefingFreshness {
  if (context.overallDossierStatus === "FAILED") return "DEGRADED";
  if (context.overallDossierStatus === "STALE") return "STALE";
  if (context.overallDossierStatus === "COMPLETE") return "FRESH";
  return "PARTIAL";
}

function computeBriefingConfidence(context: OperationalBriefingContext): { score: number; methodology: string } {
  let score = 50;
  const factors: string[] = ["base 50"];

  if (context.infrastructureDataState === "CALCULATED") {
    score += 15;
    factors.push("+15 infraestructura calculada con datos reales");
  }
  if (context.territory.resolutionMethod === "administrative_geometry") {
    score += 15;
    factors.push("+15 territorio resuelto por geometría administrativa real");
  } else if (context.territory.resolutionMethod === "canonical_fields") {
    score += 5;
    factors.push("+5 territorio resuelto por campos canónicos");
  }
  const gapPenalty = Math.min(30, context.gaps.length * 5);
  score -= gapPenalty;
  factors.push(`-${gapPenalty} por ${context.gaps.length} laguna(s) de información`);

  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return { score: clamped, methodology: factors.join("; ") };
}

/**
 * Punto de entrada único. Nunca recibe un incidente crudo — solo el
 * `OperationalBriefingContext` ya construido por
 * `buildOperationalBriefingContext` (mismo idioma que los Prompts 6/7: un
 * único punto de entrada sobre datos ya resueltos).
 */
export function buildDeterministicBriefing(context: OperationalBriefingContext): DeterministicBriefing {
  const insideOrBorderCount = context.infrastructure.filter(
    (asset) => asset.spatialRelation === "INSIDE" || asset.spatialRelation === "BORDER"
  ).length;
  const briefingConfidence = computeBriefingConfidence(context);

  const citedIds = [
    context.incident.id,
    ...context.infrastructure.map((asset) => asset.poiId),
    ...context.relatedIncidents.map((related) => related.id),
  ];

  return {
    briefingVersion: BRIEFING_VERSION,
    incidentId: context.incident.id,
    generatedAt: context.generatedAt,
    contextHash: context.contextHash,
    executiveSummary: buildExecutiveSummary(context),
    status: {
      lifecycle: context.incident.lifecycle,
      severity: context.incident.severity,
      priority: context.priority.level,
      confidence: context.incident.confidence,
      primarySource: context.incident.primarySource,
      lastUpdated: context.incident.updatedAt,
      territoryLabel: describeTerritory(context),
    },
    // Sin una versión previa con la que comparar en este pase (sin
    // persistencia todavía, ver deuda técnica) — nunca se fabrica un cambio.
    recentChanges: [],
    impact: {
      infrastructureSummary:
        context.infrastructureDataState === "CALCULATED"
          ? `${insideOrBorderCount} activo(s) crítico(s) dentro/en el borde del área, ${context.infrastructure.length} en total dentro del radio operacional.`
          : "Infraestructura no calculada.",
      infrastructureAssets: context.infrastructure,
      populationStatus: context.populationAvailable ? "Disponible" : `NO DISPONIBLE — ${context.populationReason ?? "sin fuente real"}`,
    },
    territory: {
      summary: describeTerritory(context),
      intersectedAreas: context.territory.intersectedAdministrativeAreas,
      organizationsStatus: "NO_VERIFICADO",
    },
    compositeRisks: buildCompositeRisks(context),
    actions: buildActions(context),
    gaps: buildGaps(context),
    evidence: {
      citedIds,
      incidentConfidence: context.incident.confidence,
      briefingConfidence: briefingConfidence.score,
      briefingConfidenceMethodology: briefingConfidence.methodology,
    },
    nextReviewNote:
      context.incident.lifecycle === "resolved" || context.incident.lifecycle === "archived"
        ? "Incidente no activo — sin revisión programada."
        : "Revisar ante nueva observación, cambio de severidad/confianza, o solicitud manual de un operador autorizado.",
    trend: "SIN_DATOS_SUFICIENTES",
    freshness: computeFreshness(context),
    limitations: context.gaps,
    isDemo: context.incident.isDemo,
  };
}

export { lifecycleLabel };

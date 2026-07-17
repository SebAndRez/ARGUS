import type { ArgusConfidence, ArgusEventType, ArgusSeverity } from "@/types/argusEvent";
import type { CanonicalLifecycle, ModuleVerificationStatus } from "@/types/moduleOperationalContext";
import type { ImpactedInfrastructureAsset, ImpactPriorityLevel, SuggestedImpactAction } from "@/types/incidentImpactAssessment";
import type { CrisisRelationSummary, RelatedIncidentSummary, TerritorialIdentity } from "@/types/territorialDossier";

/**
 * ARGUS — síntesis operacional / briefing (Prompt 8).
 *
 * Deliberadamente NO un motor que recalcula nada: consume, tal cual, lo ya
 * producido por el incidente canónico (Prompt 3/17), el análisis de impacto
 * (Prompt 6, `IncidentImpactAssessment`) y el expediente territorial
 * (Prompt 7, `TerritorialDossier`). Ver
 * `docs/architecture/ARGUS_OPERATIONAL_BRIEFING_IMPLEMENTATION.md` §1-2 para
 * la auditoría previa: no existe hoy ningún proveedor de IA aprobado
 * (`package.json` no tiene ninguna dependencia de OpenAI/Anthropic/Gemini),
 * por lo que este contrato incluye una interfaz de proveedor generativo
 * *deshabilitada por diseño* — nunca invocada — en vez de una integración
 * real sin aprobación.
 */

/** Un elemento minimizado del contexto siempre puede declarar que fue truncado desde una colección mayor — Prompt 8 §12. */
export interface ContextBudget {
  maxRelatedIncidents: number;
  maxInfrastructureAssets: number;
  maxRelations: number;
  maxGaps: number;
  maxActions: number;
  maxTextLength: number;
}

export const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
  maxRelatedIncidents: 5,
  maxInfrastructureAssets: 10,
  maxRelations: 10,
  maxGaps: 8,
  maxActions: 6,
  maxTextLength: 280,
};

export interface ContextTruncationReport {
  contextTruncated: boolean;
  omittedRelatedIncidentCount: number;
  omittedInfrastructureCount: number;
  omittedRelationCount: number;
}

export interface IncidentContextSummary {
  id: string;
  title: string;
  type: ArgusEventType;
  severity: ArgusSeverity;
  confidence: ArgusConfidence;
  lifecycle: CanonicalLifecycle;
  verificationStatus: ModuleVerificationStatus;
  primarySource: string | null;
  sourceCount: number;
  startedAt: string | null;
  updatedAt: string;
  isDemo: boolean;
}

/**
 * Contexto operacional normalizado — el único objeto de entrada tanto para
 * el constructor determinista como para un futuro proveedor generativo
 * (nunca reciben acceso a Prisma ni a los objetos completos, Prompt 8 §32).
 * Proyección mínima: nunca copia entidades Prisma completas.
 */
export interface OperationalBriefingContext {
  incident: IncidentContextSummary;
  territory: TerritorialIdentity;
  relatedIncidents: RelatedIncidentSummary[];
  infrastructure: ImpactedInfrastructureAsset[];
  infrastructureDataState: string;
  populationAvailable: boolean;
  populationReason: string | null;
  relations: CrisisRelationSummary[];
  suggestedActions: SuggestedImpactAction[];
  priority: { level: ImpactPriorityLevel; score: number; methodology: string };
  gaps: string[];
  overallDossierStatus: string;
  truncation: ContextTruncationReport;
  contextHash: string;
  generatedAt: string;
}

export type BriefingTrend = "ESCALANDO" | "ESTABLE" | "MEJORANDO" | "FLUCTUANTE" | "SIN_DATOS_SUFICIENTES";

export type BriefingFreshness = "FRESH" | "PARTIAL" | "STALE" | "DEGRADED";

export interface CompositeRiskSignal {
  rule: string;
  conditionsPresent: string[];
  conditionsMissing: string[];
  level: ImpactPriorityLevel;
  confidence: number;
  recommendation: string;
}

export interface BriefingActionItem {
  action: string;
  reason: string;
  priority: ImpactPriorityLevel;
  /** Prompt 8 §22: nunca "orden" — solo estos tres estados en este pase (no hay flujo de decisión registrada todavía, ver deuda). */
  status: "RECOMENDACION" | "ACCION_PENDIENTE" | "DECISION_REGISTRADA";
  evidenceIds: string[];
}

export interface InformationGap {
  description: string;
  potentialImpact: string;
  urgency: ImpactPriorityLevel;
  suggestedVerificationMethod: string;
}

export interface DeterministicBriefing {
  briefingVersion: string;
  incidentId: string;
  generatedAt: string;
  contextHash: string;
  /** 1. Resumen ejecutivo */
  executiveSummary: string;
  /** 2. Estado del incidente */
  status: {
    lifecycle: CanonicalLifecycle;
    severity: ArgusSeverity;
    priority: ImpactPriorityLevel;
    confidence: ArgusConfidence;
    primarySource: string | null;
    lastUpdated: string;
    territoryLabel: string;
  };
  /** 3. Cambios recientes (vacío sin una versión previa con la que comparar — ver §16/§30) */
  recentChanges: string[];
  /** 4. Impacto */
  impact: {
    infrastructureSummary: string;
    infrastructureAssets: ImpactedInfrastructureAsset[];
    populationStatus: string;
  };
  /** 5. Territorio y jurisdicción */
  territory: {
    summary: string;
    intersectedAreas: string[];
    organizationsStatus: "NO_VERIFICADO";
  };
  /** 6. Infraestructura y servicios (parte de impacto arriba; explícito para mantener el orden de §13 del mandato) */
  /** 7. Riesgos compuestos */
  compositeRisks: CompositeRiskSignal[];
  /** 8. Acciones recomendadas */
  actions: BriefingActionItem[];
  /** 9. Información pendiente */
  gaps: InformationGap[];
  /** 10. Evidencia y confianza */
  evidence: {
    citedIds: string[];
    incidentConfidence: ArgusConfidence;
    briefingConfidence: number;
    briefingConfidenceMethodology: string;
  };
  /** 11. Próxima actualización — declarativo, no un timer real en este pase */
  nextReviewNote: string;
  trend: BriefingTrend;
  freshness: BriefingFreshness;
  limitations: string[];
  isDemo: boolean;
}

export type BriefingComparisonChangeKind =
  | "ADDED"
  | "REMOVED"
  | "INCREASED"
  | "DECREASED"
  | "CHANGED"
  | "CONFIRMED"
  | "CONTRADICTED"
  | "RESOLVED";

export interface BriefingComparisonEntry {
  field: string;
  kind: BriefingComparisonChangeKind;
  from: string | null;
  to: string | null;
}

export interface BriefingComparisonResult {
  hasMaterialChanges: boolean;
  entries: BriefingComparisonEntry[];
}

/**
 * Formato — cuatro proyecciones del mismo `DeterministicBriefing`, nunca
 * cuatro motores (Prompt 8 §42).
 */
export type BriefingFormat = "executive" | "operational" | "public" | "technical";

// ---------------------------------------------------------------------------
// Proveedor generativo opcional — interfaz + feature flag SIEMPRE apagado en
// este pase. Ningún código de este módulo invoca un proveedor externo.
// ---------------------------------------------------------------------------

export interface SerializedBriefingContext {
  context: OperationalBriefingContext;
  budget: ContextBudget;
}

export interface GeneratedBriefingResult {
  executiveSummary: string;
  situation: string[];
  changes: string[];
  impacts: string[];
  risks: string[];
  actions: string[];
  gaps: string[];
  limitations: string[];
  citedEvidenceIds: string[];
}

/**
 * Nunca implementado con una llamada real en este pase — no hay proveedor
 * aprobado en el repositorio (§31 del mandato: "si falta cualquiera de estas
 * condiciones: NO IMPLEMENTAR LLAMADA EXTERNA"). Esta interfaz existe solo
 * como punto de extensión para una futura aprobación explícita.
 */
export interface BriefingLanguageProvider {
  providerId: string;
  rewrite(
    serialized: SerializedBriefingContext,
    deterministicBriefing: DeterministicBriefing
  ): Promise<GeneratedBriefingResult>;
}

import {
  getAllSourceGovernancePolicies,
  getSourceGovernancePolicy,
  hasRequiredContext,
} from "@/lib/source-governance/sourceGovernanceRegistry";
import { checkOperationalAvailability } from "@/lib/source-governance/sourceOperationalBridge";
import type { SourceGovernancePolicy, SourceContextState, SourceRole, UserMode } from "@/lib/source-governance/sourceRoles";

export type RouterPurpose =
  | "confirm_event"
  | "enrich_impact"
  | "historical_context"
  | "infrastructure_context"
  | "forecast_risk"
  | "osint_review"
  | "map_layers"
  | "run_all";

export interface SourceRouterPlanRequest {
  purpose: RouterPurpose;
  module?: "knowledge_intake" | "risk" | "fenix" | "nav" | "aura" | "command_center" | "citizen_map";
  userMode?: UserMode;
  hazardType?: string;
  sourceIds?: string[];
  context?: SourceContextState;
  flags?: Record<string, boolean>;
}

export interface SourceRouterPlanItem {
  sourceId: string;
  sourceRole: SourceRole;
  queryMode: SourceGovernancePolicy["queryMode"];
  action: "query" | "skip" | "manual_import" | "requires_context" | "requires_configuration";
  canCreateIncident: boolean;
  canCreateCandidate: boolean;
  requiresReview: boolean;
  citizenVisible: boolean;
  riskWeight: number;
  reasons: string[];
  caveats: string[];
}

export interface SourceRouterPlan {
  purpose: RouterPurpose;
  module: SourceRouterPlanRequest["module"];
  userMode: UserMode;
  selectedSources: SourceRouterPlanItem[];
  blockedSources: SourceRouterPlanItem[];
  caveats: string[];
}

const PURPOSE_ROLES: Record<RouterPurpose, SourceRole[]> = {
  confirm_event: ["incident_trigger", "observed_context"],
  enrich_impact: ["impact_enrichment", "observed_context", "baseline_context"],
  historical_context: ["historical_memory"],
  infrastructure_context: ["baseline_context", "impact_enrichment"],
  forecast_risk: ["forecast_signal"],
  osint_review: ["osint_signal"],
  map_layers: ["incident_trigger", "observed_context", "forecast_signal", "impact_enrichment", "baseline_context", "historical_memory", "osint_signal"],
  run_all: ["incident_trigger"],
};

export function buildSourceIntelligencePlan(request: SourceRouterPlanRequest): SourceRouterPlan {
  const context = request.context ?? {};
  const userMode = request.userMode ?? "command_center";
  const sourceIds = request.sourceIds;
  const allowedRoles = PURPOSE_ROLES[request.purpose];
  const candidates = getAllSourceGovernancePolicies()
    .filter((source) => !sourceIds || sourceIds.includes(source.sourceId))
    .filter((source) => allowedRoles.includes(source.sourceRole) || source.secondaryRoles?.some((role) => allowedRoles.includes(role)));

  const items = candidates.map((source) => planSource(source, request, context, userMode));
  const selectedSources = items.filter((item) => item.action === "query" || item.action === "manual_import");
  const blockedSources = items.filter((item) => item.action !== "query" && item.action !== "manual_import");

  return {
    purpose: request.purpose,
    module: request.module,
    userMode,
    selectedSources,
    blockedSources,
    caveats: Array.from(new Set(items.flatMap((item) => item.caveats))).slice(0, 12),
  };
}

export function explainSourcePlan(sourceId: string, request: SourceRouterPlanRequest) {
  const source = getSourceGovernancePolicy(sourceId);
  if (!source) return undefined;
  return planSource(source, request, request.context ?? {}, request.userMode ?? "command_center");
}

function planSource(
  source: SourceGovernancePolicy,
  request: SourceRouterPlanRequest,
  context: SourceContextState,
  userMode: UserMode
): SourceRouterPlanItem {
  const reasons: string[] = [];
  let action: SourceRouterPlanItem["action"] = "query";

  // Prompt 4 Fase I: la disponibilidad real (¿existe adaptador implementado?
  // ¿está deshabilitado? ¿faltan credenciales hoy?) se consulta contra el
  // registro operacional (`ARGUS_SOURCE_OPERATIONS_REGISTRY`), no solo el
  // flag estático `requiresConfiguration` escrito a mano en la política de
  // gobernanza — esto puede bloquear una fuente que gobernanza no marcó
  // como bloqueada, nunca al revés (el puente es fail-open, ver
  // `sourceOperationalBridge.ts`).
  const operationalVerdict = checkOperationalAvailability(source.sourceId);
  if (!operationalVerdict.available) {
    action = "requires_configuration";
    reasons.push(operationalVerdict.reason);
  } else if (source.requiresConfiguration) {
    action = "requires_configuration";
    reasons.push("Source requires configuration; do not expose env values.");
  }

  if (action === "query" && !hasRequiredContext(source.sourceId, context)) {
    action = "requires_context";
    reasons.push("Required event/AOI/route/simulation context is missing.");
  }

  if (action === "query" && request.purpose === "run_all" && !source.runAllDefault) {
    const flagAllows = source.runAllAllowedWithFlag && Object.values(request.flags ?? {}).some(Boolean);
    action = flagAllows ? "requires_context" : "skip";
    reasons.push(flagAllows ? "Flag-gated run-all still requires bounded context." : "Not a default run-all source.");
  }

  if (action === "query" && source.queryMode === "manual_import") {
    action = "manual_import";
    reasons.push("Manual/controlled import only.");
  }

  if (userMode === "citizen" && !source.citizenVisibleByDefault && !source.citizenVisibleOnIncidentDetail) {
    action = "skip";
    reasons.push("Not citizen-visible.");
  }

  if (!reasons.length) reasons.push("Selected by purpose, role and context.");

  return {
    sourceId: source.sourceId,
    sourceRole: source.sourceRole,
    queryMode: source.queryMode,
    action,
    canCreateIncident: source.canCreateIncident,
    canCreateCandidate: source.canCreateCandidate,
    requiresReview: source.requiresReviewByDefault,
    citizenVisible: source.citizenVisibleByDefault,
    riskWeight: source.riskWeight,
    reasons,
    caveats: source.caveats,
  };
}

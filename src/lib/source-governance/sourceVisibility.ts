import { filterMapLayersByMode, getAllMapLayerPolicies } from "@/lib/source-governance/mapLayerRegistry";
import type { MapLayerMode, MapLayerPolicy } from "@/lib/source-governance/mapLayerTaxonomy";
import {
  getSourceGovernancePolicy,
  isSourceCitizenVisible,
} from "@/lib/source-governance/sourceGovernanceRegistry";
import type { SourceContextState, UserMode } from "@/lib/source-governance/sourceRoles";

export function filterSourcesForUserMode<T extends { sourceId?: string; id?: string }>(
  sources: T[],
  userMode: UserMode,
  context: SourceContextState = {}
) {
  return sources.filter((source) => {
    const sourceId = source.sourceId ?? source.id;
    if (!sourceId) return userMode !== "citizen";
    const policy = getSourceGovernancePolicy(sourceId);
    if (!policy) return userMode !== "citizen";
    if (userMode === "citizen" || userMode === "authenticated_citizen") return isSourceCitizenVisible(sourceId, context);
    if (userMode === "command_center" || userMode === "admin") return policy.commandCenterVisible;
    if (userMode === "analyst") return policy.analystVisible;
    if (userMode === "fenix") return policy.fenixVisible;
    if (userMode === "nav") return policy.navVisible;
    if (userMode === "aura") return policy.auraVisible;
    return policy.canUpdateRisk;
  });
}

export function filterMapLayersForUserMode(
  layers: MapLayerPolicy[] = getAllMapLayerPolicies(),
  userMode: UserMode,
  context: SourceContextState = {}
) {
  if (userMode === "admin") return layers;
  const mode = (userMode === "authenticated_citizen" ? "citizen" : userMode) as MapLayerMode;
  const allowed = new Set(filterMapLayersByMode(mode, context).map((layer) => layer.layerId));
  return layers.filter((layer) => allowed.has(layer.layerId));
}

export function isEvidenceVisibleToCitizen(evidence: { sourceId?: string; requiresReview?: boolean; raw?: boolean; confidenceScore?: number; validated?: boolean }) {
  if (evidence.raw || evidence.requiresReview) return false;
  if (typeof evidence.confidenceScore === "number" && evidence.confidenceScore < 0.72) return false;
  return evidence.sourceId ? isSourceCitizenVisible(evidence.sourceId, { hasSelectedIncident: true, isValidated: evidence.validated }) : Boolean(evidence.validated);
}

export function isCandidateVisibleToCitizen(candidate: { validated?: boolean; status?: string; requiresReview?: boolean }) {
  return Boolean(candidate.validated || candidate.status === "confirmed") && candidate.requiresReview !== true;
}

export function isRawSourceVisible(userMode: UserMode) {
  return userMode === "command_center" || userMode === "analyst" || userMode === "admin";
}

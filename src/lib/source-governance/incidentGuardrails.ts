import {
  getSourceGovernancePolicy,
  hasRequiredContext,
} from "@/lib/source-governance/sourceGovernanceRegistry";
import type { SourceAction, SourceContextState } from "@/lib/source-governance/sourceRoles";

export interface IncidentCreationDecision {
  allowed: boolean;
  action: "create_incident" | "create_candidate" | "create_evidence" | "create_context" | "blocked";
  requiresReview: boolean;
  citizenVisible: boolean;
  reasons: string[];
  caveats: string[];
}

export function getIncidentCreationDecision(sourceId: string, context: SourceContextState = {}): IncidentCreationDecision {
  const policy = getSourceGovernancePolicy(sourceId);
  if (!policy) {
    return {
      allowed: false,
      action: "blocked",
      requiresReview: true,
      citizenVisible: false,
      reasons: [`No governance policy registered for ${sourceId}.`],
      caveats: ["Unknown sources cannot create incidents."],
    };
  }

  if (policy.forbiddenActions.includes("create_incident")) {
    return fallbackDecision(policy.canCreateCandidate ? "create_candidate" : "create_evidence", true, [`${policy.sourceId} is forbidden from creating confirmed incidents.`], policy.caveats);
  }

  if (policy.canCreateIncident) {
    return {
      allowed: true,
      action: "create_incident",
      requiresReview: policy.requiresReviewByDefault,
      citizenVisible: policy.citizenVisibleByDefault,
      reasons: [`${policy.sourceId} is an incident trigger.`],
      caveats: policy.caveats,
    };
  }

  if (policy.canCreateIncidentWithGuardrails && hasRequiredContext(sourceId, context) && (context.isOfficiallyConfirmed || context.hasSelectedIncident || context.hasActiveIncident)) {
    return {
      allowed: true,
      action: "create_incident",
      requiresReview: true,
      citizenVisible: false,
      reasons: [`${policy.sourceId} can create incidents only with guardrails and review.`],
      caveats: policy.caveats,
    };
  }

  if (policy.canCreateCandidate) return fallbackDecision("create_candidate", true, [`${policy.sourceId} can create candidate/review records, not confirmed incidents.`], policy.caveats);
  if (policy.canCreateEvidence) return fallbackDecision("create_evidence", policy.requiresReviewByDefault, [`${policy.sourceId} is evidence/context only.`], policy.caveats);
  return fallbackDecision("blocked", true, [`${policy.sourceId} cannot create incident, candidate or evidence records.`], policy.caveats);
}

export function canPerformSourceAction(sourceId: string, action: SourceAction) {
  const policy = getSourceGovernancePolicy(sourceId);
  if (!policy) return false;
  return policy.allowedActions.includes(action) && !policy.forbiddenActions.includes(action);
}

export function shouldPersistEvidence(sourceId: string, context: SourceContextState = {}) {
  const policy = getSourceGovernancePolicy(sourceId);
  if (!policy) return false;
  if (policy.defaultPersistence === "always") return true;
  if (policy.defaultPersistence === "manual_import") return context.hasSimulation === true;
  if (policy.defaultPersistence === "event_related") return Boolean(context.hasActiveIncident || context.hasSelectedIncident || context.hasAoi || context.hasPoint || context.hasBbox);
  return false;
}

function fallbackDecision(
  action: IncidentCreationDecision["action"],
  requiresReview: boolean,
  reasons: string[],
  caveats: string[]
): IncidentCreationDecision {
  return {
    allowed: action !== "blocked",
    action,
    requiresReview,
    citizenVisible: false,
    reasons,
    caveats,
  };
}

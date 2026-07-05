import { getSourceGovernancePolicy } from "@/lib/source-governance/sourceGovernanceRegistry";

export type CorroborationLevel =
  | "none"
  | "single_source"
  | "media_only"
  | "forecast_only"
  | "observed_only"
  | "official_single"
  | "official_plus_context"
  | "official_plus_observed"
  | "multiple_official"
  | "official_confirmed_with_media_context"
  | "admin_validated";

export interface CorroborationEvidence {
  sourceId: string;
  validatedByAdmin?: boolean;
}

export function getCorroborationLevel(evidenceList: CorroborationEvidence[]): CorroborationLevel {
  if (!evidenceList.length) return "none";
  if (evidenceList.some((item) => item.validatedByAdmin)) return "admin_validated";

  const policies = evidenceList.map((item) => getSourceGovernancePolicy(item.sourceId)).filter(Boolean);
  const sourceIds = new Set(policies.map((policy) => policy?.sourceId));
  const official = policies.filter((policy) => policy?.sourceRole === "incident_trigger");
  const observed = policies.filter((policy) => policy?.sourceRole === "observed_context");
  const forecast = policies.filter((policy) => policy?.sourceRole === "forecast_signal");
  const media = policies.filter((policy) => policy?.sourceRole === "osint_signal");
  const context = policies.filter((policy) => policy?.sourceRole === "impact_enrichment" || policy?.sourceRole === "baseline_context" || policy?.sourceRole === "historical_memory");

  if (sourceIds.size === 1 && media.length) return "media_only";
  if (media.length === policies.length) return "media_only";
  if (forecast.length === policies.length) return "forecast_only";
  if (observed.length === policies.length) return "observed_only";
  if (official.length >= 2) return "multiple_official";
  if (official.length === 1 && observed.length > 0) return "official_plus_observed";
  if (official.length === 1 && media.length > 0) return "official_confirmed_with_media_context";
  if (official.length === 1 && context.length > 0) return "official_plus_context";
  if (official.length === 1) return "official_single";
  return sourceIds.size === 1 ? "single_source" : "observed_only";
}

export function buildCrossSourceCorroboration(incidentOrCandidate: { validatedByAdmin?: boolean }, evidenceList: CorroborationEvidence[]) {
  const level = incidentOrCandidate.validatedByAdmin ? "admin_validated" : getCorroborationLevel(evidenceList);
  return {
    level,
    sourceCount: new Set(evidenceList.map((item) => item.sourceId)).size,
    requiresReview: ["media_only", "forecast_only", "observed_only", "single_source"].includes(level),
    canConfirmIncident: ["official_single", "official_plus_context", "official_plus_observed", "multiple_official", "official_confirmed_with_media_context", "admin_validated"].includes(level),
  };
}

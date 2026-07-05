import { getIncidentCreationDecision } from "@/lib/source-governance/incidentGuardrails";

export function runIncidentGuardrailsTest() {
  const gdelt = getIncidentCreationDecision("gdelt");
  const glofas = getIncidentCreationDecision("copernicus-glofas", { hasAoi: true });
  const gfmNoContext = getIncidentCreationDecision("copernicus-gfm");
  const gfmWithContext = getIncidentCreationDecision("copernicus-gfm", { hasAoi: true, hasSelectedIncident: true });

  return {
    passed:
      gdelt.action === "create_candidate" &&
      gdelt.requiresReview &&
      glofas.action === "create_candidate" &&
      gfmNoContext.action === "create_candidate" &&
      gfmWithContext.action === "create_incident" &&
      gfmWithContext.requiresReview,
  };
}

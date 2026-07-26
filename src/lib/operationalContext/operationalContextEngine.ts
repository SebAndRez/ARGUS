import { pointInGeometry } from "@/lib/geometry/wildfireGeometry";
import { evaluateOperationalContextTrigger } from "@/data/operationalContextTriggerRules";
import { getThreatResourceProfile } from "@/data/threatResourceMatrix";
import { resolveImpactArea } from "@/lib/operationalContext/impactAreaResolver";
import { gatherOperationalResources } from "@/lib/operationalContext/operationalResourceEngine";
import { buildOperationalCards } from "@/lib/operationalContext/operationalContextCards";
import { buildLayerActivationPatch } from "@/lib/operationalContext/operationalLayerActivation";
import {
  buildIncidentFingerprint,
  getCachedOperationalContext,
  setCachedOperationalContext,
} from "@/lib/operationalContext/operationalContextCache";
import type { ArgusEventStatus } from "@/types/argusEvent";
import type { ModuleIncidentSummary } from "@/types/moduleOperationalContext";
import type { OperationalContextPackage, OperationalContextResult, OperationalResponsePhase } from "@/types/operationalContext";

/**
 * ARGUS Operational Context Engine — orquestador (Fases 1–8, 11).
 *
 * Consume `ModuleIncidentSummary` directamente (no re-deriva severidad,
 * lifecycle, tipo ni ubicación — esos ya vienen resueltos por
 * `getModuleIncidentDetailContext`, que a su vez envuelve
 * `canonicalKnowledgeIncidentToArgusEvent`). Resuelve el contexto una sola
 * vez por incidente (cache por fingerprint, Fase 11) — no se re-ejecuta en
 * cada render ni bloquea Global Watch (nunca es llamado desde ahí).
 */

const PHASE_BY_LIFECYCLE: Record<ArgusEventStatus, OperationalResponsePhase> = {
  observation: "early_warning",
  risk: "early_warning",
  active: "active_response",
  confirmed: "active_response",
  monitoring: "stabilization",
  resolved: "recovery",
  archived: "recovery",
};

function derivePhaseFromLifecycle(lifecycle: ArgusEventStatus): OperationalResponsePhase {
  return PHASE_BY_LIFECYCLE[lifecycle];
}

export async function resolveOperationalContextPackage(summary: ModuleIncidentSummary): Promise<OperationalContextResult> {
  const trigger = evaluateOperationalContextTrigger(summary);
  if (!trigger.activated) {
    return { activated: false, reason: "trigger_not_matched" };
  }

  const { latitude, longitude } = summary.location;
  if (latitude === null || longitude === null) {
    return { activated: false, reason: "insufficient_location" };
  }

  const fingerprint = buildIncidentFingerprint({
    updatedAt: summary.timing.updatedAt,
    severity: summary.severity,
    lifecycle: summary.lifecycle,
  });
  const cached = getCachedOperationalContext(summary.id, fingerprint);
  if (cached) {
    return { activated: true, contextPackage: cached };
  }

  const profile = getThreatResourceProfile(summary.type);
  const radiusKm = profile.radiusKmBySeverity[summary.severity];

  const impactArea = resolveImpactArea({
    lat: latitude,
    lng: longitude,
    countryCode: summary.location.countryCode,
    regionCode: summary.location.regionCode,
    radiusKm,
  });

  const resources = await gatherOperationalResources(impactArea, profile);

  const impactPolygonContains = (lat: number, lng: number): boolean =>
    impactArea.polygon ? pointInGeometry({ lat, lng }, impactArea.polygon) : false;

  const cards = buildOperationalCards(resources, profile, radiusKm, impactPolygonContains);
  const layerActivationPatch = buildLayerActivationPatch(profile, resources);

  const contextPackage: OperationalContextPackage = {
    incidentId: summary.id,
    resolvedAt: new Date().toISOString(),
    threatProfileId: profile.id,
    responsePhase: derivePhaseFromLifecycle(summary.lifecycle),
    impactArea,
    resources,
    cards,
    layerActivationPatch,
    triggeredByRuleId: trigger.ruleId,
  };

  setCachedOperationalContext(summary.id, fingerprint, contextPackage);
  return { activated: true, contextPackage };
}

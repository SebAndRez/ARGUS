import { prisma } from "@/lib/prisma";
import {
  buildPagerEvidence,
  buildShakeMapEvidence,
  fetchAndBuildUsgsEarthquakeImpact,
  type UsgsEarthquakeImpactParams,
} from "@/lib/knowledge-intake/adapters/usgsEarthquakeImpactAdapter";
import { saveContextEvidenceIfNew } from "@/lib/knowledge-intake/persistence/contextEvidence";
import {
  createIngestionRun,
  finishIngestionRun,
  upsertKnowledgeIncidentByExternalId,
  upsertKnowledgeSource,
} from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { getSourceById } from "@/lib/knowledge-intake/sourceRegistry";
import { normalizeUsgsEarthquakeFeature } from "@/lib/knowledge-intake/adapters/usgsAdapter";

type EventDetailForIncident = Parameters<typeof normalizeUsgsEarthquakeFeature>[0];

async function findEarthquakeIncident(eventId: string, incidentId?: string) {
  return prisma.knowledgeIncident.findFirst({
    where: {
      OR: [
        ...(incidentId ? [{ id: incidentId }] : []),
        { externalId: `usgs-${eventId}` },
        { externalId: eventId },
        { id: `usgs-${eventId}` },
      ],
    },
  });
}

async function updateEarthquakeIncidentWithImpact(incidentId: string, context: Awaited<ReturnType<typeof fetchAndBuildUsgsEarthquakeImpact>>["earthquakeOperationalImpactContext"]) {
  const existing = await prisma.knowledgeIncident.findUnique({ where: { id: incidentId } });
  if (!existing) return null;
  const technical = typeof existing.technicalFactorsJson === "object" && existing.technicalFactorsJson !== null
    ? existing.technicalFactorsJson as Record<string, unknown>
    : {};
  return prisma.knowledgeIncident.update({
    where: { id: incidentId },
    data: {
      severity: context.recommendedPriority === "P0" ? "critical" : context.recommendedPriority === "P1" ? "high" : existing.severity,
      technicalFactorsJson: JSON.parse(JSON.stringify({
        ...technical,
        earthquakeShakingContext: context.shakingContext,
        earthquakeImpactAssessmentContext: context.impactAssessmentContext,
        earthquakeOperationalImpactContext: context,
        lastImpactUpdateAt: new Date().toISOString(),
      })),
      reviewStatus: context.requiresReview ? "pending_review" : existing.reviewStatus,
    },
  });
}

export async function runUsgsEarthquakeImpactEnrichment(input: UsgsEarthquakeImpactParams) {
  if (!input.eventId) {
    return {
      runId: null,
      status: "failed" as const,
      consideredEvents: 0,
      enrichedEvents: 0,
      skippedNoProducts: 0,
      evidenceCreated: 0,
      incidentsUpdated: 0,
      incidentsCreated: 0,
      warnings: [],
      errors: ["eventId is required"],
      sampleImpacts: [],
    };
  }
  const shakeSource = getSourceById("usgs-shakemap");
  const pagerSource = getSourceById("usgs-pager");
  let run: Awaited<ReturnType<typeof createIngestionRun>> | null = null;
  try {
    if (shakeSource) await upsertKnowledgeSource(shakeSource);
    if (pagerSource) await upsertKnowledgeSource(pagerSource);
    run = await createIngestionRun({
      sourceId: "usgs-earthquake-impact",
      sourceName: "USGS Earthquake Impact",
      metadataJson: JSON.parse(JSON.stringify(input)),
    });
  } catch (error) {
    return {
      runId: null,
      status: "failed" as const,
      consideredEvents: 1,
      enrichedEvents: 0,
      skippedNoProducts: 0,
      evidenceCreated: 0,
      incidentsUpdated: 0,
      incidentsCreated: 0,
      warnings: ["Knowledge persistence is unavailable. Preview still works through the live endpoint."],
      errors: [error instanceof Error ? error.message : "Knowledge persistence unavailable"],
      sampleImpacts: [],
    };
  }

  const result = await fetchAndBuildUsgsEarthquakeImpact(input);
  const existingIncident = await findEarthquakeIncident(input.eventId, input.incidentId);
  let incidentId = existingIncident?.id;
  let incidentsCreated = 0;
  let incidentsUpdated = 0;
  const warnings = [...result.warnings];

  if (!incidentId && input.createIncidentIfMissing && result.eventDetail) {
    const incident = normalizeUsgsEarthquakeFeature(result.eventDetail as EventDetailForIncident);
    if (incident) {
      const saved = await upsertKnowledgeIncidentByExternalId(incident);
      incidentId = saved.incident.id;
      if (saved.action === "inserted") incidentsCreated += 1;
    }
  }

  if (incidentId && input.updateIncident) {
    const updated = await updateEarthquakeIncidentWithImpact(incidentId, result.earthquakeOperationalImpactContext);
    if (updated) incidentsUpdated += 1;
  }

  let evidenceCreated = 0;
  let evidenceSkipped = 0;
  const sampleImpacts = [result.earthquakeOperationalImpactContext];
  if (result.earthquakeShakingContext) {
    const saved = await saveContextEvidenceIfNew(buildShakeMapEvidence(result.earthquakeShakingContext, incidentId));
    if (saved.action === "inserted") evidenceCreated += 1;
    if (saved.action === "skipped") evidenceSkipped += 1;
  }
  if (result.earthquakeImpactAssessmentContext) {
    const saved = await saveContextEvidenceIfNew(buildPagerEvidence(result.earthquakeImpactAssessmentContext, incidentId));
    if (saved.action === "inserted") evidenceCreated += 1;
    if (saved.action === "skipped") evidenceSkipped += 1;
  }

  await finishIngestionRun(run.id, {
    status: result.status === "ready" ? "success" : "skipped",
    recordsFetched: result.products.shakemapAvailable + result.products.pagerAvailable,
    recordsNormalized: Number(result.hasShakeMap) + Number(result.hasPager),
    recordsInserted: evidenceCreated + incidentsCreated,
    recordsUpdated: incidentsUpdated,
    recordsSkipped: evidenceSkipped + (result.status === "notAvailable" ? 1 : 0),
    warningsJson: JSON.parse(JSON.stringify(warnings)),
    metadataJson: JSON.parse(JSON.stringify({
      eventId: input.eventId,
      hasShakeMap: result.hasShakeMap,
      hasPager: result.hasPager,
      recommendedPriority: result.recommendedPriority,
      requiresReview: result.requiresReview,
      incidentsCreated,
      incidentsUpdated,
    })),
  });

  return {
    runId: run.id,
    status: result.status === "ready" ? "success" as const : "skipped" as const,
    consideredEvents: 1,
    enrichedEvents: result.status === "ready" ? 1 : 0,
    skippedNoProducts: result.status === "notAvailable" ? 1 : 0,
    skippedAlreadyFresh: evidenceSkipped,
    evidenceCreated,
    incidentsUpdated,
    incidentsCreated,
    p0Candidates: result.recommendedPriority === "P0" ? 1 : 0,
    p1Candidates: result.recommendedPriority === "P1" ? 1 : 0,
    requiresReview: result.requiresReview,
    warnings,
    errors: result.errors,
    sampleImpacts,
  };
}

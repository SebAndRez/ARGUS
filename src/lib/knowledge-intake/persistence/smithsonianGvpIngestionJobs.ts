import {
  buildGvpActivityReportEvidence,
  buildGvpEruptionEvidence,
  buildGvpVolcanoEvidence,
  fetchAndNormalizeSmithsonianGvp,
  type GvpFetchParams,
} from "@/lib/knowledge-intake/adapters/smithsonianGvpAdapter";
import { saveContextEvidenceIfNew } from "@/lib/knowledge-intake/persistence/contextEvidence";
import {
  createIngestionRun,
  finishIngestionRun,
  upsertKnowledgeSource,
} from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { getSourceById } from "@/lib/knowledge-intake/sourceRegistry";

export type SmithsonianGvpCatalogJobInput = GvpFetchParams;
export type SmithsonianGvpActivityJobInput = GvpFetchParams & {
  includeDVAR?: boolean;
  includeWVAR?: boolean;
  sinceDays?: number;
};

export async function runSmithsonianGvpCatalogImport(input: SmithsonianGvpCatalogJobInput = {}) {
  const source = getSourceById("smithsonian-gvp");
  let run: Awaited<ReturnType<typeof createIngestionRun>> | null = null;
  try {
    if (source) await upsertKnowledgeSource(source);
    run = await createIngestionRun({
      sourceId: "smithsonian-gvp",
      sourceName: "Smithsonian GVP",
      metadataJson: JSON.parse(JSON.stringify({
        includeHolocene: input.includeHolocene ?? true,
        includePleistocene: input.includePleistocene ?? false,
        includeEruptions: input.includeEruptions ?? true,
        country: input.country,
        region: input.region,
        persist: input.persist ?? true,
        limit: input.limit ?? 1000,
        createIncidents: false,
      })),
    });
  } catch (error) {
    return {
      runId: null,
      status: "failed" as const,
      fetched: 0,
      normalized: 0,
      evidenceCreated: 0,
      incidentsCreated: 0,
      incidentsUpdated: 0,
      warnings: ["Knowledge persistence is unavailable. Preview still works through the live GVP endpoint."],
      errors: [error instanceof Error ? error.message : "Knowledge persistence unavailable"],
      sampleEvidence: [],
    };
  }

  const result = await fetchAndNormalizeSmithsonianGvp({
    ...input,
    includeHolocene: input.includeHolocene ?? true,
    includePleistocene: input.includePleistocene ?? false,
    includeEruptions: input.includeEruptions ?? true,
    persist: true,
    createIncidents: false,
    limit: input.limit ?? 1000,
  });
  let evidenceCreated = 0;
  let evidenceSkipped = 0;
  const sampleEvidence = [];

  for (const context of result.volcanoBaselineContexts) {
    const saved = await saveContextEvidenceIfNew(buildGvpVolcanoEvidence(context));
    if (saved.action === "inserted") evidenceCreated += 1;
    if (saved.action === "skipped") evidenceSkipped += 1;
    if (sampleEvidence.length < 5) sampleEvidence.push(saved.evidence);
  }
  for (const context of result.eruptionHistoryContexts) {
    const saved = await saveContextEvidenceIfNew(buildGvpEruptionEvidence(context));
    if (saved.action === "inserted") evidenceCreated += 1;
    if (saved.action === "skipped") evidenceSkipped += 1;
    if (sampleEvidence.length < 5) sampleEvidence.push(saved.evidence);
  }

  await finishIngestionRun(run.id, {
    status: result.status === "error" ? "failed" : result.status === "partial" ? "partial" : "success",
    recordsFetched: result.volcanoesFetched + result.eruptionsFetched,
    recordsNormalized: result.normalized,
    recordsInserted: evidenceCreated,
    recordsSkipped: evidenceSkipped,
    warningsJson: JSON.parse(JSON.stringify(result.warnings)),
    metadataJson: JSON.parse(JSON.stringify({
      sourceRole: result.sourceRole,
      evidenceCreated,
      evidenceSkipped,
      volcanoesFetched: result.volcanoesFetched,
      eruptionsFetched: result.eruptionsFetched,
      incidentsCreated: 0,
      incidentsUpdated: 0,
      caveat: result.caveat,
    })),
    errorMessage: result.errors.length ? result.errors.join("; ") : undefined,
  });

  return {
    runId: run.id,
    status: result.status === "error" ? "failed" as const : "success" as const,
    fetched: result.volcanoesFetched + result.eruptionsFetched,
    normalized: result.normalized,
    evidenceCreated,
    incidentsCreated: 0,
    incidentsUpdated: 0,
    requiresReview: false,
    warnings: result.warnings,
    errors: result.errors,
    sampleEvidence,
  };
}

export async function runSmithsonianGvpActivityReports(input: SmithsonianGvpActivityJobInput = {}) {
  const result = await fetchAndNormalizeSmithsonianGvp({
    ...input,
    includeHolocene: false,
    includeEruptions: false,
    includeActivityReports: true,
    persist: input.persist ?? true,
    createIncidents: input.createIncidents ?? false,
  });
  let evidenceCreated = 0;
  let evidenceSkipped = 0;
  const sampleEvidence = [];
  if (input.persist !== false) {
    for (const context of result.volcanicActivityReportContexts) {
      const saved = await saveContextEvidenceIfNew(buildGvpActivityReportEvidence(context));
      if (saved.action === "inserted") evidenceCreated += 1;
      if (saved.action === "skipped") evidenceSkipped += 1;
      if (sampleEvidence.length < 5) sampleEvidence.push(saved.evidence);
    }
  }
  return {
    runId: null,
    status: "partial" as const,
    fetched: result.reportsFetched,
    normalized: result.volcanicActivityReportContexts.length,
    evidenceCreated,
    evidenceSkipped,
    incidentsCreated: 0,
    incidentsUpdated: 0,
    requiresReview: input.createIncidents === true,
    warnings: [
      ...result.warnings,
      "DVAR/WVAR incident creation guardrails are implemented at the policy boundary; no incident is created while stable structured parsing is unavailable.",
    ],
    errors: result.errors,
    sampleEvidence,
  };
}

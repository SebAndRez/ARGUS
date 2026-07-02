import { fetchFirmsActiveFires } from "@/lib/knowledge-intake/adapters/firmsAdapter";
import { fetchReliefWebReports } from "@/lib/knowledge-intake/adapters/reliefwebAdapter";
import { fetchUsgsEarthquakes } from "@/lib/knowledge-intake/adapters/usgsAdapter";
import {
  createIngestionRun,
  finishIngestionRun,
  upsertKnowledgeIncidentByExternalId,
  upsertKnowledgeSource,
} from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { getSourceById } from "@/lib/knowledge-intake/sourceRegistry";

export type UsgsIngestionJobInput = {
  feedType?: "significant" | "day" | "week" | "relevant";
  minMagnitude?: number;
  limit?: number;
};

export async function runUsgsKnowledgeIngestion(input: UsgsIngestionJobInput = {}) {
  const source = getSourceById("usgs_earthquake");
  if (source) await upsertKnowledgeSource(source);
  const run = await createIngestionRun({
    sourceId: "usgs_earthquake",
    sourceName: "USGS Earthquake Hazards",
    metadataJson: JSON.parse(JSON.stringify({
      feedType: input.feedType ?? "relevant",
      minMagnitude: input.minMagnitude,
      limit: input.limit,
    })),
  });

  try {
    const result = await fetchUsgsEarthquakes({
      feed: input.feedType ?? "relevant",
      minMagnitude: input.minMagnitude,
      limit: input.limit ?? 50,
    });
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const sampleIncidents = [];

    for (const incident of result.incidents) {
      const saved = await upsertKnowledgeIncidentByExternalId(incident);
      if (saved.action === "inserted") inserted += 1;
      if (saved.action === "updated") updated += 1;
      if (saved.action === "skipped") skipped += 1;
      if (sampleIncidents.length < 5) sampleIncidents.push(saved.incident);
    }

    await finishIngestionRun(run.id, {
      status: "success",
      recordsFetched: result.count,
      recordsNormalized: result.incidents.length,
      recordsInserted: inserted,
      recordsUpdated: updated,
      recordsSkipped: skipped,
      metadataJson: JSON.parse(JSON.stringify({ feed: result.feed, metadata: result.metadata })),
    });

    return {
      status: "success" as const,
      runId: run.id,
      fetched: result.count,
      normalized: result.incidents.length,
      inserted,
      updated,
      skipped,
      sampleIncidents,
    };
  } catch (error) {
    await finishIngestionRun(run.id, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "USGS ingestion failed",
    });
    throw error;
  }
}

export async function runAllConfiguredKnowledgeIngestion() {
  const results = [];
  results.push({ sourceId: "usgs_earthquake", result: await runUsgsKnowledgeIngestion({ feedType: "relevant", limit: 50 }) });

  const relief = await fetchReliefWebReports({ limit: 1 });
  results.push({
    sourceId: "reliefweb",
    status: relief.status,
    skipped: relief.status !== "ready",
    message: "message" in relief ? relief.message : "ReliefWeb ready but persistence is not enabled for this job yet.",
  });

  const firms = await fetchFirmsActiveFires({ days: 1 });
  results.push({
    sourceId: "nasa_firms",
    status: firms.status,
    skipped: firms.status !== "ready",
    message: "message" in firms ? firms.message : "NASA FIRMS ready but persistence is not enabled for this job yet.",
  });

  return results;
}

import { fetchFirmsActiveFires } from "@/lib/knowledge-intake/adapters/firmsAdapter";
import {
  buildOpenMeteoEvidence,
  buildOpenMeteoWeatherContext,
  fetchOpenMeteoForecast,
  type OpenMeteoPurpose,
} from "@/lib/knowledge-intake/adapters/openMeteoAdapter";
import {
  buildUsgsWaterEvidence,
  fetchAndBuildUsgsWaterContext,
  type UsgsWaterRequestParams,
} from "@/lib/knowledge-intake/adapters/usgsWaterAdapter";
import { fetchEonetEvents, type EonetFetchParams } from "@/lib/knowledge-intake/adapters/eonetAdapter";
import { fetchGdacsEvents, type GdacsAlertLevel, type GdacsEventType } from "@/lib/knowledge-intake/adapters/gdacsAdapter";
import { fetchNwsActiveAlerts, type NwsFetchParams } from "@/lib/knowledge-intake/adapters/nwsAdapter";
import {
  fetchAndNormalizeNoaaStormEvents,
  type NoaaStormEventsFetchParams,
} from "@/lib/knowledge-intake/adapters/noaaStormEventsAdapter";
import {
  fetchAndNormalizeOpenFemaDisasterDeclarations,
  type OpenFemaDisasterDeclarationsParams,
} from "@/lib/knowledge-intake/adapters/openFemaAdapter";
import { fetchReliefWebReports } from "@/lib/knowledge-intake/adapters/reliefwebAdapter";
import { fetchUsgsEarthquakes } from "@/lib/knowledge-intake/adapters/usgsAdapter";
import { fetchUsgsVolcanoHans, type UsgsVolcanoHansFetchParams } from "@/lib/knowledge-intake/adapters/usgsVolcanoHansAdapter";
import {
  createIngestionRun,
  findFreshWeatherContextEvidence,
  findFreshHydrologicalContextEvidence,
  finishIngestionRun,
  getKnowledgeIncidents,
  saveWeatherContextEvidenceIfFreshMissing,
  saveKnowledgeEvidenceIfNew,
  upsertKnowledgeIncidentByExternalId,
  upsertKnowledgeSource,
} from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { getSourceById } from "@/lib/knowledge-intake/sourceRegistry";

export type UsgsIngestionJobInput = {
  feedType?: "significant" | "day" | "week" | "relevant";
  minMagnitude?: number;
  limit?: number;
};

export type GdacsIngestionJobInput = {
  eventTypes?: GdacsEventType[];
  fromDate?: string;
  toDate?: string;
  daysBack?: number;
  alertLevels?: GdacsAlertLevel[];
  limit?: number;
  page?: number;
};

export type EonetIngestionJobInput = EonetFetchParams & {
  categories?: string[];
};

export type UsgsVolcanoHansIngestionJobInput = UsgsVolcanoHansFetchParams;

export type NwsIngestionJobInput = NwsFetchParams & {
  mode?: "alerts" | "point" | "forecast" | "hourly";
};

export type OpenMeteoContextJobInput = {
  purpose?: OpenMeteoPurpose;
  forecastDays?: number;
  maxIncidents?: number;
  sinceHours?: number;
  persist?: boolean;
};

export type UsgsWaterContextJobInput = Pick<UsgsWaterRequestParams, "purpose" | "parameters" | "radiusKm" | "persist"> & {
  maxIncidents?: number;
  sinceHours?: number;
};

export type NoaaStormEventsImportJobInput = NoaaStormEventsFetchParams & {
  persist?: boolean;
};

export type OpenFemaImportJobInput = OpenFemaDisasterDeclarationsParams & {
  persist?: boolean;
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

export async function runGdacsKnowledgeIngestion(input: GdacsIngestionJobInput = {}) {
  const source = getSourceById("gdacs");
  if (source) await upsertKnowledgeSource(source);
  const run = await createIngestionRun({
    sourceId: "gdacs",
    sourceName: "GDACS",
    metadataJson: JSON.parse(JSON.stringify({
      eventTypes: input.eventTypes ?? ["EQ", "TC", "FL", "VO", "DR", "WF"],
      daysBack: input.daysBack ?? 7,
      alertLevels: input.alertLevels ?? ["red", "orange", "green"],
      limit: input.limit ?? 100,
      page: input.page,
      fromDate: input.fromDate,
      toDate: input.toDate,
    })),
  });

  try {
    const result = await fetchGdacsEvents({
      eventTypes: input.eventTypes ?? ["EQ", "TC", "FL", "VO", "DR", "WF"],
      fromDate: input.fromDate,
      toDate: input.toDate,
      daysBack: input.daysBack ?? 7,
      alertLevels: input.alertLevels ?? ["red", "orange", "green"],
      limit: input.limit ?? 100,
      page: input.page,
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
      status: result.status === "ready" ? "success" : result.status === "partial" ? "partial" : "skipped",
      recordsFetched: result.fetched,
      recordsNormalized: result.incidents.length,
      recordsInserted: inserted,
      recordsUpdated: updated,
      recordsSkipped: skipped,
      warningsJson: JSON.parse(JSON.stringify(result.warnings)),
      metadataJson: JSON.parse(JSON.stringify({ adapterStatus: result.status, errors: result.errors })),
    });

    return {
      status: result.status === "ready" || result.status === "partial" ? "success" as const : "skipped" as const,
      runId: run.id,
      fetched: result.fetched,
      normalized: result.incidents.length,
      inserted,
      updated,
      skipped,
      warnings: result.warnings,
      errors: result.errors,
      sampleIncidents,
    };
  } catch (error) {
    await finishIngestionRun(run.id, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "GDACS ingestion failed",
    });
    throw error;
  }
}

export async function runEonetKnowledgeIngestion(input: EonetIngestionJobInput = {}) {
  const source = getSourceById("nasa-eonet");
  if (source) await upsertKnowledgeSource(source);
  const category = input.categories ?? asArray(input.category);
  const run = await createIngestionRun({
    sourceId: "nasa-eonet",
    sourceName: "NASA EONET",
    metadataJson: JSON.parse(JSON.stringify({
      status: input.status ?? "open",
      days: input.days ?? 30,
      start: input.start,
      end: input.end,
      limit: input.limit ?? 100,
      category,
      bbox: input.bbox,
      source: input.source,
    })),
  });

  try {
    const result = await fetchEonetEvents({
      status: input.status ?? "open",
      days: input.days ?? 30,
      start: input.start,
      end: input.end,
      limit: input.limit ?? 100,
      category,
      bbox: input.bbox,
      source: input.source,
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
      status: result.status === "ready" ? "success" : result.status === "partial" ? "partial" : result.status === "error" ? "failed" : "skipped",
      recordsFetched: result.fetched,
      recordsNormalized: result.incidents.length,
      recordsInserted: inserted,
      recordsUpdated: updated,
      recordsSkipped: skipped,
      warningsJson: JSON.parse(JSON.stringify(result.warnings)),
      metadataJson: JSON.parse(JSON.stringify({ adapterStatus: result.status, errors: result.errors })),
      errorMessage: result.status === "error" ? result.errors.join("; ") : undefined,
    });

    return {
      status: result.status === "ready" || result.status === "partial" ? "success" as const : result.status === "error" ? "failed" as const : "skipped" as const,
      runId: run.id,
      fetched: result.fetched,
      normalized: result.incidents.length,
      inserted,
      updated,
      skipped,
      warnings: result.warnings,
      errors: result.errors,
      sampleIncidents,
    };
  } catch (error) {
    await finishIngestionRun(run.id, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "NASA EONET ingestion failed",
    });
    throw error;
  }
}

export async function runUsgsVolcanoHansKnowledgeIngestion(input: UsgsVolcanoHansIngestionJobInput = {}) {
  const source = getSourceById("usgs-volcano-hans");
  let run: Awaited<ReturnType<typeof createIngestionRun>>;
  try {
    if (source) await upsertKnowledgeSource(source);
    run = await createIngestionRun({
      sourceId: "usgs-volcano-hans",
      sourceName: "USGS Volcano HANS",
      metadataJson: JSON.parse(JSON.stringify({
        mode: input.mode ?? "elevated",
        observatory: input.observatory ?? "all",
        days: input.days ?? 7,
        includeNotices: input.includeNotices ?? true,
        includeGeoJson: input.includeGeoJson ?? true,
        limit: input.limit ?? 100,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Knowledge persistence is unavailable";
    return {
      status: "failed" as const,
      runId: null,
      fetched: 0,
      normalized: 0,
      evidenceCreated: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      warnings: ["Knowledge persistence is unavailable. Apply the Knowledge Intake migration before using persist=true."],
      errors: [message],
      sampleIncidents: [],
      sampleEvidence: [],
    };
  }

  try {
    const result = await fetchUsgsVolcanoHans({
      mode: input.mode ?? "elevated",
      observatory: input.observatory ?? "all",
      days: input.days ?? 7,
      includeNotices: input.includeNotices ?? true,
      includeGeoJson: input.includeGeoJson ?? true,
      limit: input.limit ?? 100,
    });

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let evidenceCreated = 0;
    let evidenceSkipped = 0;
    const sampleIncidents = [];
    const sampleEvidence = [];

    for (const incident of result.incidents) {
      const saved = await upsertKnowledgeIncidentByExternalId(incident);
      if (saved.action === "inserted") inserted += 1;
      if (saved.action === "updated") updated += 1;
      if (saved.action === "skipped") skipped += 1;
      if (sampleIncidents.length < 5) sampleIncidents.push(saved.incident);

      const relatedEvidence = result.evidence.filter((evidence) => {
        const haystack = `${evidence.id} ${evidence.title} ${evidence.summary}`.toLowerCase();
        const volcanoName = String(incident.technicalFactors.volcanoName ?? "").toLowerCase();
        const volcanoCode = String(incident.technicalFactors.volcanoCode ?? incident.technicalFactors.volcanoNumber ?? "").toLowerCase();
        return (volcanoName && haystack.includes(volcanoName)) || (volcanoCode && haystack.includes(volcanoCode));
      });
      const evidenceItems = relatedEvidence.length > 0 ? relatedEvidence : result.evidence.slice(0, 1);
      for (const evidence of evidenceItems) {
        const savedEvidence = await saveKnowledgeEvidenceIfNew({ ...evidence, incidentId: saved.incident.id });
        if (savedEvidence.action === "inserted") evidenceCreated += 1;
        if (savedEvidence.action === "skipped") evidenceSkipped += 1;
        if (sampleEvidence.length < 5) sampleEvidence.push(savedEvidence.evidence);
      }
    }

    await finishIngestionRun(run.id, {
      status: result.status === "ready" ? "success" : result.status === "partial" ? "partial" : result.status === "error" ? "failed" : "skipped",
      recordsFetched: result.fetched,
      recordsNormalized: result.incidents.length,
      recordsInserted: inserted,
      recordsUpdated: updated,
      recordsSkipped: skipped + evidenceSkipped,
      warningsJson: JSON.parse(JSON.stringify(result.warnings)),
      metadataJson: JSON.parse(JSON.stringify({
        adapterStatus: result.status,
        errors: result.errors,
        evidenceCreated,
        evidenceSkipped,
        endpoint: result.endpoint,
        geoJsonEndpoint: result.geoJsonEndpoint,
        coverageNote: result.coverageNote,
      })),
      errorMessage: result.status === "error" ? result.errors.join("; ") : undefined,
    });

    return {
      status: result.status === "ready" || result.status === "partial" ? "success" as const : result.status === "error" ? "failed" as const : "skipped" as const,
      runId: run.id,
      fetched: result.fetched,
      normalized: result.incidents.length,
      evidenceCreated,
      inserted,
      updated,
      skipped: skipped + evidenceSkipped,
      warnings: result.warnings,
      errors: result.errors,
      sampleIncidents,
      sampleEvidence,
    };
  } catch (error) {
    await finishIngestionRun(run.id, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "USGS Volcano HANS ingestion failed",
    });
    throw error;
  }
}

export async function runNwsKnowledgeIngestion(input: NwsIngestionJobInput = {}) {
  const source = getSourceById("nws");
  let run: Awaited<ReturnType<typeof createIngestionRun>>;
  try {
    if (source) await upsertKnowledgeSource(source);
    run = await createIngestionRun({
      sourceId: "nws",
      sourceName: "NWS / api.weather.gov",
      metadataJson: JSON.parse(JSON.stringify({
        mode: input.mode ?? "alerts",
        area: input.area,
        point: input.point,
        zone: input.zone,
        status: input.status ?? "actual",
        event: input.event,
        urgency: input.urgency,
        severity: input.severity,
        certainty: input.certainty,
        limit: input.limit ?? 100,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Knowledge persistence is unavailable";
    return {
      status: "failed" as const,
      runId: null,
      fetched: 0,
      normalized: 0,
      evidenceCreated: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      warnings: ["Knowledge persistence is unavailable. Apply the Knowledge Intake migration before using persist=true."],
      errors: [message],
      sampleIncidents: [],
      sampleEvidence: [],
    };
  }

  try {
    const result = await fetchNwsActiveAlerts({
      area: input.area,
      point: input.point,
      zone: input.zone,
      status: input.status ?? "actual",
      messageType: input.messageType,
      event: input.event,
      urgency: input.urgency,
      severity: input.severity,
      certainty: input.certainty,
      limit: input.limit ?? 100,
    });

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let evidenceCreated = 0;
    let evidenceSkipped = 0;
    const sampleIncidents = [];
    const sampleEvidence = [];

    for (const incident of result.incidents) {
      const saved = await upsertKnowledgeIncidentByExternalId(incident);
      if (saved.action === "inserted") inserted += 1;
      if (saved.action === "updated") updated += 1;
      if (saved.action === "skipped") skipped += 1;
      if (sampleIncidents.length < 5) sampleIncidents.push(saved.incident);

      const incidentEvidence = result.evidence.filter((evidence) => evidence.id.includes(incident.id.replace(/^nws-/, "")));
      const evidenceItems = incidentEvidence.length > 0 ? incidentEvidence : result.evidence.slice(0, 1);
      for (const evidence of evidenceItems) {
        const savedEvidence = await saveKnowledgeEvidenceIfNew({ ...evidence, incidentId: saved.incident.id });
        if (savedEvidence.action === "inserted") evidenceCreated += 1;
        if (savedEvidence.action === "skipped") evidenceSkipped += 1;
        if (sampleEvidence.length < 5) sampleEvidence.push(savedEvidence.evidence);
      }
    }

    await finishIngestionRun(run.id, {
      status: result.status === "ready" ? "success" : result.status === "partial" ? "partial" : result.status === "error" ? "failed" : "skipped",
      recordsFetched: result.fetched,
      recordsNormalized: result.incidents.length,
      recordsInserted: inserted,
      recordsUpdated: updated,
      recordsSkipped: skipped + evidenceSkipped,
      warningsJson: JSON.parse(JSON.stringify(result.warnings)),
      metadataJson: JSON.parse(JSON.stringify({
        adapterStatus: result.status,
        errors: result.errors,
        evidenceCreated,
        evidenceSkipped,
        endpoint: result.endpoint,
        userAgentConfigured: result.userAgentConfigured,
        coverageNote: "United States and NWS territories; not a complete worldwide weather source.",
      })),
      errorMessage: result.status === "error" ? result.errors.join("; ") : undefined,
    });

    return {
      status: result.status === "ready" || result.status === "partial" ? "success" as const : result.status === "error" ? "failed" as const : "skipped" as const,
      runId: run.id,
      fetched: result.fetched,
      normalized: result.incidents.length,
      evidenceCreated,
      inserted,
      updated,
      skipped: skipped + evidenceSkipped,
      warnings: result.warnings,
      errors: result.errors,
      sampleIncidents,
      sampleEvidence,
    };
  } catch (error) {
    await finishIngestionRun(run.id, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "NWS ingestion failed",
    });
    throw error;
  }
}

export async function runOpenMeteoContextEnrichment(input: OpenMeteoContextJobInput = {}) {
  const source = getSourceById("open-meteo");
  const purpose = input.purpose ?? "incident_context";
  const forecastDays = Math.min(Math.max(Math.trunc(input.forecastDays ?? 3), 1), 3);
  const maxIncidents = Math.min(Math.max(Math.trunc(input.maxIncidents ?? 25), 1), 50);
  const sinceHours = Math.min(Math.max(Math.trunc(input.sinceHours ?? 24), 1), 168);
  let run: Awaited<ReturnType<typeof createIngestionRun>>;
  try {
    if (source) await upsertKnowledgeSource(source);
    run = await createIngestionRun({
      sourceId: "open-meteo",
      sourceName: "Open-Meteo",
      metadataJson: JSON.parse(JSON.stringify({
        purpose,
        forecastDays,
        maxIncidents,
        sinceHours,
        persist: input.persist ?? true,
        contextualOnly: true,
        globalBulkIngestion: false,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Knowledge persistence is unavailable";
    return {
      runId: null,
      status: "failed" as const,
      consideredIncidents: 0,
      enrichedIncidents: 0,
      skippedAlreadyFresh: 0,
      skippedMissingCoordinates: 0,
      evidenceCreated: 0,
      warnings: ["Knowledge persistence is unavailable. Apply the Knowledge Intake migration before using Open-Meteo context jobs."],
      errors: [message],
      sampleContexts: [],
    };
  }

  const warnings = [
    "Open-Meteo context enrichment is not global ingestion and does not create KnowledgeIncident records.",
    "Open-Meteo is context only; validate official weather sources before critical decisions.",
  ];
  const errors: string[] = [];
  let consideredIncidents = 0;
  let enrichedIncidents = 0;
  let skippedAlreadyFresh = 0;
  let skippedMissingCoordinates = 0;
  let evidenceCreated = 0;
  const sampleContexts = [];

  try {
    const since = new Date(Date.now() - sinceHours * 60 * 60_000).toISOString();
    const incidents = await getKnowledgeIncidents({
      since,
      withCoordinates: true,
      limit: maxIncidents,
    });
    consideredIncidents = incidents.length;

    for (const incident of incidents) {
      if (typeof incident.latitude !== "number" || typeof incident.longitude !== "number") {
        skippedMissingCoordinates += 1;
        continue;
      }
      const fresh = await findFreshWeatherContextEvidence({ incidentId: incident.id, ttlMinutes: 60 });
      if (fresh) {
        skippedAlreadyFresh += 1;
        continue;
      }
      const forecast = await fetchOpenMeteoForecast({
        lat: incident.latitude,
        lon: incident.longitude,
        forecastDays,
        purpose,
        incidentId: incident.id,
        persist: input.persist ?? true,
      });
      if (forecast.status !== "ready" || !forecast.response) {
        errors.push(...("errors" in forecast ? forecast.errors ?? [] : []));
        continue;
      }
      const context = buildOpenMeteoWeatherContext(forecast.response, {
        lat: incident.latitude,
        lon: incident.longitude,
        forecastDays,
        purpose,
        incidentId: incident.id,
        persist: input.persist ?? true,
      });
      const evidence = buildOpenMeteoEvidence(context, { incidentId: incident.id, purpose, persist: true });
      const saved = await saveWeatherContextEvidenceIfFreshMissing({
        incidentId: incident.id,
        sourceId: "open-meteo",
        sourceName: "Open-Meteo",
        evidenceType: "weather_context",
        title: evidence.title,
        url: evidence.url,
        excerpt: evidence.summary,
        rawRef: context.id,
        confidenceScore: evidence.confidenceScore.finalConfidence,
        metadataJson: JSON.parse(JSON.stringify(context)),
      });
      if (saved.action === "inserted") {
        evidenceCreated += 1;
        enrichedIncidents += 1;
      }
      if (sampleContexts.length < 5) sampleContexts.push(context);
    }

    await finishIngestionRun(run.id, {
      status: errors.length > 0 && evidenceCreated === 0 ? "partial" : "success",
      recordsFetched: consideredIncidents,
      recordsNormalized: sampleContexts.length,
      recordsInserted: evidenceCreated,
      recordsSkipped: skippedAlreadyFresh + skippedMissingCoordinates,
      warningsJson: JSON.parse(JSON.stringify(warnings)),
      metadataJson: JSON.parse(JSON.stringify({
        purpose,
        forecastDays,
        maxIncidents,
        sinceHours,
        skippedAlreadyFresh,
        skippedMissingCoordinates,
        errors,
      })),
    });

    return {
      runId: run.id,
      status: errors.length > 0 && evidenceCreated === 0 ? "partial" as const : "success" as const,
      consideredIncidents,
      enrichedIncidents,
      skippedAlreadyFresh,
      skippedMissingCoordinates,
      evidenceCreated,
      warnings,
      errors,
      sampleContexts,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Open-Meteo context job failed";
    await finishIngestionRun(run.id, {
      status: "failed",
      recordsFetched: consideredIncidents,
      recordsInserted: evidenceCreated,
      recordsSkipped: skippedAlreadyFresh + skippedMissingCoordinates,
      errorMessage: message,
      warningsJson: JSON.parse(JSON.stringify(warnings)),
      metadataJson: JSON.parse(JSON.stringify({ errors })),
    });
    return {
      runId: run.id,
      status: "failed" as const,
      consideredIncidents,
      enrichedIncidents,
      skippedAlreadyFresh,
      skippedMissingCoordinates,
      evidenceCreated,
      warnings,
      errors: [...errors, message],
      sampleContexts,
    };
  }
}

export async function runUsgsWaterContextEnrichment(input: UsgsWaterContextJobInput = {}) {
  const source = getSourceById("usgs-water");
  const purpose = input.purpose ?? "flood";
  const radiusKm = Math.min(Math.max(Math.trunc(input.radiusKm ?? 25), 1), 50);
  const parameters = input.parameters?.length ? input.parameters : ["00060", "00065"];
  const maxIncidents = Math.min(Math.max(Math.trunc(input.maxIncidents ?? 25), 1), 50);
  const sinceHours = Math.min(Math.max(Math.trunc(input.sinceHours ?? 24), 1), 168);
  let run: Awaited<ReturnType<typeof createIngestionRun>>;
  try {
    if (source) await upsertKnowledgeSource(source);
    run = await createIngestionRun({
      sourceId: "usgs-water",
      sourceName: "USGS Water Data",
      metadataJson: JSON.parse(JSON.stringify({
        purpose,
        radiusKm,
        parameters,
        maxIncidents,
        sinceHours,
        persist: input.persist ?? true,
        contextualOnly: true,
        globalBulkIngestion: false,
        createsIncidents: false,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Knowledge persistence is unavailable";
    return {
      runId: null,
      status: "failed" as const,
      consideredIncidents: 0,
      enrichedIncidents: 0,
      skippedAlreadyFresh: 0,
      skippedMissingCoordinates: 0,
      skippedNoNearbyStation: 0,
      evidenceCreated: 0,
      apiFamily: "legacy" as const,
      legacyFallbackUsed: false,
      warnings: ["Knowledge persistence is unavailable. Apply the Knowledge Intake migration before using USGS Water context jobs."],
      errors: [message],
      sampleContexts: [],
    };
  }

  const warnings = [
    "USGS Water context enrichment is not global ingestion and does not create KnowledgeIncident records.",
    "USGS Water readings are context only; they are not flood forecasts, evacuation orders or route closures.",
  ];
  const errors: string[] = [];
  let consideredIncidents = 0;
  let enrichedIncidents = 0;
  let skippedAlreadyFresh = 0;
  let skippedMissingCoordinates = 0;
  let skippedNoNearbyStation = 0;
  let evidenceCreated = 0;
  let legacyFallbackUsed = false;
  const apiFamilies = new Set<string>();
  const sampleContexts = [];

  try {
    const since = new Date(Date.now() - sinceHours * 60 * 60_000).toISOString();
    const incidents = await getKnowledgeIncidents({
      since,
      withCoordinates: true,
      limit: maxIncidents,
    });
    const relevant = incidents.filter((incident) => {
      const haystack = `${incident.domain} ${incident.subtype} ${incident.title} ${incident.summary} ${JSON.stringify(incident.tagsJson ?? [])}`.toLowerCase();
      return ["flood", "storm", "hurricane", "severe_weather", "landslide", "citizen_report", "weather"].some((term) => haystack.includes(term));
    });
    consideredIncidents = relevant.length;

    for (const incident of relevant) {
      if (typeof incident.latitude !== "number" || typeof incident.longitude !== "number") {
        skippedMissingCoordinates += 1;
        continue;
      }
      const fresh = await findFreshHydrologicalContextEvidence({ incidentId: incident.id, ttlMinutes: 60 });
      if (fresh) {
        skippedAlreadyFresh += 1;
        continue;
      }
      const result = await fetchAndBuildUsgsWaterContext({
        lat: incident.latitude,
        lon: incident.longitude,
        radiusKm,
        parameters,
        purpose,
        incidentId: incident.id,
        persist: input.persist ?? true,
      });
      if (!result.context) {
        errors.push(...result.errors);
        continue;
      }
      apiFamilies.add(result.apiFamily);
      legacyFallbackUsed = legacyFallbackUsed || result.legacyFallbackUsed;
      warnings.push(...result.warnings);
      if (result.context.riskFactors.noNearbyStation) {
        skippedNoNearbyStation += 1;
        if (sampleContexts.length < 5) sampleContexts.push(result.context);
        continue;
      }
      const evidence = buildUsgsWaterEvidence(result.context, { incidentId: incident.id, purpose, persist: true });
      const saved = await saveWeatherContextEvidenceIfFreshMissing({
        incidentId: incident.id,
        sourceId: "usgs-water",
        sourceName: "USGS Water Data",
        evidenceType: "hydrological_context",
        title: evidence.title,
        url: evidence.url,
        excerpt: evidence.summary,
        rawRef: result.context.id,
        confidenceScore: evidence.confidenceScore.finalConfidence,
        metadataJson: JSON.parse(JSON.stringify(result.context)),
      });
      if (saved.action === "inserted") {
        evidenceCreated += 1;
        enrichedIncidents += 1;
      }
      if (sampleContexts.length < 5) sampleContexts.push(result.context);
    }

    await finishIngestionRun(run.id, {
      status: errors.length > 0 && evidenceCreated === 0 ? "partial" : "success",
      recordsFetched: consideredIncidents,
      recordsNormalized: sampleContexts.length,
      recordsInserted: evidenceCreated,
      recordsSkipped: skippedAlreadyFresh + skippedMissingCoordinates + skippedNoNearbyStation,
      warningsJson: JSON.parse(JSON.stringify([...new Set(warnings)])),
      metadataJson: JSON.parse(JSON.stringify({
        purpose,
        radiusKm,
        parameters,
        maxIncidents,
        sinceHours,
        skippedAlreadyFresh,
        skippedMissingCoordinates,
        skippedNoNearbyStation,
        apiFamily: apiFamilies.size > 1 ? "mixed" : Array.from(apiFamilies)[0] ?? "legacy",
        legacyFallbackUsed,
        errors,
      })),
    });

    return {
      runId: run.id,
      status: errors.length > 0 && evidenceCreated === 0 ? "partial" as const : "success" as const,
      consideredIncidents,
      enrichedIncidents,
      skippedAlreadyFresh,
      skippedMissingCoordinates,
      skippedNoNearbyStation,
      evidenceCreated,
      apiFamily: apiFamilies.size > 1 ? "mixed" as const : (Array.from(apiFamilies)[0] as "modern" | "legacy" | "mixed" | undefined) ?? "legacy",
      legacyFallbackUsed,
      warnings: [...new Set(warnings)],
      errors,
      sampleContexts,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "USGS Water context job failed";
    await finishIngestionRun(run.id, {
      status: "failed",
      recordsFetched: consideredIncidents,
      recordsInserted: evidenceCreated,
      recordsSkipped: skippedAlreadyFresh + skippedMissingCoordinates + skippedNoNearbyStation,
      errorMessage: message,
      warningsJson: JSON.parse(JSON.stringify([...new Set(warnings)])),
      metadataJson: JSON.parse(JSON.stringify({ errors })),
    });
    return {
      runId: run.id,
      status: "failed" as const,
      consideredIncidents,
      enrichedIncidents,
      skippedAlreadyFresh,
      skippedMissingCoordinates,
      skippedNoNearbyStation,
      evidenceCreated,
      apiFamily: apiFamilies.size > 1 ? "mixed" as const : (Array.from(apiFamilies)[0] as "modern" | "legacy" | "mixed" | undefined) ?? "legacy",
      legacyFallbackUsed,
      warnings: [...new Set(warnings)],
      errors: [...errors, message],
      sampleContexts,
    };
  }
}

export async function runNoaaStormEventsImport(input: NoaaStormEventsImportJobInput) {
  if (!input.year) {
    return {
      runId: null,
      status: "failed" as const,
      year: input.year,
      fetched: 0,
      parsed: 0,
      filtered: 0,
      normalized: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      evidenceCreated: 0,
      warnings: ["NOAA Storm Events import requires a specific year and controlled limit."],
      errors: ["year is required"],
      sampleIncidents: [],
    };
  }
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 1000), 1), 5000);
  const source = getSourceById("noaa-storm-events");
  let run: Awaited<ReturnType<typeof createIngestionRun>>;
  try {
    if (source) await upsertKnowledgeSource(source);
    run = await createIngestionRun({
      sourceId: "noaa-storm-events",
      sourceName: "NOAA Storm Events",
      metadataJson: JSON.parse(JSON.stringify({
        year: input.year,
        state: input.state,
        eventTypes: input.eventTypes,
        limit,
        offset: input.offset ?? 0,
        persist: input.persist ?? true,
        sourceRole: "historical_training_dataset",
        isLiveSource: false,
        runAllDefault: false,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Knowledge persistence is unavailable";
    return {
      runId: null,
      status: "failed" as const,
      year: input.year,
      state: input.state,
      eventTypes: input.eventTypes,
      fetched: 0,
      parsed: 0,
      filtered: 0,
      normalized: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      evidenceCreated: 0,
      warnings: ["Knowledge persistence is unavailable. Apply the Knowledge Intake migration before using NOAA persist=true."],
      errors: [message],
      sampleIncidents: [],
    };
  }

  try {
    const result = await fetchAndNormalizeNoaaStormEvents({ ...input, limit, mode: "import", persist: true });
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let evidenceCreated = 0;
    let evidenceSkipped = 0;
    const sampleIncidents = [];

    for (const incident of result.incidents) {
      const saved = await upsertKnowledgeIncidentByExternalId(incident);
      if (saved.action === "inserted") inserted += 1;
      if (saved.action === "updated") updated += 1;
      if (saved.action === "skipped") skipped += 1;
      if (sampleIncidents.length < 5) sampleIncidents.push(saved.incident);
      const evidenceItems = result.evidence.filter((evidence) => evidence.id.includes(incident.id.replace(/^noaa-storm-events-/, "")));
      for (const evidence of evidenceItems) {
        const savedEvidence = await saveKnowledgeEvidenceIfNew({ ...evidence, incidentId: saved.incident.id });
        if (savedEvidence.action === "inserted") evidenceCreated += 1;
        if (savedEvidence.action === "skipped") evidenceSkipped += 1;
      }
    }

    await finishIngestionRun(run.id, {
      status: result.status === "ready" ? "success" : "skipped",
      recordsFetched: result.fetched,
      recordsNormalized: result.normalized,
      recordsInserted: inserted,
      recordsUpdated: updated,
      recordsSkipped: skipped + evidenceSkipped,
      warningsJson: JSON.parse(JSON.stringify(result.warnings)),
      metadataJson: JSON.parse(JSON.stringify({
        endpoint: result.endpoint,
        parsed: result.parsed,
        filtered: result.filtered,
        evidenceCreated,
        evidenceSkipped,
        sourceRole: result.sourceRole,
        isLiveSource: result.isLiveSource,
      })),
    });

    return {
      runId: run.id,
      status: result.status === "ready" ? "success" as const : "skipped" as const,
      year: input.year,
      state: input.state,
      eventTypes: input.eventTypes,
      fetched: result.fetched,
      parsed: result.parsed,
      filtered: result.filtered,
      normalized: result.normalized,
      inserted,
      updated,
      skipped: skipped + evidenceSkipped,
      evidenceCreated,
      warnings: result.warnings,
      errors: result.errors,
      sampleIncidents,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "NOAA Storm Events import failed";
    await finishIngestionRun(run.id, {
      status: "failed",
      errorMessage: message,
      warningsJson: JSON.parse(JSON.stringify(["NOAA Storm Events import failed before completion."])),
    });
    return {
      runId: run.id,
      status: "failed" as const,
      year: input.year,
      state: input.state,
      eventTypes: input.eventTypes,
      fetched: 0,
      parsed: 0,
      filtered: 0,
      normalized: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      evidenceCreated: 0,
      warnings: ["NOAA Storm Events is historical only; retry with a specific year/state/eventTypes/limit."],
      errors: [message],
      sampleIncidents: [],
    };
  }
}

function hasOpenFemaControlledFilter(input: OpenFemaImportJobInput) {
  return Boolean(input.year || input.state || input.disasterNumber || input.incidentTypes?.length);
}

export async function runOpenFemaDisasterDeclarationsImport(input: OpenFemaImportJobInput) {
  if (!hasOpenFemaControlledFilter(input)) {
    return {
      runId: null,
      status: "failed" as const,
      dataset: "disaster-declarations",
      year: input.year,
      state: input.state,
      incidentTypes: input.incidentTypes,
      disasterNumber: input.disasterNumber,
      fetched: 0,
      normalized: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      evidenceCreated: 0,
      institutionalLessonsCreated: 0,
      operationalPrecedentsCreated: 0,
      warnings: ["OpenFEMA import requires a controlled filter and never imports all Disaster Declarations Summaries at once."],
      errors: ["year, state, disasterNumber or incidentTypes is required"],
      sampleIncidents: [],
      samplePrecedents: [],
    };
  }

  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 1000), 1), 5000);
  const source = getSourceById("openfema");
  let run: Awaited<ReturnType<typeof createIngestionRun>>;
  try {
    if (source) await upsertKnowledgeSource(source);
    run = await createIngestionRun({
      sourceId: "openfema",
      sourceName: "OpenFEMA",
      metadataJson: JSON.parse(JSON.stringify({
        dataset: "disaster-declarations",
        year: input.year,
        state: input.state,
        incidentTypes: input.incidentTypes,
        declarationType: input.declarationType,
        disasterNumber: input.disasterNumber,
        limit,
        skip: input.skip ?? 0,
        persist: input.persist ?? true,
        sourceRole: "disaster_declaration_recovery_dataset",
        isLiveSensor: false,
        runAllDefault: false,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Knowledge persistence is unavailable";
    return {
      runId: null,
      status: "failed" as const,
      dataset: "disaster-declarations",
      year: input.year,
      state: input.state,
      incidentTypes: input.incidentTypes,
      disasterNumber: input.disasterNumber,
      fetched: 0,
      normalized: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      evidenceCreated: 0,
      institutionalLessonsCreated: 0,
      operationalPrecedentsCreated: 0,
      warnings: ["Knowledge persistence is unavailable. Apply the Knowledge Intake migration before using OpenFEMA persist=true."],
      errors: [message],
      sampleIncidents: [],
      samplePrecedents: [],
    };
  }

  try {
    const result = await fetchAndNormalizeOpenFemaDisasterDeclarations({ ...input, limit, mode: "import", persist: true });
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let evidenceCreated = 0;
    let evidenceSkipped = 0;
    const sampleIncidents = [];
    const samplePrecedents = [];

    for (const incident of result.incidents) {
      const saved = await upsertKnowledgeIncidentByExternalId(incident);
      if (saved.action === "inserted") inserted += 1;
      if (saved.action === "updated") updated += 1;
      if (saved.action === "skipped") skipped += 1;
      if (sampleIncidents.length < 5) sampleIncidents.push(saved.incident);
      if (samplePrecedents.length < 5 && incident.technicalFactors.operationalPrecedent) {
        samplePrecedents.push(incident.technicalFactors.operationalPrecedent);
      }

      const evidenceItems = result.evidence.filter((evidence) => evidence.incidentId === incident.id);
      for (const evidence of evidenceItems) {
        const savedEvidence = await saveKnowledgeEvidenceIfNew({ ...evidence, incidentId: saved.incident.id });
        if (savedEvidence.action === "inserted") evidenceCreated += 1;
        if (savedEvidence.action === "skipped") evidenceSkipped += 1;
      }
    }

    const institutionalLessonsCreated = result.incidents.reduce(
      (count, incident) => count + (incident.technicalFactors.institutionalLessons?.length ?? 0),
      0
    );
    const operationalPrecedentsCreated = result.incidents.filter((incident) => incident.technicalFactors.operationalPrecedent).length;

    await finishIngestionRun(run.id, {
      status: result.status === "ready" ? "success" : "skipped",
      recordsFetched: result.fetched,
      recordsNormalized: result.normalized,
      recordsInserted: inserted,
      recordsUpdated: updated,
      recordsSkipped: skipped + evidenceSkipped,
      warningsJson: JSON.parse(JSON.stringify(result.warnings)),
      metadataJson: JSON.parse(JSON.stringify({
        dataset: "disaster-declarations",
        endpoint: result.endpoint,
        evidenceCreated,
        evidenceSkipped,
        institutionalLessonsCreated,
        operationalPrecedentsCreated,
        sourceRole: result.sourceRole,
        isLiveSensor: result.isLiveSensor,
        caveat: "ARGUS recommendation based on FEMA precedent; not an official FEMA instruction.",
      })),
    });

    return {
      runId: run.id,
      status: result.status === "ready" ? "success" as const : "skipped" as const,
      dataset: "disaster-declarations",
      year: input.year,
      state: input.state,
      incidentTypes: input.incidentTypes,
      disasterNumber: input.disasterNumber,
      fetched: result.fetched,
      normalized: result.normalized,
      inserted,
      updated,
      skipped: skipped + evidenceSkipped,
      evidenceCreated,
      institutionalLessonsCreated,
      operationalPrecedentsCreated,
      warnings: result.warnings,
      errors: result.errors,
      sampleIncidents,
      samplePrecedents,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "OpenFEMA import failed";
    await finishIngestionRun(run.id, {
      status: "failed",
      errorMessage: message,
      warningsJson: JSON.parse(JSON.stringify(["OpenFEMA import failed before completion."])),
    });
    return {
      runId: run.id,
      status: "failed" as const,
      dataset: "disaster-declarations",
      year: input.year,
      state: input.state,
      incidentTypes: input.incidentTypes,
      disasterNumber: input.disasterNumber,
      fetched: 0,
      normalized: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      evidenceCreated: 0,
      institutionalLessonsCreated: 0,
      operationalPrecedentsCreated: 0,
      warnings: ["OpenFEMA is institutional/historical only; retry with controlled filters and limit."],
      errors: [message],
      sampleIncidents: [],
      samplePrecedents: [],
    };
  }
}

function asArray(value?: string | string[]) {
  if (!value) return undefined;
  return Array.isArray(value) ? value : value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

export async function runAllConfiguredKnowledgeIngestion(options: { includeContextual?: boolean; includeHydrologicalContext?: boolean } = {}) {
  const results = [];
  results.push({ sourceId: "usgs_earthquake", result: await runUsgsKnowledgeIngestion({ feedType: "relevant", limit: 50 }) });
  results.push({
    sourceId: "gdacs",
    result: await runGdacsKnowledgeIngestion({
      eventTypes: ["EQ", "TC", "FL", "VO", "DR", "WF"],
      daysBack: 7,
      alertLevels: ["red", "orange", "green"],
      limit: 100,
    }),
  });
  results.push({
    sourceId: "nasa-eonet",
    result: await runEonetKnowledgeIngestion({
      status: "open",
      days: 30,
      categories: ["wildfires", "severeStorms", "volcanoes", "floods", "landslides", "drought", "dustHaze"],
      limit: 100,
    }),
  });
  results.push({
    sourceId: "usgs-volcano-hans",
    result: await runUsgsVolcanoHansKnowledgeIngestion({
      mode: "elevated",
      observatory: "all",
      days: 7,
      includeNotices: true,
      includeGeoJson: true,
      limit: 100,
    }),
  });
  results.push({
    sourceId: "nws",
    result: await runNwsKnowledgeIngestion({
      mode: "alerts",
      area: "US",
      status: "actual",
      limit: 100,
      persist: true,
    }),
  });
  results.push({
    sourceId: "open-meteo",
    status: options.includeContextual ? "contextual_enrichment_enabled" : "skipped",
    skipped: !options.includeContextual,
    message: options.includeContextual
      ? "Open-Meteo will run only as contextual enrichment for recent incidents with coordinates."
      : "Open-Meteo is a contextual source and is skipped by run-all unless includeContextual=true.",
    result: options.includeContextual
      ? await runOpenMeteoContextEnrichment({ purpose: "incident_context", forecastDays: 3, maxIncidents: 25, sinceHours: 24, persist: true })
      : null,
  });
  results.push({
    sourceId: "usgs-water",
    status: options.includeHydrologicalContext ? "hydrological_context_enabled" : "skipped",
    skipped: !options.includeHydrologicalContext,
    message: options.includeHydrologicalContext
      ? "USGS Water will run only as hydrological context for recent relevant incidents with coordinates."
      : "USGS Water is a contextual hydrological source and is skipped by run-all unless includeHydrologicalContext=true.",
    runAllDefault: false,
    sourceRole: "hydrological_monitoring_source",
    result: options.includeHydrologicalContext
      ? await runUsgsWaterContextEnrichment({ purpose: "flood", maxIncidents: 25, sinceHours: 24, radiusKm: 25, parameters: ["00060", "00065"], persist: true })
      : null,
  });
  results.push({
    sourceId: "noaa-storm-events",
    status: "historicalDatasetAvailable",
    skipped: true,
    message: "NOAA Storm Events is a controlled historical dataset and is not executed by run-all by default.",
    runAllDefault: false,
    requiredMode: "POST /api/knowledge-intake/jobs/import-noaa-storm-events with year and limit",
  });
  results.push({
    sourceId: "openfema",
    status: "institutionalDatasetAvailable",
    skipped: true,
    message: "OpenFEMA is a controlled institutional disaster declarations dataset and is not executed by run-all by default.",
    runAllDefault: false,
    sourceRole: "disaster_declaration_recovery_dataset",
    requiredMode: "POST /api/knowledge-intake/jobs/import-openfema-disaster-declarations with year/state/disasterNumber/incidentTypes and limit",
  });

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

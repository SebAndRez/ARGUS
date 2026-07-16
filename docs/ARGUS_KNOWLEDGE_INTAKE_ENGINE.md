# ARGUS Knowledge Intake Engine

ARGUS Knowledge Intake Engine is the operational learning layer for ARGUS GRID. It is designed to absorb open sources, technical reports, datasets, manual inputs and future institutional integrations, then convert them into structured incident knowledge.

## Current Scope

- Universal `KnowledgeInputEnvelope` contract.
- Initial source registry for disaster, road, industrial, nuclear/radiological, fire, Chilean and scientific sources.
- Controlled live adapters for USGS Earthquake and ReliefWeb, executed only on demand.
- NASA FIRMS adapter scaffold with `NASA_FIRMS_MAP_KEY` guard; no key values are printed or embedded.
- Dependency-free parsers for text, CSV, JSON, RSS, HTML, PDF/DOCX/XLSX scaffolds and geospatial inputs.
- Incident normalization, entity extraction, source scoring, evidence scoring, lesson extraction, similarity and conservative reasoning.
- Demo knowledge base with 12 incidents and reusable lessons.
- Protected dashboard page at `/dashboard/knowledge-intake`.

## Live Source Activation Phase

This phase moves the module from architecture-only to controlled real ingestion:

- `fetchUsgsEarthquakes()` reads public USGS GeoJSON feeds for significant, daily and magnitude-relevant earthquakes.
- `normalizeUsgsEarthquakeFeature()` converts GeoJSON features into `ArgusIncidentKnowledge` with magnitude, depth, place and tsunami flag metadata.
- `fetchReliefWebReports()` reads recent ReliefWeb reports from the current `/v2/reports` API with optional country, disaster type and limit filters when `RELIEFWEB_APP_NAME` is configured and approved.
- `normalizeReliefWebReport()` creates incident knowledge and evidence records, lowering geospatial precision when coordinates are unavailable.
- `fetchFirmsActiveFires()` is prepared for NASA FIRMS CSV area ingestion but returns `requiresApiKey` when `NASA_FIRMS_MAP_KEY` is missing.
- `fetchUsgsVolcanoHans()` reads public USGS Volcano HANS/VSC endpoints for elevated monitored volcanoes, recent notices and optional GeoJSON fallback without an API key.
- `/api/knowledge-intake/live/usgs`, `/api/knowledge-intake/live/reliefweb` and `/api/knowledge-intake/live/firms` expose controlled test endpoints. ReliefWeb returns `requiresConfiguration` until an approved app name is configured.
- `/api/knowledge-intake/health` now reports active sources, stubs, sources requiring API key, adapter status and parser status.
- `/dashboard/knowledge-intake` includes on-demand test controls for USGS and ReliefWeb plus recent normalized incidents.

The live adapters do not create persistent records and do not inject events into the operational map automatically.

## Knowledge Persistence And Learning Phase

ARGUS now has a persistent learning memory prepared through Prisma/PostgreSQL.
The persistence layer stores:

- knowledge sources;
- ingestion runs;
- normalized incidents;
- evidence;
- lessons learned;
- documents;
- document chunks;
- embedding records as `vectorRef` placeholders;
- admin review actions.

The migration is non-destructive and creates only Knowledge Intake tables:
`202607020003_add_knowledge_intake_persistence`.

### Persistent USGS

USGS remains available in preview/live mode:

```text
GET /api/knowledge-intake/live/usgs?feed=relevant&limit=25
```

To persist normalized incidents and create an ingestion run:

```text
GET /api/knowledge-intake/live/usgs?feed=relevant&limit=25&persist=true
POST /api/knowledge-intake/jobs/run-usgs
```

USGS deduplication uses the external USGS feature id plus `sourceId`. Re-running
the same feed should update or skip existing records instead of duplicating them.

### Jobs

```text
POST /api/knowledge-intake/jobs/run-usgs
POST /api/knowledge-intake/jobs/run-all
```

`run-all` currently persists USGS only. ReliefWeb is skipped until
`RELIEFWEB_APP_NAME` is configured and approved. NASA FIRMS is skipped until
`NASA_FIRMS_MAP_KEY` is configured.
OpenAQ is skipped by default and only runs as contextual enrichment through
`/api/knowledge-intake/jobs/run-openaq-context` or a future explicit
`includeAirQualityContext=true` flag.

### OpenAQ Air Quality Context

OpenAQ is registered as `openaq` with source role
`air_quality_observation_source`. ARGUS uses OpenAQ API v3 as provider-dependent
air quality observation context for smoke, wildfire health context, volcanic
ash/dust/haze, urban pollution, NAV, Fenix and AURA respiratory context.

```http
GET /api/knowledge-intake/live/openaq?lat=-33.4489&lon=-70.6693&radiusKm=25&parameters=pm25,pm10,o3,no2,so2,co
POST /api/knowledge-intake/jobs/run-openaq-context
```

`OPENAQ_API_KEY` is required. Without it, health and live endpoints return
`requiresConfiguration` and do not call OpenAQ. Phase 1 supports locations,
sensors, latest measurements, parameters, providers, owners and licenses by
`locationId`, `sensorId`, `lat/lon/radius` or `bbox`.

ARGUS persists OpenAQ only as `KnowledgeEvidence` with evidence type
`air_quality_observation_context`. It does not create `KnowledgeIncident`
records for measurements, high PM values or isolated air quality readings.

Required caveats:

- Preserve OpenAQ, provider, owner, license, API URL, locationId, sensorId,
  parameter, value, unit, observedAt and staleness.
- Treat commercial reuse as `check_license_per_provider`.
- Do not present OpenAQ as an official health alert, complete worldwide source,
  medical diagnosis, evacuation order or causal smoke attribution.
- No scraping, global bulk polling or hourly/long-range history in phase 1.

Prepared later phases include hourly/recent measurements, FIRMS smoke
correlation, EONET/GDACS volcano/dust/haze correlation, NWS/local AQ alert
integration, NAV exposure routing, AURA respiratory guidance and local official
AQ APIs such as Chile MMA/SINCA, EPA AirNow, EEA and CAMS.

### USGS Volcano HANS

USGS Volcano HANS is active as a fast no-key source for USGS monitored
volcanoes:

```http
GET /api/knowledge-intake/live/usgs-volcano-hans?mode=elevated&observatory=all&days=7&includeNotices=true&includeGeoJson=true&limit=100
GET /api/knowledge-intake/live/usgs-volcano-hans?mode=elevated&persist=true
POST /api/knowledge-intake/jobs/run-usgs-volcano-hans
```

The adapter keeps terrestrial `alertLevel` separate from
`aviationColorCode`, stores HANS notices as evidence, and projects persisted
incidents with coordinates into `/api/knowledge-intake/map-events` under the
`USGS Volcano HANS Alerts` layer. HANS is an official USGS source for USGS
monitored volcanoes; it is not a complete worldwide local volcano authority.

The volcano source pattern is intentionally extensible:
`VolcanoAlertSource`, `VolcanoAlertRecord`, `VolcanoAlertLevel`,
`VolcanoAviationColorCode` and `VolcanoNoticeEvidence` can support future
regional sources such as SERNAGEOMIN, JMA, IMO, PHIVOLCS, GNS Science, INGV,
VAACs and Smithsonian/GVP without rewriting the HANS adapter.

Vercel Cron is not active yet. These endpoints are on-demand operational hooks.

### Manual And File Import

Manual import accepts `persist=true` and can store:

- document;
- parsed chunks;
- normalized incident;
- evidence;
- lessons when the input looks doctrinal or technical.

File import supports text-preview processing for TXT, Markdown, JSON and CSV.
PDF, DOCX and XLSX remain parser scaffolds unless raw text is provided. OCR is
not active.

### Review

Basic review endpoints:

```text
GET /api/knowledge-intake/review/pending
POST /api/knowledge-intake/review/[id]
```

Supported statuses: `approved`, `rejected`, `needs_more_evidence`, `pending`.
Approving an incident/document sets its review status to `auto_accepted`.

### Map Events

```text
GET /api/knowledge-intake/map-events
```

This endpoint transforms persisted knowledge incidents with coordinates through
`knowledgeIncidentToOperationalMapEvent()`. It is read-only and does not insert
records into `/api/events`.

### RAG Preparation

`documentChunker.ts` creates 800-1200 word chunks with overlap and metadata.
`knowledgeVectorStore.ts` exposes a pgvector-ready interface with textual
fallback:

- `searchSimilarChunks(query)`
- `searchSimilarIncidents(input)`
- `getContextForIncident(incident)`

(`upsertEmbeddingRecord(record)` was retired in the Prompt 20 cleanup — it had
zero callers anywhere in the repo, so `KnowledgeEmbeddingRecord` rows are
currently never written by anything. The Prisma model itself is untouched;
a real writer would need to be added if this capability is needed again.)

No real embeddings are generated yet.

## Safety Rules

- ARGUS does not invent missing evidence.
- Weak evidence lowers confidence and requires human validation.
- Citizen or manual inputs do not carry the same weight as official sources.
- Recommendations are informational unless a future institutional integration explicitly validates them.
- Sources with license uncertainty remain marked for manual review.

## Future Work

- OCR for scanned PDFs.
- pgvector/RAG-backed knowledge search.
- Scheduler/Vercel Cron for live ingestion.
- Durable file storage and malware scanning.
- Full admin role enforcement on review/job endpoints.
- Real embeddings and pgvector similarity search.
- ReliefWeb appname approval and FIRMS MAP_KEY operational policy.
- Integration with Fenix Twin, Routing Intelligence and AURA Medic Mesh using persisted knowledge.
- Scheduler, cache, retry policy and source audit trail for live adapters.

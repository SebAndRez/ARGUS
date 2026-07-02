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
- `/api/knowledge-intake/live/usgs`, `/api/knowledge-intake/live/reliefweb` and `/api/knowledge-intake/live/firms` expose controlled test endpoints. ReliefWeb returns `requiresConfiguration` until an approved app name is configured.
- `/api/knowledge-intake/health` now reports active sources, stubs, sources requiring API key, adapter status and parser status.
- `/dashboard/knowledge-intake` includes on-demand test controls for USGS and ReliefWeb plus recent normalized incidents.

The live adapters do not create persistent records and do not inject events into the operational map automatically.

## Safety Rules

- ARGUS does not invent missing evidence.
- Weak evidence lowers confidence and requires human validation.
- Citizen or manual inputs do not carry the same weight as official sources.
- Recommendations are informational unless a future institutional integration explicitly validates them.
- Sources with license uncertainty remain marked for manual review.

## Future Work

- Persistent raw document store.
- OCR for scanned PDFs.
- pgvector/RAG-backed knowledge search.
- Real connectors after legal/API review.
- Admin review queue and audit trail.
- Integration with Fenix Twin, Routing Intelligence and AURA Medic Mesh using persisted knowledge.
- Scheduler, cache, retry policy and source audit trail for live adapters.

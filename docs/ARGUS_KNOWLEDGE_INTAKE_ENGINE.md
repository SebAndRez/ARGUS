# ARGUS Knowledge Intake Engine

ARGUS Knowledge Intake Engine is the operational learning layer for ARGUS GRID. It is designed to absorb open sources, technical reports, datasets, manual inputs and future institutional integrations, then convert them into structured incident knowledge.

## Current Scope

- Universal `KnowledgeInputEnvelope` contract.
- Initial source registry for disaster, road, industrial, nuclear/radiological, fire, Chilean and scientific sources.
- Stub adapters only. No new external API calls are executed by this module.
- Dependency-free parsers for text, CSV, JSON, RSS, HTML, PDF/DOCX/XLSX scaffolds and geospatial inputs.
- Incident normalization, entity extraction, source scoring, evidence scoring, lesson extraction, similarity and conservative reasoning.
- Demo knowledge base with 12 incidents and reusable lessons.
- Protected dashboard page at `/dashboard/knowledge-intake`.

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

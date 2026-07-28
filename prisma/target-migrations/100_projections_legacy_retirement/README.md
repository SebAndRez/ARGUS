# Wave 100 — Projections & Legacy Retirement

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Objective

Create `proj.*` (the read-only projection layer — 11 views/materialized
views/parametric functions per the Table Catalog v1.1 counting
convention, plus the permanent D-03 VESTA passthrough); create the
remaining `knowledge.*` structure (11 tables — see note below on why
all 11, not a 3/8 split, land in this wave); document (never execute)
the retirement of the 2 confirmed-dead current tables and the
disposition of the other 31 current tables per D-03/D-05.

## Note on knowledge.* scope (11 tables here, not 3/8)

`ARGUS_EXECUTABLE_DATABASE_MIGRATION_PLAN_v1.0.md`'s "Ola 9" section
originally sketched 3 `knowledge.*` tables with real backfill
(`lessons_learned`, `knowledge_documents`, `knowledge_facts`) landing
alongside `ice.*`/`media.*` in Wave 090, with the remaining 8
structural-only tables here in Wave 100. The migration.sql actually
built for `090_ice_media` (reviewed at the start of this session)
contains **zero** `knowledge.*` content — only `ice`/`media`/`community`.
`prisma/schema.target.prisma` is unambiguous on where the authoritative
line falls: every one of the 11 `knowledge.*` models' `SQL_COMPLEMENTARY_REQUIRED`
comments point to `prisma/target-migrations/100_projections_legacy_retirement/migration.sql`,
with no exception for `lessons_learned`/`knowledge_documents`/`knowledge_facts`.
This wave follows the frozen schema (the higher-authority artifact) over
the executable plan's earlier sketch — all 11 tables are created here,
and the 3 with a real current-database source receive their backfill
here too (see `backfill.sql`).

## Tables / views covered

`knowledge.*` (11): `after_action_reviews`, `findings`,
`improvement_recommendations`, `corrective_actions`, `lessons_learned`,
`lesson_learned_findings`, `procedures`, `knowledge_documents`,
`knowledge_facts`, `simulations`, `simulation_results`.

`proj.*` (11 per Table Catalog v1.1's counting convention — 9 named
entries + the 5 role-parametric views grouped as 2): `trust_profiles`
(materialized), `trust_profile_detail`, `incident_timelines`,
`mission_timelines`, `public_map_feed` (materialized, P1-06
`ST_Simplify` mandatory), `public_alert_feed`,
`notification_feed_for_actor(actor_id)` (parametric function over an
internal materialized view), `nearby_professional_feed` (parametric),
`operational_unit_member_counts`, plus `institutional_view` /
`assigned_unit_view` / `requester_view` / `operational_context` /
`incident_cards` (5 role-parametric functions, counted as 2 of the 11).
Additionally `proj.legacy_vesta_preparedness_profiles` (D-03,
permanent, not counted in the 11 — a transition-only artifact).

## VERIFY_AGAINST_V1.0 disclosure

No `proj.*` view/function body is given verbatim in any frozen
document — Table Catalog v1.1 §proj gives "fed by" source +
refresh-strategy only, never a SELECT list. Every body in `migration.sql`
is a structural best-effort reconstruction, individually flagged, and
must be reviewed against the application's actual read patterns
(`src/lib/operationalContext/*`, notification/messaging code) before
being treated as final DDL. The 11 `knowledge.*` table shapes come
directly from `prisma/schema.target.prisma` (already frozen/validated),
so those are **not** flagged `VERIFY_AGAINST_V1.0` — only the enum value
sets inferred per Enums Reference Data v1.1 #98/#99 (`procedure_status_enum`,
`knowledge_document_status_enum`) carry a `VALUES_INFERRED` note,
consistent with the schema's own doc-comments.

## Dependencies on prior waves

All of Waves 000-090, per the Executable Plan's "Ola 10" §5 ("todas las
Olas 1-9 estables en producción"). Structurally: `identity.reputation_events`
(020), `incident.incidents`/`.incident_transitions`/`.affected_area_versions`
(040), `mission.missions` (050), `alert.alerts`/`.alert_authorizations`
(070), `resource.operational_unit_members` (060),
`help.help_requests`/`.collaboration_invitations` (050),
`comms.messages` (070), `evidence.*` (030).

## Human decisions (D-0X) that apply

**D-03**: `proj.legacy_vesta_preparedness_profiles` is created here —
the permanent (not transitional-with-an-end-date) read-only passthrough
of the 5 current VESTA tables, with zero transformation. VESTA is
**never** retired in this migration (open by design, per the Decision
Register's own closure criterion).

**D-05**: `Sanction` is **never** retired or migrated to
`identity.reputation_events` in this migration — stays
`LEGACY_READ_ONLY`, open by design.

Both D-03 and D-05 apply transversally to the retirement notes in §"Legacy
retirement notes" below: neither VESTA's 5 tables nor `Sanction` appear
in any `DROP`/retirement list, anywhere in this wave.

## What this wave does NOT do

- Does not `DROP` `ExternalEventCorrelation` or `KnowledgeEmbeddingRecord`
  for real — `migration.sql` §5 documents the statements as explicit
  `-- DRAFT (do not run)` comments only. Actual retirement requires a
  separate, human-run Prisma migration against the CURRENT
  `prisma/schema.prisma`, which this session's mandate explicitly
  forbids modifying.
- Does not retire `PreparednessProfile`/`FamilyPlan`/`EmergencyContact`(VESTA)/
  `PreparednessChecklistItem`/`PreparednessReminder` (D-03) or `Sanction`
  (D-05) — both stay `LEGACY_READ_ONLY` indefinitely, pending a future
  human decision outside D-01..D-08.
- Does not grant any application role write access to `proj.*` — the
  transversal rule from the Executable Plan is enforced by explicit
  `REVOKE` in `migration.sql` §4, not merely by omission of `GRANT`.
- Does not attempt to reconcile the exact row count of
  `knowledge.knowledge_documents` after the `HazardKnowledgeDocument`(59)+
  `KnowledgeDocument`(0) fusion beyond "≤59, pending dedup of the 4
  documented duplicate-column pairs" — see `backfill.sql`/`backfill-plan.md`.

## Legacy retirement notes (33 current tables, per `ARGUS_TARGET_CURRENT_MAPPING_v1.1_FROZEN.md` §2 "Retiro" column)

| Current table | Retiro (verbatim disposition) |
|---|---|
| `User` | No retirable hasta Ola 2 completa + Ola 10 |
| `Report` | Tras Ola 3 + Ola 10 |
| `HelpRequest` | Tras Ola 5 |
| `AuditLog` | Nunca — se conserva como historial migrado in-place |
| `Sanction` | **Abierto (D-05)** — depende de decisión doctrinal humana futura, no cubierta por este mandato |
| `ExternalEvent` | Ola 10, condicionado a paridad confirmada |
| `IngestionRun` | Tras fusión de pipelines |
| `ExternalEventCorrelation` | **Retirar directamente en Ola 10** (confirmado sin uso) |
| `RiskAssessment` | Tras Ola 6 |
| `RiskAssessmentRevision` | Migrar in-place |
| `HazardKnowledgeDocument` | Tras fusión (con `KnowledgeDocument`) |
| `HazardKnowledgeFact` | Migrar in-place |
| `KnowledgeSource` | Tras consolidación (DUP-003) |
| `KnowledgeIngestionRun` | Tras fusión (con `IngestionRun`) |
| `KnowledgeIncident` | Solo tras Ola 4 + Ola 10, nunca antes de validar 100% de paridad |
| `IncidentRelation` | Migrar estructura, no datos |
| `IncidentTransition` | Migrar in-place con reconstrucción de dimensión |
| `KnowledgeEvidence` | Migrar in-place |
| `KnowledgeLesson` | Migrar estructura |
| `KnowledgeDocument` | Tras fusión |
| `KnowledgeDocumentChunk` | Decisión pendiente — no cubierta por D-01..D-08 |
| `KnowledgeEmbeddingRecord` | **Retirar directamente en Ola 10** (confirmado muerta) |
| `KnowledgeAdminReview` | Completar las 2 ramas faltantes antes de decidir destino final |
| `PreparednessProfile` | **Abierto (D-03)** — depende de mandato humano futuro que identifique los hechos fuente |
| `FamilyPlan` | Igual que `PreparednessProfile` (D-03) |
| `EmergencyContact` (VESTA) | Igual (D-03) |
| `PreparednessChecklistItem` | Igual (D-03) |
| `PreparednessReminder` | Igual (D-03) |
| `CriticalPoi` | Conservar como fuente de referencia; no se retira, se extiende |
| `CriticalPoiOperationalStatus` | Migrar in-place |
| `CriticalPoiStatusEvidence` | Migrar in-place tras corregir FK faltante (REL-002) |
| `TelecomConnectivityStatus` | Migrar estructura (D-04) |
| `TelecomConnectivityEvidence` | Migrar estructura (D-04) |

Only `ExternalEventCorrelation` and `KnowledgeEmbeddingRecord` are
disposed as "retirar directamente en Ola 10" — every other table either
retires conditionally on a later confirmation (paridad/fusión/decisión
pendiente) or is explicitly never retired (`AuditLog`, and D-03/D-05's
open subtrees). This wave's `migration.sql` §5 reflects exactly that:
2 documented-but-not-executed `DROP` drafts, nothing more.

## Retirement acceptance criteria (Executable Plan "Ola 10" §6)

Applied individually per candidate structure, never in bulk: (1) zero
confirmed consumers for 4 weeks, (2) migration verified, (3) tests
passing, (4) observability stable for 1 week, (5) rollback plan
documented before the `DROP`. `ExternalEventCorrelation` and
`KnowledgeEmbeddingRecord` already satisfy (1)-(3) per the Baseline's
independent verification (§9); (4)/(5) require a live monitoring window
this session cannot provide.

## Files in this folder

| File | Purpose |
|---|---|
| `migration.sql` | Schemas (`knowledge`, `proj`), 9 local enums, 11 `knowledge.*` tables, 11 `proj.*` views/matviews/functions + `legacy_vesta_preparedness_profiles`, RLS on `knowledge.*`, proj write-REVOKE, documentary-only retirement drafts (§5) |
| `rollback.sql` | Reverse order — functions/matviews/views before `knowledge.*` tables (children first), types, schemas |
| `validation.sql` | SELECT-only: table/view/matview/function counts, proj write-REVOKE confirmation, P1-06 `ST_Simplify` presence check, D-03 passthrough view existence, RLS coverage on `knowledge.*`, confirms the 2 dead current tables were NOT actually dropped |
| `backfill-plan.md` | `KnowledgeLesson`(0)→`lessons_learned`; `HazardKnowledgeDocument`(59)+`KnowledgeDocument`(0)→`knowledge_documents` (FUSIONAR); `HazardKnowledgeFact`(41)→`knowledge_facts` (TRANSFORMAR) |
| `test-plan.md` | `target-table-traceability.test.ts` (retirement list) and the P1-06/D-03/proj-write-revoke assertions are the load-bearing checks for this wave |

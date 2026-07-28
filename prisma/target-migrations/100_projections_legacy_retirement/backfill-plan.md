# Wave 100 — Projections & Legacy Retirement — Backfill Plan

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Source -> target

| Source (current) | Rows | Target | Action |
|---|---|---|---|
| `KnowledgeLesson` | 0 | `knowledge.lessons_learned` | MIGRAR 1:1 — structural mapping only, 0 rows to move |
| `HazardKnowledgeDocument` | 59 | `knowledge.knowledge_documents` | FUSIONAR (with `KnowledgeDocument`) — resolve 4 pairs of duplicate columns before insert |
| `KnowledgeDocument` | 0 | `knowledge.knowledge_documents` | FUSIONAR (same target as above, 0 rows contributed) |
| `HazardKnowledgeFact` | 41 | `knowledge.knowledge_facts` + `governance.hazard_types` (seed, Wave 010) | TRANSFORMAR — `hazardType` string becomes an FK to `governance.hazard_types`, reconciled against the 8-value Enums Reference v1.1 §2.1 seed |

All 8 remaining `knowledge.*` tables (`after_action_reviews`, `findings`,
`improvement_recommendations`, `corrective_actions`,
`lesson_learned_findings`, `procedures`, `simulations`,
`simulation_results`) are `CREATE_EMPTY` — no current-database source.
`proj.*` is a pure read-only projection layer over already-migrated data
in prior waves — it receives no backfill of its own (its "population" is
whatever the underlying tables already contain post-Wave-090).
`proj.legacy_vesta_preparedness_profiles` is explicitly **not** backfill —
it is a passive, zero-transformation projection (D-03), documented in
`README.md`.

## D-02 applicability

`knowledge.knowledge_documents`/`.knowledge_facts` both carry the 5
provenance columns (`legacy_status`, `legacy_source`, `legacy_record_id`,
`migration_confidence`, `migration_review_status`) per D-02's universal
rule for any table receiving backfill from a current table.
`knowledge.lessons_learned` carries them too, even though its source
(`KnowledgeLesson`) is empty today — the columns exist so the first real
row, whenever it lands, is never silently un-traceable.

## Batch strategy

`knowledge_documents` (59+0=59 rows, pending dedup): single batch — low
volume does not justify batching overhead. `knowledge_facts` (41 rows):
single batch. `lessons_learned` (0 rows): no-op batch, structure only.

## Idempotency key

`legacy_record_id` per table, uniquely indexed
(`uq_knowledge_documents_legacy`, `uq_knowledge_facts_legacy`,
`uq_lessons_learned_legacy` — all declared in `migration.sql`, partial
unique indexes `WHERE legacy_record_id IS NOT NULL` so the 8 structural-
only tables' rows, which never carry a `legacy_record_id`, are unaffected).

## Checkpoint strategy

Checkpoint 1: "`HazardKnowledgeDocument`+`KnowledgeDocument` fully fused"
(59+0=59 source rows accounted for, post-dedup count "no verificado"
until the 4 duplicate-column pairs are resolved against real row
content). Checkpoint 2: "`HazardKnowledgeFact` fully transformed" (41/41,
`hazard_type_id` FK resolved for every row). Checkpoint 3: "`KnowledgeLesson`
fully migrated" (0/0, trivially satisfied).

## Deduplication

`knowledge_documents`'s fusion is the one deduplication-sensitive step in
this wave: `HazardKnowledgeDocument` and `KnowledgeDocument` have 4
overlapping column pairs (title/version/status-shaped fields per both
source tables) that must be reconciled per-row before a single fused row
is inserted — never insert both sources' rows independently and dedupe
after the fact, since that risks a duplicate `knowledge_documents` row
per legacy title. The dedup rule itself (which of the 4 pairs wins on
conflict) is not fixed here — flagged for the human review this backfill
requires before execution.

## Migration confidence / review status

`knowledge_documents`: `MEDIUM` (fusion requires per-row judgment on the
4 duplicate-column pairs — not a mechanical 1:1 copy).
`knowledge_facts`: `MEDIUM` (T-0x-style transform, `hazardType`→FK
resolution not yet spot-checked against real row shapes).
`lessons_learned`: `HIGH` (trivial — 0 rows, pure structural readiness).

## Row counts

Before: 0 for all 11 `knowledge.*` tables. After:
`lessons_learned`=0, `knowledge_documents`<=59 ("no verificado" until
dedup runs against real data), `knowledge_facts`=41. All 8 structural-only
tables: 0.

## Validation / rollback / non-migratable records

See `validation.sql`. Rollback: `DELETE ... WHERE legacy_source IN
('HazardKnowledgeDocument','KnowledgeDocument','HazardKnowledgeFact','KnowledgeLesson')`
in child-to-parent order (`knowledge_facts` before `knowledge_documents`).
Non-migratable: none confirmed — every row in the 3 real sources has a
defined destination structure; the fusion's dedup judgment call is a
review requirement, not a data-loss event.

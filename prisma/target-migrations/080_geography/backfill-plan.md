# Wave 080 — Geography — Backfill Plan

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Source -> target

| Target table | Source | Rows | Action |
|---|---|---|---|
| `geo.administrative_areas` | None — no current-database source | 0 | EXTERNAL_SOURCE_REQUIRED (D-07) — schema created, geometry never populated without an approved official cartographic provider |
| `geo.meeting_points` | `CriticalPoi` (D-06 route B subset — **not** `FamilyPlan.primaryMeetingPoint`, a v1.0 mapping error corrected in v1.1 per D-03) | subset of 530, "no verificado" until classification rule table runs | TRANSFORMAR |
| `geo.extraction_points`, `geo.reception_points` | `CriticalPoi` (D-06 route B candidates) | subset of 530, "no verificado" | MIGRATION_REVIEW_QUEUE — depends on the same classification rule not yet built (see Wave 060 backfill-plan.md) |
| `geo.operational_zones`, `.operational_sectors`, `.operational_routes`, `.perimeters` | None | 0 | CREATE_EMPTY |

## D-07 applicability

Governs `geo.administrative_areas` entirely: the current database has zero
geospatial columns (only `latitude Float?`/`longitude Float?` pairs on
`Report`, `HelpRequest`, `ExternalEvent`, `HazardKnowledgeFact`,
`KnowledgeIncident`, `CriticalPoi`) — there is no polygon data anywhere to
migrate, and constructing one from loose points would be fabricated
geometry presented as official, an unacceptable risk. This plan does not
propose any workaround — the table is created, deliberately empty, and the
provider-selection decision is documented as an open blocker outside this
migration's scope.

## D-06 continuation

`meeting_points`/`extraction_points`/`reception_points` share the same
dependency as Wave 060's `resource.resources`/`.facilities`: they cannot be
populated until the human-reviewed `CriticalPoi.type`/`.category`
classification rule table exists. Until then, every candidate row for these
3 tables defaults to `MIGRATION_REVIEW_QUEUE`, consistent with D-06's
"never guess" mandate.

## Batch strategy / idempotency / checkpoint / deduplication

N/A for `administrative_areas` (0 rows by design). For the 3 `CriticalPoi`-
derived tables, batch/idempotency strategy is identical to Wave 060's
(`legacy_record_id` per row, batched by classification rule once approved).

## Migration confidence / review status

`administrative_areas`: N/A (no data). Route-B `CriticalPoi` subset: `LOW`
until the classification rule exists, same posture as Wave 060.

## Row counts

Before: 0 for all 8 target tables. After: `administrative_areas`=0 (D-07,
by design), `meeting_points`/`extraction_points`/`reception_points`=
subset of 530 "no verificado", remaining 4 tables=0.

## Validation / rollback / non-migratable records

See `validation.sql`. Rollback: `DELETE ... WHERE legacy_source = 'CriticalPoi'`
for the 3 route-B tables; `administrative_areas` has nothing to roll back
(always empty in this migration). Non-migratable: none confirmed —
`administrative_areas` is not "non-migratable", it is explicitly deferred
pending a human decision (provider selection) outside this session's scope.

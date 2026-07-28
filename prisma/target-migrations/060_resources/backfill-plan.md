# Wave 060 — Resources — Backfill Plan

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Source -> target (D-06 4-way split)

| Source (current) | Rows | Target route | Action |
|---|---|---|---|
| `CriticalPoi` + `CriticalPoiOperationalStatus` (108 rows, shelter category, managed state) | 108 (clearest route-A candidates of 530) | **(A)** `resource.facilities` | TRANSFORMAR (T-08 analog) |
| `CriticalPoi` (remaining ~422 rows, classified by `type`/`category` per a human-reviewed rule table — not guessed here) | remainder of 530 | **(A)** `resource.resources`, or **(B)** `geo.meeting_points`/`.extraction_points`/`.reception_points` (Wave 080), or **(C)** public reference (Wave 100), or **(D)** `MIGRATION_REVIEW_QUEUE` | DIVIDIR |
| `CriticalPoiOperationalStatus.capacityTotal`/`.occupancyCurrent`/`.capacityDeclared` | 108 | `resource.inventories` (+ `resource.facilities` status columns) | MIGRAR 1:1 |
| `CriticalPoiStatusEvidence` | 108 | Historical trail inside `resource.facilities`/`.inventories` (via `security.audit_logs` or an equivalent history mechanism) | MIGRATION_REVIEW_QUEUE — the current REL-002 missing-FK asymmetry (`CriticalPoiStatusEvidence` has no real FK to `CriticalPoiOperationalStatus` despite 1:1 row parity) must be fixed explicitly during backfill, never inherited silently into the target schema |

All other `resource.*` tables (`operational_units`, `operational_unit_members`,
`supplies`, `vehicle_profiles`, `aircraft_profiles`,
`uncrewed_vehicle_profiles`, `resource_reservations`) are `CREATE_EMPTY` — no
current-database source.

## D-06 classification rule (must be documented, never guessed)

Per the Decision Register: "no se adivina aquí qué valores de `type` mapean
a qué destino; el catálogo de backfill... documenta la regla exacta por
valor observado, y todo valor de `type` sin regla clara cae en (D)". This
backfill plan does **not** invent that rule table here — it requires
inspection of the real distinct `CriticalPoi.type`/`.category` values against
production data (not done in this session, no `execute_sql` access) before
the classification can be executed. Until that inspection happens, every
`CriticalPoi` row outside the 108 shelter rows defaults to route **(D)**
`MIGRATION_REVIEW_QUEUE`, never guessed into (A)/(B)/(C).

## Batch strategy

108 shelter rows: single batch (small volume, high confidence). Remaining
~422 rows: batched by `type`/`category` value once the classification rule
table is human-reviewed and approved — never migrated ahead of that review.

## Idempotency key

`legacy_record_id` (original `CriticalPoi.id`/`CriticalPoiOperationalStatus.id`/
`CriticalPoiStatusEvidence.id`) per target table.

## Checkpoint strategy

Checkpoint 1: 108 shelter rows fully migrated to `resource.facilities`+
`resource.inventories`, REL-002 FK gap fixed. Checkpoint 2: classification
rule table for the remaining ~422 rows reviewed and approved by a human.
Checkpoint 3: all 530 `CriticalPoi` rows accounted for across routes A/B/C/D
(D-06's closure criterion — "ningún CriticalPoi queda sin clasificación
registrada", even if the registered classification is the review queue).

## Deduplication

N/A at this volume — `legacy_record_id` uniqueness is sufficient.

## Migration confidence / review status

108 shelter rows: `HIGH` (clear structural match, existing FK on the
`CriticalPoiOperationalStatus` side). Remaining ~422 rows: `LOW` until the
classification rule table exists — every one of these rows starts
`migration_review_status = REQUIRES_REVIEW` by default, upgraded to
`AUTO_MAPPED` only once a specific `type` value's rule is approved.

## Row counts

Before: 0 for all 10 target tables. After: `resource.facilities`+
`resource.inventories`=108 (high confidence), remaining ~422 `CriticalPoi`
rows split across `resource.resources`/`geo.*`/proj reference/review queue —
exact split "no verificado" until the classification rule table is built and
run against real data. All other tables in this wave: 0.

## Validation / rollback / non-migratable records

See `validation.sql`. Rollback: `DELETE ... WHERE legacy_source = 'CriticalPoi'`
in child-to-parent order — reversible since the source `CriticalPoi` table
is untouched. Non-migratable records: none confirmed — every `CriticalPoi`
row has at minimum a defined destination (even if that destination is the
review queue, which is itself a registered outcome, not data loss, per D-06's
own closure criterion).

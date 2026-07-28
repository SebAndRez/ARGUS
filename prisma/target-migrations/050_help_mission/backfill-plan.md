# Wave 050 — Help & Mission — Backfill Plan

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Source -> target

| Source (current) | Rows | Target | Action |
|---|---|---|---|
| `HelpRequest` | 0 | `help.help_requests` | TRANSFORMAR (T-05) — structural mapping only, 0 rows to move |
| `HelpRequest` (origin, distinguishing requester from affected) | 0 | `help.affected_people` | DIVIDIR — 0 rows |
| All 10 `mission.*` tables | 0 (no persisted dispatch domain today) | — | CREATE_EMPTY |
| All other `help.*` tables (`operational_needs`, `rescue_assessments`, `collaboration_invitations`) | 0 | — | CREATE_EMPTY |
| `help.situation_updates` | 0 | — | NO_RECONSTRUCTABLE (status was mutated in place, no history captured) |

## Applicability of Access Control v1.1 §8

Not a D-0X item, but treated with the same rigor as one: the physical closure
mechanism (`help.close_help_request_authorized`) must exist before any real
`HelpRequest` data flows through the target schema, even though today's
volume is 0. This wave's migration creates the function and its RLS
reinforcement now, ahead of any real usage, per the mandate's "specify the
operation physically, not narratively" requirement.

## Batch strategy

N/A — 0 rows to move for `help_requests`/`affected_people`; the rest of this
wave is `CREATE_EMPTY`.

## Idempotency key

N/A for this wave's backfill (0 rows). The `close_help_request_authorized`
function's own `p_idempotency_key` parameter is the runtime idempotency
mechanism for the *operation*, not for a one-time backfill — see
`migration.sql` for its design.

## Checkpoint strategy

Single checkpoint: "help.* and mission.* schemas exist, empty, with the
authorized-closure function and its RLS reinforcement in place" — verified
by `validation.sql`.

## Deduplication / legacy ID handling / migration confidence

N/A — 0 rows. If `HelpRequest` gains real rows before cutover, this plan
must be revisited with a real row-level backfill (flagged as a risk in
`ARGUS_MIGRATION_DECISION_REGISTER_v1.0_FROZEN.md`'s general pattern for
"currently empty but active" tables).

## Row counts

Before: 0. After: 0 for all 16 tables in this wave (structural readiness
only). Real backfill for `help_requests` becomes non-trivial only once
production data exists — this plan documents the mapping so that data is
never lost when that day comes, per D-04's precedent (Telecom tables,
Wave 030).

## Validation / rollback / non-migratable records

See `validation.sql`. Rollback: `DROP FUNCTION`/`DROP TABLE` as in
`rollback.sql` — no data loss risk at 0 rows. No record is non-migratable
(there are none to migrate yet).

# Wave 020 — Identity — Backfill Plan

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Source -> target

`User` (current, 7 rows) is the sole source, per
`ARGUS_TARGET_CURRENT_MAPPING_v1.1_FROZEN.md` §1/§2:

| Target table | Action | Source columns |
|---|---|---|
| `identity.people` | DIVIDIR | `legal_name`, `display_alias`, `national_id_hash`, `contact_info` (identity half of `User`) |
| `identity.user_accounts` | DIVIDIR | `email`, `passwordHash`, `googleSub`, `authProvider`, `accountStatus`, `lastLoginAt` (account half of `User`) |
| `identity.verified_identities` | DERIVAR | 1 row created only where `User.governmentIdHash IS NOT NULL`; `verified_at`/`document_type`/`document_country` set explicitly `NULL` (NO_RECONSTRUCTABLE — never captured historically, not guessed) |
| `identity.consents` | DERIVAR | `User.termsAcceptedAt`/`.privacyAcceptedAt` — timestamps only, no accepted-terms-version (partially NO_RECONSTRUCTABLE for exact version) |
| `identity.reputation_events` | DERIVAR | `User.trustScore`/`.strikes` — **current value only**, not a reconstructed event history (no historical ledger exists in the current schema) |
| `identity.liveness_checks`, `identity.devices`, `identity.operational_sessions`, `identity.emergency_contacts` | CREATE_EMPTY | No current-database source |
| `institution.*` (all 4) | CREATE_EMPTY (D-01) | Zero synthetic rows |
| `capability.*` (all 4) | CREATE_EMPTY | No current-database source (new domain) |

## D-01 applicability

**Governs this entire wave.** No `institutional_memberships` row is created
for any of the 7 migrated `User` rows. `institution_assignment_status` is
never a stored column — it is derived at read time (see `validation.sql` §3).
Motivation (verbatim from the Decision Register): creating a synthetic
"no-institution" organization would introduce a false authority node into
the trust graph; an explicit, queryable `UNASSIGNED` state is preferable.

## Batch strategy

Single batch — 7 rows total across `people`/`user_accounts`. Order:
`people` first (parent), then `user_accounts` (references `person_id`),
then `verified_identities`/`consents`/`reputation_events` (reference
`person_id`), all within one transaction per source `User` row so a partial
failure never leaves an orphaned `user_accounts` row without its `people`
parent.

## Idempotency key

`legacy_record_id` (the original `User.id` cuid) is the idempotency key
across all 5 target tables that receive a row per `User`. Re-running the
backfill is `ON CONFLICT` on a unique index over `(legacy_source, legacy_record_id)`
per table (index not yet declared in `migration.sql` — flagged
`SQL_COMPLEMENTARY_REQUIRED`, to be added alongside the backfill script
itself, since it is backfill-idempotency infrastructure, not steady-state
schema).

## Checkpoint strategy

One checkpoint: "all 7 `User` rows have exactly one `people` + one
`user_accounts` row, and zero `institutional_memberships` rows exist" — a
single pass/fail gate, since volume is trivial (7 rows).

## Deduplication

Not applicable at this volume (7 source rows, no duplicate-detection logic
needed) — `email`/`google_sub` uniqueness constraints on `user_accounts`
double as a deduplication safety net if the backfill script were accidentally
run twice without the idempotency key check.

## Migration confidence / review status

`people`/`user_accounts`: `HIGH` (direct field split, no ambiguity).
`verified_identities`/`consents`: `MEDIUM` (partially NO_RECONSTRUCTABLE
fields set to NULL, reviewed and accepted as a known gap, not an error).
`reputation_events`: `MEDIUM` (current-value-only, no historical ledger —
`migration_review_status = REQUIRES_REVIEW` recommended for all 7, since a
"snapshot as a single event" model is a judgment call about how to represent
history that never existed).

## Row counts

Before: 0 (no `identity.*`/`institution.*`/`capability.*` tables exist).
After: `people`=7, `user_accounts`=7, `verified_identities`<=7 (exact count
"no verificado" until the `governmentIdHash IS NOT NULL` filter is run
against real data), `consents`<=7 (same caveat), `reputation_events`=7,
`institution.*`=0 (D-01), `capability.*`=0.

## Validation / rollback / non-migratable records

See `validation.sql`. Rollback: `DELETE FROM identity.<table> WHERE
legacy_source = 'User'` in child-to-parent order, reversible without loss
since the source `User` table is untouched by this migration (Prisma/current
database is never modified by this package). No `User` row is
non-migratable — all 7 map cleanly to `people`+`user_accounts`.

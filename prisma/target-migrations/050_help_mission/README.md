# Wave 050 — Help & Mission

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Objective

Create `help.*` (6 tables, including the authorized-closure mechanism from
Access Control v1.1 §8) and `mission.*` (10 tables — an entirely new
dispatch/operations domain, `CREATE_EMPTY` since `src/modules/fenix/*`
currently plans without persisting).

## Tables covered

`help.help_requests`, `help.operational_needs`, `help.affected_people`,
`help.rescue_assessments`, `help.situation_updates`,
`help.collaboration_invitations` (6); `mission.missions`,
`mission.mission_assignments`, `mission.mission_offers`,
`mission.mission_acceptances`, `mission.mission_rejections`,
`mission.mission_reassignments`, `mission.support_requests`,
`mission.mission_outcomes`, `mission.mission_communication_channels`,
`mission.mission_meeting_point_assignments` (10).

## VERIFY_AGAINST_V1.0 disclosure

Same caveat as prior waves. `help.help_requests` and `mission.missions` have
full fichas transcribed verbatim from Table Catalog v1.1; the other 14
tables are reconstructed from cross-referenced clues.

## Dependencies on prior waves

`010_foundation`, `020_identity`, `040_incident` (`incident.incidents`,
`command.command_roles` — referenced by the closure function's deferred
validation).

## Human decisions applying

`help.help_requests`'s authorized-closure operation
(`help.close_help_request_authorized`) is specified in full in Access
Control v1.1 §8, not a D-0X item, but treated with the same rigor: it is the
**only** path allowed to write `status`/`closed_*` columns, reinforced by an
independent RLS `UPDATE` policy denying the requester regardless of function
behavior (§8.3, "two independent barriers, neither substitutes the other").
The migration.sql function body is a structural skeleton — the assignment/
command-role and jurisdiction validation, plus the situation_updates/
audit_logs inserts, are flagged `SQL_COMPLEMENTARY_REQUIRED` pending final
review, never silently omitted from the design.

## What this wave does NOT do

- Does not backfill any `mission.*` table — the entire schema is
  `CREATE_EMPTY` (no persisted dispatch data exists today).
- Does not implement the column-level `REVOKE UPDATE` on `help_requests`'
  status-adjacent columns from `app_api` — flagged
  `SQL_COMPLEMENTARY_REQUIRED` in `migration.sql` §6, since the current table-
  level `GRANT UPDATE` is broader than the mandate's "no direct UPDATE" ideal
  and needs a deliberate follow-up statement, not a silent gap.
- Does not backfill `help.situation_updates` (`NO_RECONSTRUCTABLE` — status
  was mutated in-place with no history captured).

## Files in this folder

| File | Purpose |
|---|---|
| `migration.sql` | Schemas, 15 local enums, 16 tables, the authorized-closure function, deferred FK from Wave 010, RLS, grants |
| `rollback.sql` | Reverse order, guarded, drops the function first |
| `validation.sql` | SELECT-only: table/column existence, closure-function/CHECK presence, RLS coverage |
| `backfill-plan.md` | `HelpRequest`(0 rows)->`help_requests` structural only; `mission.*` fully CREATE_EMPTY |
| `test-plan.md` | `target-help-request-close.test.ts` is the load-bearing test for this wave |

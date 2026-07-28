# Wave 000 — Preflight

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Objective

This wave carries no domain tables. Its sole purpose is to prepare the *process*
surrounding every wave that follows: verified backups, the six physical roles
required by `ARGUS_PHYSICAL_ACCESS_CONTROL_v1.1_FROZEN.md`, drift-detection
queries against the current production database, and feature-flag scaffolding
notes (the `governance.feature_flags` table itself is created in Wave 010 —
this wave only documents the flags that will gate cutover).

This wave is also where the **existing, already-found drift** is addressed:
production currently has RLS enabled on all 33 current tables with **zero
policies**, plus an undocumented `public.rls_auto_enable()` SECURITY DEFINER
function reachable by `anon`/`authenticated` via PostgREST
(`ARGUS_RLS_AUTO_ENABLE_REMEDIATION_v1.0.md`,
`ARGUS_CURRENT_RLS_CONTAINMENT_PLAN_v1.0.md`). `rls_auto_enable_remediation.sql`
in this folder addresses that specific drift — it does not design new RLS
(that is Wave 010's `rls_*.sql` files).

## Tables covered

None. Zero `CREATE TABLE` statements in this wave. `migration.sql` contains
only `CREATE ROLE` statements (roles are cluster-level objects, not
schema-scoped) and comments describing the backup/drift-check process.

## Dependencies on prior waves

None — this is the first wave.

## Human decisions (D-0X) that apply

- **None of D-01..D-08 apply directly to this wave's content** — this wave is
  process/security scaffolding, not a data-mapping decision. However, every
  later wave's backfill depends on this wave's backup verification having
  actually happened before any DDL is applied against the shared database.
- The `rls_auto_enable_remediation.sql` content in this wave directly responds
  to the drift documented in `ARGUS_RLS_AUTO_ENABLE_REMEDIATION_v1.0.md` §8-11,
  which is prerequisite reading before this wave is ever executed for real.

## What this wave does NOT do

- Does not create any `governance.*`, `security.*`, or any other domain table
  — those are Wave 010.
- Does not grant the six roles any table privileges — privilege grants happen
  per-wave, alongside each wave's `CREATE TABLE`, so that a role's privilege
  surface grows in lockstep with the tables that exist at that point.
- Does not execute anything against the live database. Every statement in
  every `.sql` file in this folder is a draft for future human review.

## Files in this folder

| File | Purpose |
|---|---|
| `migration.sql` | Draft `CREATE ROLE` for the 6 physical roles + backup verification queries (as documented `SELECT`/comments, not executable backup commands) + feature-flag scaffolding notes |
| `rollback.sql` | Draft `DROP ROLE` in dependency-safe order, with guards |
| `validation.sql` | SELECT-only checks: do the 6 roles exist, do they have the expected (absence of) attributes (`NOSUPERUSER`, `NOBYPASSRLS`), drift-check queries comparing current `pg_policies`/`pg_tables.rowsecurity` against the documented baseline |
| `backfill-plan.md` | N/A for domain data (no tables) — documents the backup-verification and role-provisioning sequencing instead |
| `test-plan.md` | Names the target-schema tests this wave must satisfy before Wave 010 begins |
| `rls_auto_enable_remediation.sql` | Draft remediation for the existing `public.rls_auto_enable()` drift (Part B of this mandate) |

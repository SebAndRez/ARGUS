# Wave 010 — Foundation — Backfill Plan

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Which current table(s) feed this wave's target table(s)

None directly — `governance.*` and `security.*` have no source table in the
33-model current database (`ARGUS_CURRENT_DATABASE_BASELINE_v1.0.md`).
Per `ARGUS_TARGET_CURRENT_MAPPING_v1.1_FROZEN.md` §1 (`governance` section),
several rows are `DERIVAR` from **code/config**, not from database rows:

| Target table | Derived from (code, not DB) | Rows |
|---|---|---|
| `governance.territorial_configurations` | `src/lib/i18n/*`, `src/lib/units/*` (Chile hardcoded) | 0 real rows migrated — 1 seed row for Chile, human-authored, not extracted mechanically |
| `governance.operational_rules` | `ARGUS_ENABLE_FUSION_ENGINE` and analogous env flags | 0 — flag names only |
| `governance.automation_rules` | Hardcoded thresholds in `masterIncidentEngine.ts`/`globalWatchEngine.ts` | 0 — thresholds to be re-entered as governed config by a human, not auto-extracted (the numeric values themselves are not blindly copied without review, since they were never authored as auditable config) |
| `governance.feature_flags` | `ARGUS_ALLOW_DEMO_DATA`, `ARGUS_ENABLE_FUSION_ENGINE`, `ARGUS_EVENTS_DEMO_MODE`, `NEXT_PUBLIC_ARGUS_ENABLE_DEMO_ROLES` | 0 — flag **names** migrated from `.env.example`, values never copied (values are environment-specific secrets/config, out of scope for a schema-level backfill) |
| `governance.incident_types` | `KnowledgeIncident.domain`/`.subtype` distinct values (1,969 rows source) + the 13 seed rows of Enums Reference v1.1 §3 (classification-elevating types) | Distinct-value extraction, count "no verificado" until the extraction query is run against the source `domain`/`subtype` values |
| `governance.hazard_types` | `RiskAssessment.riskType` (45 rows) + `HazardKnowledgeFact.hazardType` (41 rows), reconciled to Enums Reference v1.1 §2.1 seed (incendio, inundación, sismo, tsunami, erupción volcánica, deslizamiento, sequía, epidemia) | Distinct-value reconciliation, "no verificado" exact count until run |
| `governance.administrative_area_kinds` | `HazardKnowledgeFact.country`/`.region`, `KnowledgeIncident.country`/`.region`/`.locality`, `CriticalPoi.adminLevel1`/`.adminLevel2` (3 incompatible naming conventions) | Distinct-value reconciliation across 3 sources, "no verificado" exact count |

All other `governance.*` and all 10 `security.*` tables are `CREATE_EMPTY`
(no current-database source at all) — see
`ARGUS_TARGET_CURRENT_MAPPING_v1.1_FROZEN.md` §1 for the per-table `Acción`
cell. `security.access_policies`/`permissions`/`access_roles`/
`access_role_permissions` are `DERIVAR` from **code** (`accessPolicy.ts`,
`rbac.ts`, `apiGuards.ts` hardcoded role-permission mapping), not from any
database rows — same caveat: names/shapes are extracted, hardcoded logic is
not mechanically transliterated into `CHECK`/policy SQL without human review.

`security.audit_logs` is the one exception with a real current-database
source: `AuditLog` (52 rows). See D-01/D-02 in
`ARGUS_MIGRATION_DECISION_REGISTER_v1.0_FROZEN.md` — this table's backfill is
detailed in `ARGUS_BACKFILL_CATALOG_v1.0.md` (Part C of this mandate), not
duplicated here in full, since `security.audit_logs`'s cryptographic
integrity chain (D-01) interacts with every other wave's audit trail and is
better documented once, centrally.

## Mapping decisions (D-01..D-08) applicable

None of D-01..D-08 directly governs `governance.*`/`security.*` table
population — they govern identity/incident/help/resource/geo/ice. The one
indirect touchpoint: `security.audit_logs`'s D-01/D-02 cryptographic-chain
and legacy-provenance columns are populated by the `AuditLog` (52 rows)
backfill referenced above.

## Batch strategy

- Seed-only tables (`governance.hazard_types`, `governance.administrative_area_kinds`,
  `governance.incident_types` classification-elevating 13 rows): single-batch
  `INSERT` from a reviewed, versioned seed list — never generated ad hoc at
  migration time.
- `security.audit_logs` (52 rows): single batch, chronological order
  preserved (`occurred_at` ascending) so the HMAC chain (`integrity_value`
  built from `digest || integrity_value_fila_anterior`, Enums/Reference v1.1
  §5) links correctly from the first migrated row forward. A **new** chain
  starts at the first migrated row (there is no prior chain to extend — the
  33-model database never had cryptographic integrity fields) — this is
  documented explicitly, not silently assumed continuous with anything before it.

## Idempotency key strategy

Seed rows use `UNIQUE(code)` (hazard_types, administrative_area_kinds,
incident_types, feature_flags) as the natural idempotency key — re-running
the seed INSERT is `ON CONFLICT (code) DO NOTHING`, never a blind re-insert.
`security.audit_logs` backfill uses `legacy_record_id` (the original
`AuditLog.id` cuid) as the idempotency key for re-runs.

## Checkpoint strategy

One checkpoint per seed catalog (hazard_types loaded / administrative_area_kinds
loaded / incident_types loaded / feature_flags loaded), plus one checkpoint
for `security.audit_logs` (all 52 rows present, HMAC chain verifies end to
end via a validation query re-deriving each `integrity_value` from the
previous row and comparing).

## Deduplication

Governance catalogs deduplicate by `code` at insert time. `security.audit_logs`
deduplicates by `legacy_record_id` (no natural duplicate risk given source is
a single 52-row table read once).

## Legacy ID handling

`security.audit_logs.legacy_record_id` (added per D-02's 5-column provenance
convention, referenced generically here — the audit_logs `CREATE TABLE` in
`migration.sql` does not yet show these 5 columns explicitly; they are added
in the backfill step per D-02's convention "every table receiving backfill
from a current table carries the 5 provenance columns", added via
`ALTER TABLE security.audit_logs ADD COLUMN` immediately before the backfill
runs, not baked into the initial `CREATE TABLE` since a from-scratch deploy
of the target schema needs no such columns at all).

## Migration confidence / review status

All seed catalogs: `migration_confidence = MEDIUM` (values are code-derived,
not directly observed database rows — human review required before
`ACTIVE`/`APPROVED` status). `security.audit_logs`: `migration_confidence = HIGH`
(1:1 structural migration of a real table with no ambiguous mapping).

## Row counts

Before: 0 (no `governance.*`/`security.*` tables exist in the current
33-table database). After (target, pending human-run extraction queries):
seed catalogs — "no verificado" until the extraction SQL against
`KnowledgeIncident`/`RiskAssessment`/`HazardKnowledgeFact`/`CriticalPoi` is
run; `security.audit_logs` — 52 (matches `AuditLog` current row count,
`ARGUS_CURRENT_DATABASE_BASELINE_v1.0.md` §5).

## Validation / rollback / non-migratable records

See `validation.sql` for post-backfill checks. Rollback of seed data is a
`DELETE ... WHERE legacy_source IS NULL AND created_at > <backfill_start>`
guarded by explicit human confirmation (seed catalogs have no
`legacy_record_id` to key off, since they are not migrated from a single
current-database row). No record in this wave's backfill scope is
non-migratable — every source (env flags, hardcoded thresholds, `AuditLog`
rows) has a defined destination.

# Wave 070 — Alerts & Communications — Backfill Plan

Status: **DRAFT — NOT EXECUTED — HUMAN REVIEW REQUIRED**

## Source -> target

All 15 tables in this wave are populated with **zero rows** from the current
database, for two distinct reasons per `ARGUS_TARGET_CURRENT_MAPPING_v1.1_FROZEN.md` §1:

| Target table | Reason for 0 rows |
|---|---|
| `alert.alerts` | DERIVAR — "alerta" today is a read-time projection of `KnowledgeIncident`/`ExternalEvent`, never a persisted entity; elevating it to a real table with its own authorization chain is new structure, not a data migration |
| `alert.alert_authorizations`, `.alert_cancellations`, `.alert_supersessions`, `.critical_instructions`, `.critical_instruction_versions`, `.instruction_authorizations`, `.instruction_compliance_records` | CREATE_EMPTY — entirely new domain |
| `comms.communication_plans`, `.delivery_attempts`, `.comprehension_confirmations`, `.offline_communication_plans`, `.communication_losses` | CREATE_EMPTY — entirely new domain |
| `comms.messages` | NO_RECONSTRUCTABLE — today's notification content is computed in memory at send time (`api/notifications/route.ts`) and never persisted |
| `comms.acknowledgements` | NO_RECONSTRUCTABLE — "read" state lives in client `localStorage` today, never reaches the server |

## D-04 non-relationship correction

`comms.communication_losses` is explicitly **not** fed by
`TelecomConnectivityStatus`/`TelecomConnectivityEvidence` — that would have
been v1.0's mapping; v1.1 corrects it, per D-04's own scope (those two
tables map to `evidence.*`, Wave 030, not to `comms.*`).

## Batch strategy / idempotency / checkpoint / deduplication

N/A — 0 rows to move in this entire wave.

## Migration confidence / review status

N/A — no backfill rows to assign confidence to. The structural design itself
(circular FK resolution, content_kind consistency trigger, D-01 integrity
chain) is the deliverable of this wave, reviewed via `test-plan.md`'s
assertions rather than via data-quality metrics.

## Row counts

Before: 0 for all 15 target tables (none exist in the current 33-table
database). After: 0 for all 15 (structural readiness only — this domain has
no current-database source at all, confirmed 0 real rows exist to migrate).

## Validation / rollback / non-migratable records

See `validation.sql`. Rollback: `DROP TABLE`/`DROP TRIGGER`/`DROP FUNCTION`
as in `rollback.sql` — zero data-loss risk at 0 rows. No record is
non-migratable (none exist).

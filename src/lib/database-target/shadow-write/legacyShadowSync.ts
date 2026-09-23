/**
 * src/lib/database-target/shadow-write/legacyShadowSync.ts
 *
 * THE shadow-write path (Paso 5). Everything else under `shadow-write/` is
 * either the pure-transform preview layer (`domains.ts`, which never
 * persists and no longer claims to) or the Ola-3 per-row runner kept for its
 * own tests (`wave3ShadowWriteRunner.ts`). This module is the one the
 * application calls after a legacy write commits, and the only one that
 * actually writes to the target database.
 *
 * How it stays honest:
 *   1. It never re-implements a mapping. Each domain resolves to the SAME
 *      `migration_meta.fn_sync_*` function the wave's `backfill.sql` calls
 *      (with NULL) for the whole table — here it is called with just the ids
 *      that were written. Backfill and shadow-write cannot diverge, because
 *      there is only one implementation.
 *   2. It reads the COMMITTED legacy row. The request payload is never an
 *      input, so a shadow write can never persist something the legacy
 *      database does not actually contain.
 *   3. Flag off = zero target access. The check happens before the client
 *      module is even imported (dynamic `import()`), so nothing connects, no
 *      pool is opened, and no query runs.
 *   4. It never throws and never alters the caller's result. Every failure
 *      (flag off, no target configured, SQL error, timeout) comes back as a
 *      value the caller may log and ignore. A `TARGET_WRITE_FAILED` outcome
 *      is a real, auditable discrepancy — never a silent success.
 *   5. `PERSISTED`-shaped outcomes are only ever derived from what the
 *      database reported (INSERTED/UPDATED/UNCHANGED per row), never from
 *      "we built the row in memory".
 *
 * Principal: the sync functions are migration machinery in `migration_meta`,
 * owned by the migration owner and with EXECUTE revoked from PUBLIC, so this
 * module uses the owner/migration connection (`TARGET_DATABASE_URL`), which
 * is loopback-only and refuses to exist when NODE_ENV=production
 * (client/targetPrismaClient.ts). A least-privileged production principal for
 * shadow-write is an open decision, recorded as such — it is deliberately NOT
 * invented here.
 */

import { isShadowWriteEnabled, type FlagEnvSource } from "../flags/targetMigrationFlags";
import {
  recordShadowSyncAttempt,
  recordShadowSyncFailure,
  recordShadowSyncRowAction,
} from "../observability/shadowSyncMetrics";
import {
  buildReconciliationOutcome,
  type ReconciliationOutcome,
} from "./reconciliationOutcome";

/** The legacy tables that have a connected shadow-write. One entry per `migration_meta.fn_sync_*` function. */
export type ShadowSyncDomain =
  | "User"
  | "AuditLog"
  | "IngestionRun"
  | "ExternalEvent"
  | "Report"
  | "KnowledgeIncident"
  | "IncidentTransition"
  | "KnowledgeEvidence"
  | "HelpRequest"
  | "CriticalPoi";

/**
 * What the database reported for one (legacy row, target table) pair. Mirrors
 * the `action` vocabulary documented in
 * prisma/target-migrations/030_.../backfill.sql's header.
 */
export type ShadowSyncAction =
  | "INSERTED"
  | "UPDATED"
  | "UNCHANGED"
  | "DEFERRED"
  | "ALREADY_DEFERRED"
  | "BLOCKED_RECLASSIFICATION"
  | "BLOCKED_REQUIRES_DECISION"
  | "LEGACY_NOT_FOUND";

export interface ShadowSyncRow {
  sourceTable: string;
  legacyRecordId: string;
  targetTable: string | null;
  action: ShadowSyncAction;
  /** A code (e.g. `D-06`, `REQUESTER_NOT_MIGRATED`), never legacy content. */
  detail: string | null;
}

export type ShadowSyncStatus =
  | "SKIPPED_FLAG_OFF"
  | "SKIPPED_NO_IDS"
  | "COMPLETED"
  | "FAILED";

export interface ShadowSyncResult {
  domain: ShadowSyncDomain;
  status: ShadowSyncStatus;
  requestedIds: number;
  rows: ShadowSyncRow[];
  /** One reconciliation outcome per row, in the Fase 10 vocabulary. Empty when skipped. */
  outcomes: ReconciliationOutcome[];
  /** Enum-like code only — never a raw driver message, which can embed row content. */
  errorCode: string | null;
  durationMs: number;
}

/** `p_ids` is always the first argument; a second `NULL` is passed to the two functions that also accept a parent-id scope. */
const SYNC_CALL_BY_DOMAIN: Record<ShadowSyncDomain, string> = {
  User: "migration_meta.fn_sync_users($1::text[])",
  AuditLog: "migration_meta.fn_sync_audit_logs($1::text[])",
  IngestionRun: "migration_meta.fn_sync_ingestion_runs($1::text[])",
  ExternalEvent: "migration_meta.fn_sync_external_events($1::text[])",
  Report: "migration_meta.fn_sync_reports($1::text[])",
  KnowledgeIncident: "migration_meta.fn_sync_knowledge_incidents($1::text[])",
  IncidentTransition: "migration_meta.fn_sync_incident_transitions($1::text[], NULL)",
  KnowledgeEvidence: "migration_meta.fn_sync_knowledge_evidence($1::text[], NULL)",
  HelpRequest: "migration_meta.fn_sync_help_requests($1::text[])",
  CriticalPoi: "migration_meta.fn_sync_critical_pois($1::text[])",
};

/** Only the AuditLog sync signs rows, and it fails closed without the session key (010's `AUDIT_INTEGRITY_KEY_MISSING`). */
const REQUIRES_AUDIT_INTEGRITY_KEY: ReadonlySet<ShadowSyncDomain> = new Set(["AuditLog"]);

const ACTION_TO_OUTCOME_CODE: Record<ShadowSyncAction, ReconciliationOutcome["code"]> = {
  INSERTED: "CREATED",
  UPDATED: "CREATED",
  UNCHANGED: "ALREADY_EXISTS",
  DEFERRED: "MIGRATION_GAP",
  ALREADY_DEFERRED: "MIGRATION_GAP",
  BLOCKED_RECLASSIFICATION: "REQUIRES_REVIEW",
  BLOCKED_REQUIRES_DECISION: "REQUIRES_REVIEW",
  LEGACY_NOT_FOUND: "LEGACY_MISSING",
};

const DEFAULT_TIMEOUT_MS = 5000;

interface RawSqlClientLike {
  $queryRawUnsafe: <T = unknown>(query: string, ...values: unknown[]) => Promise<T[]>;
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<number>;
}

export interface ShadowSyncDeps {
  env?: FlagEnvSource;
  /** Injectable for tests. Defaults to the owner/migration client (loopback-only, never production). */
  getClient?: () => Promise<RawSqlClientLike>;
  timeoutMs?: number;
  correlationId?: string;
  /** Fires once per call, success or failure — never suppressed. */
  onResult?: (result: ShadowSyncResult) => void;
}

interface SyncFunctionRow {
  source_table: string;
  legacy_record_id: string;
  target_table: string | null;
  action: string;
  detail: string | null;
}

function safeErrorCode(err: unknown): string {
  if (err && typeof err === "object") {
    const candidate = err as { code?: unknown; name?: unknown };
    if (typeof candidate.code === "string" && candidate.code.length > 0) return candidate.code;
    if (typeof candidate.name === "string" && candidate.name.length > 0) return candidate.name;
  }
  return "UNKNOWN_ERROR";
}

function defaultCorrelationId(): string {
  return `shadow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function defaultGetClient(env: FlagEnvSource): Promise<RawSqlClientLike> {
  const mod = await import("../client/targetPrismaClient");
  const client = await mod.getTargetPrismaClient({ env: env as Record<string, string | undefined> });
  return client as unknown as RawSqlClientLike;
}

function isKnownAction(value: string): value is ShadowSyncAction {
  return value in ACTION_TO_OUTCOME_CODE;
}

class ShadowSyncTimeoutError extends Error {
  constructor(ms: number) {
    super(`shadow sync exceeded ${ms}ms`);
    this.name = "SHADOW_SYNC_TIMEOUT";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ShadowSyncTimeoutError(ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Shadow-writes the legacy rows `legacyIds` of `domain` into the target
 * database by calling that wave's own sync function. Call it AFTER the legacy
 * write has committed; it never performs, retries or rolls back the legacy
 * write, and it never throws.
 */
export async function shadowSyncLegacyWrite(
  input: { domain: ShadowSyncDomain; legacyIds: readonly string[] },
  deps: ShadowSyncDeps = {}
): Promise<ShadowSyncResult> {
  const env = deps.env ?? (process.env as FlagEnvSource);
  const startedAt = Date.now();
  const base = { domain: input.domain, requestedIds: input.legacyIds.length };

  const finish = (result: ShadowSyncResult): ShadowSyncResult => {
    deps.onResult?.(result);
    return result;
  };

  // (3) Flag off: no import, no client, no connection, no query.
  if (!isShadowWriteEnabled(env)) {
    return finish({
      ...base,
      status: "SKIPPED_FLAG_OFF",
      rows: [],
      outcomes: [],
      errorCode: null,
      durationMs: Date.now() - startedAt,
    });
  }

  const ids = [...new Set(input.legacyIds.filter((id) => typeof id === "string" && id.length > 0))];
  if (ids.length === 0) {
    return finish({
      ...base,
      status: "SKIPPED_NO_IDS",
      rows: [],
      outcomes: [],
      errorCode: null,
      durationMs: Date.now() - startedAt,
    });
  }

  const correlationId = deps.correlationId ?? defaultCorrelationId();
  recordShadowSyncAttempt({ domain: input.domain, ids: ids.length });

  try {
    const client = deps.getClient ? await deps.getClient() : await defaultGetClient(env);

    const run = async (): Promise<SyncFunctionRow[]> => {
      if (REQUIRES_AUDIT_INTEGRITY_KEY.has(input.domain)) {
        // The key is never stored in SQL: it is put on the session the same
        // way the backfill receives it (PGOPTIONS), and 010's sync function
        // raises AUDIT_INTEGRITY_KEY_MISSING if it is absent. `false` =
        // session-scoped, not transaction-scoped, because this runs outside an
        // explicit transaction.
        const key = env.ARGUS_AUDIT_INTEGRITY_KEY_DEV ?? "";
        const keyId = env.ARGUS_AUDIT_INTEGRITY_KEY_ID ?? "";
        await client.$executeRawUnsafe(
          "SELECT set_config('argus.audit_integrity_key', $1, false), set_config('argus.audit_integrity_key_id', $2, false)",
          key,
          keyId
        );
      }
      return client.$queryRawUnsafe<SyncFunctionRow>(
        `SELECT source_table, legacy_record_id, target_table, action, detail FROM ${SYNC_CALL_BY_DOMAIN[input.domain]}`,
        ids
      );
    };

    const rawRows = await withTimeout(run(), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    const rows: ShadowSyncRow[] = [];
    const outcomes: ReconciliationOutcome[] = [];
    for (const raw of rawRows) {
      const action = isKnownAction(raw.action) ? raw.action : "LEGACY_NOT_FOUND";
      const row: ShadowSyncRow = {
        sourceTable: raw.source_table,
        legacyRecordId: raw.legacy_record_id,
        targetTable: raw.target_table,
        action,
        detail: raw.detail,
      };
      rows.push(row);
      recordShadowSyncRowAction({ domain: input.domain, action, targetTable: raw.target_table });
      outcomes.push(
        buildReconciliationOutcome({
          code: ACTION_TO_OUTCOME_CODE[action],
          domain: input.domain,
          legacyId: row.legacyRecordId,
          idempotencyKey: `${row.sourceTable}:${row.legacyRecordId}:${row.targetTable ?? "-"}`,
          errorCode: row.detail,
          correlationId,
        })
      );
    }

    return finish({
      ...base,
      status: "COMPLETED",
      rows,
      outcomes,
      errorCode: null,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    // (4) The legacy write already succeeded and is untouched. This is
    // reported, counted and returned — never rethrown, never hidden.
    const errorCode = safeErrorCode(err);
    recordShadowSyncFailure({ domain: input.domain, errorCode });
    return finish({
      ...base,
      status: "FAILED",
      rows: [],
      outcomes: ids.map((id) =>
        buildReconciliationOutcome({
          code: "TARGET_WRITE_FAILED",
          domain: input.domain,
          legacyId: id,
          idempotencyKey: `${input.domain}:${id}`,
          errorCode,
          correlationId,
        })
      ),
      errorCode,
      durationMs: Date.now() - startedAt,
    });
  }
}

/**
 * The call site helper: `await shadowWriteAfterLegacyWrite(...)` right after a
 * legacy write commits. Returns the result for tests/observability and
 * resolves even when the target side failed, so a caller can never
 * accidentally propagate a shadow-write problem into its own response.
 */
export async function shadowWriteAfterLegacyWrite(
  domain: ShadowSyncDomain,
  legacyIds: readonly string[],
  deps: ShadowSyncDeps = {}
): Promise<ShadowSyncResult> {
  return shadowSyncLegacyWrite({ domain, legacyIds }, deps);
}

/** True when every row the database reported is a real target row (inserted, updated, or already identical). */
export function isFullyMirrored(result: ShadowSyncResult): boolean {
  return (
    result.status === "COMPLETED" &&
    result.rows.length > 0 &&
    result.rows.every((row) => row.action === "INSERTED" || row.action === "UPDATED" || row.action === "UNCHANGED")
  );
}

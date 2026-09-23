import { describe, expect, it, vi } from "vitest";
import {
  isFullyMirrored,
  shadowSyncLegacyWrite,
  shadowWriteAfterLegacyWrite,
} from "../../src/lib/database-target/shadow-write/legacyShadowSync";

/**
 * tests/database-target/paso5-shadow-sync-contract.test.ts
 *
 * The contract of the ONE connected shadow-write path. Nothing here needs a
 * database: the client is injected, so every branch (flag off, no ids, target
 * unreachable, target slow, target answers) is exercised deterministically.
 *
 * What these cases pin down, in the words of the Paso 5 mandate:
 *   * "OFF debe significar cero acceso al target" — not even a client is asked
 *     for when the flag is off;
 *   * "shadow-write ON no puede afectar respuesta legacy" — every failure is a
 *     returned value, never a throw;
 *   * a target row is only ever reported from what the database returned;
 *   * a BLOCKED_* / DEFERRED row is reported, never smoothed into success.
 */

const ON = { ARGUS_TARGET_DB_SHADOW_WRITE_ENABLED: "true" };

/** The raw-SQL surface the sync uses; the generic signature is what the real client has. */
type FakeClient = {
  $queryRawUnsafe: <T = unknown>(query: string, ...values: unknown[]) => Promise<T[]>;
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<number>;
};

function fakeClient(rows: unknown[], calls: string[] = []) {
  const query = vi.fn(async (sql: string, ...values: unknown[]) => {
    calls.push(sql);
    void values;
    return rows;
  });
  const execute = vi.fn(async (sql: string, ...values: unknown[]) => {
    calls.push(sql);
    void values;
    return 1;
  });
  const client = { $queryRawUnsafe: query, $executeRawUnsafe: execute } as unknown as FakeClient;
  return Object.assign(client, { query, execute });
}

describe("flag off = zero target access", () => {
  it("returns SKIPPED_FLAG_OFF and never asks for a client", async () => {
    const getClient = vi.fn();
    const result = await shadowSyncLegacyWrite(
      { domain: "Report", legacyIds: ["c1"] },
      { env: {}, getClient }
    );
    expect(result.status).toBe("SKIPPED_FLAG_OFF");
    expect(result.rows).toEqual([]);
    expect(result.outcomes).toEqual([]);
    expect(getClient).not.toHaveBeenCalled();
  });

  it("does not treat an unrelated flag as permission", async () => {
    const getClient = vi.fn();
    const result = await shadowSyncLegacyWrite(
      { domain: "Report", legacyIds: ["c1"] },
      { env: { ARGUS_TARGET_DB_READ_ENABLED: "true", ARGUS_TARGET_DB_DUAL_READ_ENABLED: "true" }, getClient }
    );
    expect(result.status).toBe("SKIPPED_FLAG_OFF");
    expect(getClient).not.toHaveBeenCalled();
  });

  it("skips without a client when there is nothing to sync", async () => {
    const getClient = vi.fn();
    const result = await shadowSyncLegacyWrite({ domain: "Report", legacyIds: [] }, { env: ON, getClient });
    expect(result.status).toBe("SKIPPED_NO_IDS");
    expect(getClient).not.toHaveBeenCalled();
  });
});

describe("outcomes come from the database, never from optimism", () => {
  it("maps INSERTED/UPDATED/UNCHANGED to real outcomes and reports them per target table", async () => {
    const client = fakeClient([
      { source_table: "ExternalEvent", legacy_record_id: "e1", target_table: "ingest.source_records", action: "INSERTED", detail: null },
      { source_table: "ExternalEvent", legacy_record_id: "e1", target_table: "evidence.observations", action: "UPDATED", detail: null },
      { source_table: "ExternalEvent", legacy_record_id: "e2", target_table: "ingest.source_records", action: "UNCHANGED", detail: null },
    ]);
    const result = await shadowSyncLegacyWrite(
      { domain: "ExternalEvent", legacyIds: ["e1", "e2"] },
      { env: ON, getClient: async () => client }
    );
    expect(result.status).toBe("COMPLETED");
    expect(result.rows.map((row) => row.action)).toEqual(["INSERTED", "UPDATED", "UNCHANGED"]);
    expect(result.outcomes.map((outcome) => outcome.code)).toEqual(["CREATED", "CREATED", "ALREADY_EXISTS"]);
    expect(isFullyMirrored(result)).toBe(true);
  });

  it("calls the wave's own sync function for the domain, with the ids as a single array parameter", async () => {
    const calls: string[] = [];
    const client = fakeClient([], calls);
    await shadowSyncLegacyWrite({ domain: "HelpRequest", legacyIds: ["h1"] }, { env: ON, getClient: async () => client });
    expect(calls[0]).toContain("migration_meta.fn_sync_help_requests($1::text[])");
    expect(client.query).toHaveBeenCalledWith(expect.any(String), ["h1"]);
  });

  it("deduplicates ids so one legacy row is never sent twice in the same call", async () => {
    const client = fakeClient([]);
    await shadowSyncLegacyWrite(
      { domain: "Report", legacyIds: ["r1", "r1", "r2"] },
      { env: ON, getClient: async () => client }
    );
    expect(client.query).toHaveBeenCalledWith(expect.any(String), ["r1", "r2"]);
  });

  it("reports a blocked reclassification as REQUIRES_REVIEW and is NOT fully mirrored", async () => {
    const client = fakeClient([
      {
        source_table: "KnowledgeIncident",
        legacy_record_id: "k1",
        target_table: "incident.incident_candidates",
        action: "BLOCKED_RECLASSIFICATION",
        detail: "PROMOTION_REQUIRES_INCIDENT_PROMOTION_DECISION",
      },
    ]);
    const result = await shadowSyncLegacyWrite(
      { domain: "KnowledgeIncident", legacyIds: ["k1"] },
      { env: ON, getClient: async () => client }
    );
    expect(result.rows[0].action).toBe("BLOCKED_RECLASSIFICATION");
    expect(result.outcomes[0].code).toBe("REQUIRES_REVIEW");
    expect(result.outcomes[0].errorCode).toBe("PROMOTION_REQUIRES_INCIDENT_PROMOTION_DECISION");
    expect(isFullyMirrored(result)).toBe(false);
  });

  it("reports a deferral as a migration gap, never as success and never as loss", async () => {
    const client = fakeClient([
      {
        source_table: "HelpRequest",
        legacy_record_id: "h9",
        target_table: "migration_meta.legacy_deferred_rows",
        action: "DEFERRED",
        detail: "CLOSED_WITHOUT_AUTHORIZED_CLOSER",
      },
    ]);
    const result = await shadowSyncLegacyWrite(
      { domain: "HelpRequest", legacyIds: ["h9"] },
      { env: ON, getClient: async () => client }
    );
    expect(result.outcomes[0].code).toBe("MIGRATION_GAP");
    expect(result.outcomes[0].retryable).toBe(true);
    expect(isFullyMirrored(result)).toBe(false);
  });

  it("an unknown action from the database is never silently treated as a success", async () => {
    const client = fakeClient([
      { source_table: "Report", legacy_record_id: "r1", target_table: null, action: "SOMETHING_NEW", detail: null },
    ]);
    const result = await shadowSyncLegacyWrite({ domain: "Report", legacyIds: ["r1"] }, { env: ON, getClient: async () => client });
    expect(result.rows[0].action).toBe("LEGACY_NOT_FOUND");
    expect(isFullyMirrored(result)).toBe(false);
  });
});

describe("a target-side failure never reaches the caller", () => {
  it("returns FAILED with a code when the client cannot be constructed", async () => {
    const result = await shadowSyncLegacyWrite(
      { domain: "Report", legacyIds: ["r1"] },
      {
        env: ON,
        getClient: async () => {
          const err = new Error("TARGET_DATABASE_URL is required");
          err.name = "TargetDatabaseClientConfigError";
          throw err;
        },
      }
    );
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("TargetDatabaseClientConfigError");
    expect(result.outcomes.every((outcome) => outcome.code === "TARGET_WRITE_FAILED")).toBe(true);
  });

  it("returns FAILED with the driver's error CODE, never its message (a message can embed row content)", async () => {
    const result = await shadowSyncLegacyWrite(
      { domain: "Report", legacyIds: ["r1"] },
      {
        env: ON,
        getClient: async () =>
          ({
            $queryRawUnsafe: async () => {
              const err = Object.assign(
                new Error('duplicate key value violates unique constraint: "Juan Pérez, Calle Falsa 123"'),
                { code: "23505" }
              );
              throw err;
            },
            $executeRawUnsafe: async () => 0,
          }) as unknown as FakeClient,
      }
    );
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("23505");
    expect(JSON.stringify(result)).not.toContain("Juan Pérez");
  });

  it("times out instead of holding the caller, and still returns a value", async () => {
    const result = await shadowSyncLegacyWrite(
      { domain: "Report", legacyIds: ["r1"] },
      {
        env: ON,
        timeoutMs: 10,
        getClient: async () =>
          ({
            $queryRawUnsafe: () => new Promise(() => undefined),
            $executeRawUnsafe: async () => 0,
          }) as unknown as FakeClient,
      }
    );
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("SHADOW_SYNC_TIMEOUT");
  });

  it("fires onResult exactly once per call, success or failure — an error is never hidden", async () => {
    const onResult = vi.fn();
    await shadowSyncLegacyWrite({ domain: "Report", legacyIds: [] }, { env: ON, onResult });
    await shadowSyncLegacyWrite(
      { domain: "Report", legacyIds: ["r1"] },
      { env: ON, onResult, getClient: async () => { throw new Error("boom"); } }
    );
    expect(onResult).toHaveBeenCalledTimes(2);
    expect(onResult.mock.calls[1][0].status).toBe("FAILED");
  });
});

describe("the audit domain signs with a session key it does not own", () => {
  it("puts the key on the session before the insert and never embeds it in the SQL text", async () => {
    const calls: string[] = [];
    const client = fakeClient([], calls);
    await shadowSyncLegacyWrite(
      { domain: "AuditLog", legacyIds: ["a1"] },
      {
        env: { ...ON, ARGUS_AUDIT_INTEGRITY_KEY_DEV: "per-run-secret", ARGUS_AUDIT_INTEGRITY_KEY_ID: "rehearsal-local-per-run" },
        getClient: async () => client,
      }
    );
    expect(calls[0]).toContain("set_config('argus.audit_integrity_key'");
    expect(calls[0]).not.toContain("per-run-secret");
    expect(client.execute).toHaveBeenCalledWith(expect.any(String), "per-run-secret", "rehearsal-local-per-run");
    expect(calls[1]).toContain("migration_meta.fn_sync_audit_logs($1::text[])");
  });

  it("no other domain touches the audit key", async () => {
    const calls: string[] = [];
    const client = fakeClient([], calls);
    await shadowSyncLegacyWrite(
      { domain: "User", legacyIds: ["u1"] },
      { env: { ...ON, ARGUS_AUDIT_INTEGRITY_KEY_DEV: "per-run-secret" }, getClient: async () => client }
    );
    expect(calls.some((sql) => sql.includes("audit_integrity_key"))).toBe(false);
  });
});

describe("shadowWriteAfterLegacyWrite is the call-site helper", () => {
  it("is the same contract and resolves even when the target is unusable", async () => {
    const result = await shadowWriteAfterLegacyWrite("CriticalPoi", ["p1"], {
      env: ON,
      getClient: async () => { throw new Error("no target here"); },
    });
    expect(result.status).toBe("FAILED");
    expect(result.domain).toBe("CriticalPoi");
  });

  it("is a no-op with the default (production) env, where all four flags are off", async () => {
    const getClient = vi.fn();
    const result = await shadowWriteAfterLegacyWrite("CriticalPoi", ["p1"], { env: {}, getClient });
    expect(result.status).toBe("SKIPPED_FLAG_OFF");
    expect(getClient).not.toHaveBeenCalled();
  });
});

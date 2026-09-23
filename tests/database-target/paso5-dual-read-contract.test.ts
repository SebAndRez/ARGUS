import { describe, expect, it, vi } from "vitest";
import {
  DUAL_READ_DOMAINS,
  dualReadDomain,
  observeDualRead,
} from "../../src/lib/database-target/dual-read/legacyDualRead";

/**
 * tests/database-target/paso5-dual-read-contract.test.ts
 *
 * Dual-read classification and safety, with an injected client so every
 * outcome is produced deterministically:
 *   MATCH · MISSING_TARGET · MISSING_LEGACY · VALUE_MISMATCH · DEFERRED_EXPECTED
 *
 * Also pins the two properties that make dual-read safe to leave on:
 *   * it runs inside a READ ONLY transaction (the database refuses a write,
 *     not a code review);
 *   * it never carries values — a divergence names the field only.
 */

const BOTH_FLAGS = { ARGUS_TARGET_DB_DUAL_READ_ENABLED: "true", ARGUS_TARGET_DB_READ_ENABLED: "true" };

type Row = {
  legacy_id: string;
  expected: string;
  actual: string;
  mismatched_fields: string[] | null;
  detail: string | null;
};

/** The read surface dual-read uses; the generic signature is what the real client has. */
type FakeReadClient = {
  statements: string[];
  $queryRawUnsafe: <T = unknown>(query: string, ...values: unknown[]) => Promise<T[]>;
  $transaction: <T>(fn: (tx: FakeReadClient) => Promise<T>) => Promise<T>;
};

function clientReturning(comparisonRows: Row[], orphanRows: { legacy_id: string; disposition: string }[] = []) {
  const statements: string[] = [];
  let comparisonServed = false;
  const tx = {
    statements,
    $queryRawUnsafe: vi.fn(async (sql: string) => {
      statements.push(sql.trim().split("\n")[0]);
      if (sql.includes("SET TRANSACTION READ ONLY")) return [];
      if (!comparisonServed) {
        comparisonServed = true;
        return comparisonRows;
      }
      return orphanRows;
    }),
  };
  return {
    statements,
    $queryRawUnsafe: tx.$queryRawUnsafe,
    $transaction: async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx),
  } as unknown as FakeReadClient;
}

describe("dual-read is off unless BOTH flags are on", () => {
  it("skips with no flags and never asks for a client", async () => {
    const getClient = vi.fn();
    const report = await dualReadDomain("Report", null, { env: {}, getClient });
    expect(report.status).toBe("SKIPPED_FLAG_OFF");
    expect(getClient).not.toHaveBeenCalled();
  });

  it("skips with the dual-read flag alone — comparing IS reading the target", async () => {
    const getClient = vi.fn();
    const report = await dualReadDomain("Report", null, {
      env: { ARGUS_TARGET_DB_DUAL_READ_ENABLED: "true" },
      getClient,
    });
    expect(report.status).toBe("SKIPPED_FLAG_OFF");
    expect(getClient).not.toHaveBeenCalled();
  });
});

describe("classification", () => {
  const run = (rows: Row[], orphans: { legacy_id: string; disposition: string }[] = []) => {
    const client = clientReturning(rows, orphans);
    return dualReadDomain("Report", null, { env: BOTH_FLAGS, getClient: async () => client });
  };

  it("MATCH when the row is where it belongs and every mapped field agrees", async () => {
    const report = await run([
      { legacy_id: "r1", expected: "MIGRATED", actual: "MIGRATED", mismatched_fields: [], detail: null },
    ]);
    expect(report.counts.MATCH).toBe(1);
    expect(report.divergences).toEqual([]);
  });

  it("MISSING_TARGET when the legacy row should be in the target and is not", async () => {
    const report = await run([
      { legacy_id: "r2", expected: "MIGRATED", actual: "NONE", mismatched_fields: [], detail: null },
    ]);
    expect(report.counts.MISSING_TARGET).toBe(1);
    expect(report.divergences[0].outcome).toBe("MISSING_TARGET");
  });

  it("VALUE_MISMATCH when a mapped field disagrees, naming the field and nothing else", async () => {
    const report = await run([
      {
        legacy_id: "r3",
        expected: "MIGRATED",
        actual: "MIGRATED",
        mismatched_fields: ["observations.claim_text"],
        detail: null,
      },
    ]);
    expect(report.counts.VALUE_MISMATCH).toBe(1);
    expect(report.divergences[0].mismatchedFields).toEqual(["observations.claim_text"]);
    expect(JSON.stringify(report)).not.toMatch(/claim text value|Calle Falsa/);
  });

  it("VALUE_MISMATCH when the disposition itself differs, and says which way", async () => {
    const report = await run([
      { legacy_id: "r4", expected: "MIGRATED", actual: "DEFERRED", mismatched_fields: [], detail: "SOME_REASON" },
    ]);
    expect(report.counts.VALUE_MISMATCH).toBe(1);
    expect(report.divergences[0].mismatchedFields).toContain("disposition:expected_MIGRATED_actual_DEFERRED");
  });

  it("DEFERRED_EXPECTED when the row is deliberately not migrated and the deferral is recorded", async () => {
    const report = await run([
      {
        legacy_id: "r5",
        expected: "DEFERRED",
        actual: "DEFERRED",
        mismatched_fields: [],
        detail: "CLOSED_WITHOUT_AUTHORIZED_CLOSER",
      },
    ]);
    expect(report.counts.DEFERRED_EXPECTED).toBe(1);
    expect(report.counts.MISSING_TARGET).toBe(0);
    // A deferred row is never a divergence and never loss.
    expect(report.divergences).toEqual([]);
  });

  it("a row that should be deferred but has no deferral recorded is a gap, not a deferral", async () => {
    const report = await run([
      { legacy_id: "r6", expected: "DEFERRED", actual: "NONE", mismatched_fields: [], detail: null },
    ]);
    expect(report.counts.DEFERRED_EXPECTED).toBe(0);
    expect(report.counts.MISSING_TARGET).toBe(1);
    expect(report.divergences[0].mismatchedFields).toContain("disposition:no_deferral_recorded");
  });

  it("MISSING_LEGACY for a target row whose legacy row is gone", async () => {
    const report = await run(
      [{ legacy_id: "r7", expected: "MIGRATED", actual: "MIGRATED", mismatched_fields: [], detail: null }],
      [{ legacy_id: "ghost", disposition: "evidence.observations" }]
    );
    expect(report.counts.MATCH).toBe(1);
    expect(report.counts.MISSING_LEGACY).toBe(1);
    expect(report.divergences[0].outcome).toBe("MISSING_LEGACY");
  });

  it("reports the unmapped legacy columns of the domain instead of pretending they match", async () => {
    const report = await run([]);
    expect(report.unmappedLegacyColumns.join(" ")).toContain("status");
  });
});

describe("safety", () => {
  it("every statement runs after SET TRANSACTION READ ONLY", async () => {
    const client = clientReturning([]);
    await dualReadDomain("Report", null, { env: BOTH_FLAGS, getClient: async () => client });
    expect(client.statements[0]).toContain("SET TRANSACTION READ ONLY");
    expect(client.statements.length).toBeGreaterThan(1);
  });

  it("a scoped dual-read (per request) does not run the whole-table orphan scan", async () => {
    const client = clientReturning(
      [{ legacy_id: "r1", expected: "MIGRATED", actual: "MIGRATED", mismatched_fields: [], detail: null }],
      [{ legacy_id: "ghost", disposition: "evidence.observations" }]
    );
    const report = await dualReadDomain("Report", ["r1"], { env: BOTH_FLAGS, getClient: async () => client });
    expect(report.counts.MISSING_LEGACY).toBe(0);
    expect(client.statements.filter((sql) => sql.includes("SELECT t.legacy_record_id"))).toHaveLength(0);
  });

  it("a target read failure is reported, never thrown at the read path", async () => {
    const report = await dualReadDomain("Report", null, {
      env: BOTH_FLAGS,
      getClient: async () => {
        const err = Object.assign(new Error("connection refused"), { code: "P1001" });
        throw err;
      },
    });
    expect(report.status).toBe("FAILED");
    expect(report.errorCode).toBe("P1001");
  });

  it("observeDualRead returns null instead of throwing, and does nothing without ids", async () => {
    expect(await observeDualRead("Report", [])).toBeNull();
    const result = await observeDualRead("Report", ["r1"], {
      env: BOTH_FLAGS,
      getClient: async () => { throw new Error("down"); },
    });
    expect(result?.status).toBe("FAILED");
  });

  it("an unknown domain is a programming error, not a silent empty report", async () => {
    await expect(dualReadDomain("NotADomain", null, { env: BOTH_FLAGS })).rejects.toThrow(/unknown domain/);
  });
});

describe("coverage of the migrated domains", () => {
  it("covers every legacy table the waves 010-060 backfills touch", () => {
    expect(DUAL_READ_DOMAINS).toEqual([
      "User",
      "AuditLog",
      "IngestionRun",
      "KnowledgeIngestionRun",
      "ExternalEvent",
      "Report",
      "KnowledgeEvidence",
      "KnowledgeIncident",
      "IncidentTransition",
      "HelpRequest",
      "CriticalPoi",
      "CriticalPoiStatusEvidence",
      "RiskAssessment",
      "RiskAssessmentRevision",
    ]);
  });
});

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeTargetPrismaClient,
  getTargetPrismaClient,
  resolveTargetDatabaseUrl,
  type TargetPrismaClientLike,
} from "../../src/lib/database-target/client/targetPrismaClient";
import {
  shadowSyncLegacyWrite,
  type ShadowSyncDomain,
  type ShadowSyncResult,
} from "../../src/lib/database-target/shadow-write/legacyShadowSync";
import {
  dualReadAllDomains,
  dualReadDomain,
  type DualReadDomainReport,
} from "../../src/lib/database-target/dual-read/legacyDualRead";
import {
  evaluateCutoverReadiness,
  resolveSourceOfTruth,
  REQUIRED_HUMAN_DECISIONS,
} from "../../src/lib/database-target/cutover/cutoverGuards";

/**
 * tests/database-target/paso5-shadow-dual-read-local.test.ts
 *
 * The Paso 5 simulation, against the real local rehearsal database (the
 * realistic legacy baseline + waves 000-100 already applied):
 *
 *   legacy write -> shadow-write -> dual-read -> reconciliation
 *   -> a cutover attempt that stays blocked -> idempotent re-run -> cleanup
 *
 * Every claim Paso 5 has to demonstrate is a case here, and each one is
 * demonstrated by DOING it, not by asserting an intention:
 *   * a legacy write mirrors into the target through the app's own code path;
 *   * the target never receives duplicates (re-running changes nothing);
 *   * a mapped value change converges; a disposition change is blocked, named,
 *     and visible;
 *   * a tampered target row is DETECTED (VALUE_MISMATCH naming the field);
 *   * a deleted target row is DETECTED (MISSING_TARGET) and a target row whose
 *     legacy row is gone is DETECTED (MISSING_LEGACY);
 *   * a failed target write leaves legacy readable and unchanged;
 *   * dual-read modifies nothing (fingerprints identical, and the transaction
 *     is READ ONLY at the database level);
 *   * deferred rows are never counted as loss;
 *   * cutover cannot be enabled;
 *   * the legacy database is left byte-identical to how it was found.
 *
 * Gated exactly like every other Docker suite in this directory, so
 * `npm run db:target:test` stays database-independent.
 */

const shouldRun =
  process.env.ARGUS_WAVE3_INTEGRATION_TEST === "true" && Boolean(process.env.TARGET_DATABASE_URL);

interface RawClient {
  $queryRawUnsafe: <T = unknown>(query: string, ...values: unknown[]) => Promise<T[]>;
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<number>;
  $transaction: <T>(fn: (tx: RawClient) => Promise<T>) => Promise<T>;
}

function raw(client: TargetPrismaClientLike): RawClient {
  return client as unknown as RawClient;
}

/**
 * A marker is EVIDENCE, and evidence has to survive the test reporter. Vitest's
 * default reporter does not forward a test's console output to the stdout the
 * rehearsal harness captures, so a phase that only grepped stdout could never
 * tell "the suite reached its conclusions" from "the suite exited 0 without
 * reaching them". Every marker is therefore ALSO appended to the file named by
 * ARGUS_PASO5_EVIDENCE_FILE, which is what the ShadowDualRead phase asserts on.
 * With the variable unset (a developer running vitest by hand) the console line
 * is still printed and nothing is written.
 */
const EVIDENCE_FILE = process.env.ARGUS_PASO5_EVIDENCE_FILE;

function recordEvidence(line: string): void {
  console.log(line);
  if (!EVIDENCE_FILE) return;
  mkdirSync(dirname(EVIDENCE_FILE), { recursive: true });
  appendFileSync(EVIDENCE_FILE, line + "\n", "utf8");
}

/** Flags ON for this process only — the rehearsal never turns them on anywhere else. */
const SHADOW_ENV = {
  ...process.env,
  ARGUS_TARGET_DB_SHADOW_WRITE_ENABLED: "true",
  ARGUS_TARGET_DB_DUAL_READ_ENABLED: "true",
  ARGUS_TARGET_DB_READ_ENABLED: "true",
} as Record<string, string | undefined>;

const TEST_SOURCE_ID = "gdacs";
const TEST_EXTERNAL_ID = "paso5-shadow-write-probe-1";

/** Legacy ids this test created and must remove again. */
const created = { externalEventIds: [] as string[], ingestionRunIds: [] as string[] };
/** Legacy values this test changed and must restore. */
const restore: Array<() => Promise<void>> = [];

async function sync(client: TargetPrismaClientLike, domain: ShadowSyncDomain, ids: string[]): Promise<ShadowSyncResult> {
  return shadowSyncLegacyWrite({ domain, legacyIds: ids }, { env: SHADOW_ENV, getClient: async () => raw(client), timeoutMs: 60_000 });
}

async function readOne<T>(client: TargetPrismaClientLike, sql: string, ...values: unknown[]): Promise<T | undefined> {
  const rows = await raw(client).$queryRawUnsafe<T>(sql, ...values);
  return rows[0];
}

/** md5 over every row of the legacy tables this test can reach, so "left as found" is checkable. */
async function legacyFingerprint(client: TargetPrismaClientLike): Promise<string> {
  const row = await readOne<{ fp: string }>(
    client,
    `SELECT md5(string_agg(part, '|' ORDER BY part)) AS fp FROM (
       SELECT 'ExternalEvent:' || coalesce(md5(string_agg(t::text, ',' ORDER BY t.id)), 'empty') AS part FROM "ExternalEvent" t
       UNION ALL SELECT 'IngestionRun:' || coalesce(md5(string_agg(t::text, ',' ORDER BY t.id)), 'empty') FROM "IngestionRun" t
       UNION ALL SELECT 'HelpRequest:' || coalesce(md5(string_agg(t::text, ',' ORDER BY t.id)), 'empty') FROM "HelpRequest" t
       UNION ALL SELECT 'KnowledgeIncident:' || coalesce(md5(string_agg(t::text, ',' ORDER BY t.id)), 'empty') FROM "KnowledgeIncident" t
       UNION ALL SELECT 'Report:' || coalesce(md5(string_agg(t::text, ',' ORDER BY t.id)), 'empty') FROM "Report" t
       UNION ALL SELECT 'CriticalPoi:' || coalesce(md5(string_agg(t::text, ',' ORDER BY t.id)), 'empty') FROM "CriticalPoi" t
       UNION ALL SELECT 'AuditLog:' || coalesce(md5(string_agg(t::text, ',' ORDER BY t.id)), 'empty') FROM "AuditLog" t
       UNION ALL SELECT 'User:' || coalesce(md5(string_agg(t::text, ',' ORDER BY t.id)), 'empty') FROM "User" t
     ) parts`
  );
  return row?.fp ?? "";
}

/** md5 over the target rows this test can reach, to prove dual-read wrote nothing. */
async function targetFingerprint(client: TargetPrismaClientLike): Promise<string> {
  const row = await readOne<{ fp: string }>(
    client,
    `SELECT md5(string_agg(part, '|' ORDER BY part)) AS fp FROM (
       SELECT 'source_records:' || coalesce(md5(string_agg(t::text, ',' ORDER BY t.id)), 'empty') AS part FROM ingest.source_records t
       UNION ALL SELECT 'observations:' || coalesce(md5(string_agg(t::text, ',' ORDER BY t.id)), 'empty') FROM evidence.observations t
       UNION ALL SELECT 'incidents:' || coalesce(md5(string_agg(t::text, ',' ORDER BY t.id)), 'empty') FROM incident.incidents t
       UNION ALL SELECT 'candidates:' || coalesce(md5(string_agg(t::text, ',' ORDER BY t.id)), 'empty') FROM incident.incident_candidates t
       UNION ALL SELECT 'help_requests:' || coalesce(md5(string_agg(t::text, ',' ORDER BY t.id)), 'empty') FROM help.help_requests t
       UNION ALL SELECT 'resources:' || coalesce(md5(string_agg(t::text, ',' ORDER BY t.id)), 'empty') FROM resource.resources t
       UNION ALL SELECT 'deferred:' || coalesce(md5(string_agg(t::text, ',' ORDER BY t.legacy_record_id)), 'empty') FROM migration_meta.legacy_deferred_rows t
     ) parts`
  );
  return row?.fp ?? "";
}

describe.skipIf(!shouldRun)("Paso 5 — shadow-write, dual-read and a blocked cutover, on the real local database", () => {
  let client: TargetPrismaClientLike;
  let baselineLegacyFingerprint = "";

  beforeAll(async () => {
    // Loopback-only by construction: this throws on any managed/remote host.
    resolveTargetDatabaseUrl(process.env as Record<string, string | undefined>);
    client = await getTargetPrismaClient();
    // A previous run's markers must never be able to satisfy this run's gate.
    if (EVIDENCE_FILE) {
      mkdirSync(dirname(EVIDENCE_FILE), { recursive: true });
      writeFileSync(EVIDENCE_FILE, "", "utf8");
    }
    baselineLegacyFingerprint = await legacyFingerprint(client);
    expect(baselineLegacyFingerprint).not.toBe("");
  });

  afterAll(async () => {
    await closeTargetPrismaClient();
  });

  // -------------------------------------------------------------------------
  // 1. A legacy write, through the application's own code path
  // -------------------------------------------------------------------------
  it("a legacy write through the app's own ingestion path mirrors into the target", async () => {
    process.env.ARGUS_TARGET_DB_SHADOW_WRITE_ENABLED = "true";
    // The legacy Prisma client must point at this same disposable container:
    // the legacy `public` tables and the target schemas live in one database.
    // resolveTargetDatabaseUrl above already refused anything non-loopback.
    process.env.DATABASE_URL = process.env.TARGET_DATABASE_URL;
    const { persistExternalEvents } = await import("../../src/lib/ingestion/persistExternalEvents");

    const result = await persistExternalEvents(
      TEST_SOURCE_ID as never,
      [
        {
          id: TEST_EXTERNAL_ID,
          sourceId: TEST_SOURCE_ID as never,
          sourceName: "GDACS",
          externalId: TEST_EXTERNAL_ID,
          title: "Alerta de prueba Paso 5",
          description: 'Contiene un escape JSON "entre comillas" y un salto\nde linea',
          category: "disaster" as never,
          severity: "high" as never,
          confidence: 70,
          latitude: -33.45,
          longitude: -70.66,
          occurredAt: "2026-09-20T12:00:00.000Z",
        } as never,
      ],
      {
        fetchedAt: "2026-09-20T12:05:00.000Z",
        // A raw payload with a JSON escape and a non-ASCII character: the old
        // `raw::text::bytea` content hash aborted the whole backfill on exactly
        // this input.
        raw: { note: 'linea 1\nlinea 2 "citada"', ciudad: "Ñuñoa" },
      }
    );
    expect(result.error).toBeNull();
    expect(result.persistedCount).toBe(1);

    const legacyRow = await readOne<{ id: string }>(
      client,
      `SELECT id FROM "ExternalEvent" WHERE "sourceId" = $1 AND "externalId" = $2`,
      TEST_SOURCE_ID,
      TEST_EXTERNAL_ID
    );
    expect(legacyRow?.id).toBeTruthy();
    created.externalEventIds.push(legacyRow!.id);

    const mirrored = await readOne<{ sr: bigint; obs: bigint; claim: string; hash: string }>(
      client,
      `SELECT (SELECT count(*) FROM ingest.source_records WHERE legacy_source = 'ExternalEvent' AND legacy_record_id = $1) AS sr,
              (SELECT count(*) FROM evidence.observations WHERE legacy_source = 'ExternalEvent' AND legacy_record_id = $1) AS obs,
              (SELECT claim_text FROM evidence.observations WHERE legacy_source = 'ExternalEvent' AND legacy_record_id = $1) AS claim,
              (SELECT content_hash FROM ingest.source_records WHERE legacy_source = 'ExternalEvent' AND legacy_record_id = $1) AS hash`,
      legacyRow!.id
    );
    expect(Number(mirrored?.sr)).toBe(1);
    expect(Number(mirrored?.obs)).toBe(1);
    expect(mirrored?.claim).toBe("Alerta de prueba Paso 5");
    expect(mirrored?.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  // -------------------------------------------------------------------------
  // 2. No duplicates, ever
  // -------------------------------------------------------------------------
  it("re-running the shadow write changes nothing (idempotent, no duplicates)", async () => {
    const id = created.externalEventIds[0];
    const again = await sync(client, "ExternalEvent", [id]);
    expect(again.status).toBe("COMPLETED");
    expect(again.rows.map((row) => row.action).sort()).toEqual(["UNCHANGED", "UNCHANGED"]);

    const counts = await readOne<{ sr: bigint; obs: bigint }>(
      client,
      `SELECT (SELECT count(*) FROM ingest.source_records WHERE legacy_source = 'ExternalEvent' AND legacy_record_id = $1) AS sr,
              (SELECT count(*) FROM evidence.observations WHERE legacy_source = 'ExternalEvent' AND legacy_record_id = $1) AS obs`,
      id
    );
    expect(Number(counts?.sr)).toBe(1);
    expect(Number(counts?.obs)).toBe(1);
  });

  it("a mapped value change converges in place instead of creating a second row", async () => {
    const id = created.externalEventIds[0];
    await raw(client).$executeRawUnsafe(`UPDATE "ExternalEvent" SET title = $2 WHERE id = $1`, id, "Título corregido");
    const result = await sync(client, "ExternalEvent", [id]);
    expect(result.rows.find((row) => row.targetTable === "evidence.observations")?.action).toBe("UPDATED");
    const row = await readOne<{ claim: string; n: bigint }>(
      client,
      `SELECT claim_text AS claim, (SELECT count(*) FROM evidence.observations WHERE legacy_source = 'ExternalEvent' AND legacy_record_id = $1) AS n
       FROM evidence.observations WHERE legacy_source = 'ExternalEvent' AND legacy_record_id = $1`,
      id
    );
    expect(row?.claim).toBe("Título corregido");
    expect(Number(row?.n)).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 3. A discrepancy is detected
  // -------------------------------------------------------------------------
  it("detects a tampered target row as VALUE_MISMATCH, naming the field and no value", async () => {
    const id = created.externalEventIds[0];
    await raw(client).$executeRawUnsafe(
      `UPDATE evidence.observations SET claim_text = 'TAMPERED' WHERE legacy_source = 'ExternalEvent' AND legacy_record_id = $1`,
      id
    );
    const report = await dualReadDomain("ExternalEvent", [id], { env: SHADOW_ENV, getClient: async () => raw(client) });
    expect(report.status).toBe("COMPLETED");
    expect(report.counts.VALUE_MISMATCH).toBe(1);
    expect(report.divergences[0].mismatchedFields).toContain("observations.claim_text");
    expect(JSON.stringify(report)).not.toContain("TAMPERED");

    // And the shadow write repairs it, because legacy is the source of truth.
    const repaired = await sync(client, "ExternalEvent", [id]);
    expect(repaired.rows.some((row) => row.action === "UPDATED")).toBe(true);
    const after = await dualReadDomain("ExternalEvent", [id], { env: SHADOW_ENV, getClient: async () => raw(client) });
    expect(after.counts.MATCH).toBe(1);
  });

  it("detects a deleted target row as MISSING_TARGET, then re-syncs it back", async () => {
    const id = created.externalEventIds[0];
    await raw(client).$executeRawUnsafe(
      `DELETE FROM evidence.observations WHERE legacy_source = 'ExternalEvent' AND legacy_record_id = $1`,
      id
    );
    await raw(client).$executeRawUnsafe(
      `DELETE FROM ingest.source_records WHERE legacy_source = 'ExternalEvent' AND legacy_record_id = $1`,
      id
    );
    const gap = await dualReadDomain("ExternalEvent", [id], { env: SHADOW_ENV, getClient: async () => raw(client) });
    expect(gap.counts.MISSING_TARGET).toBe(1);

    const resynced = await sync(client, "ExternalEvent", [id]);
    expect(resynced.rows.filter((row) => row.action === "INSERTED")).toHaveLength(2);
    const after = await dualReadDomain("ExternalEvent", [id], { env: SHADOW_ENV, getClient: async () => raw(client) });
    expect(after.counts.MATCH).toBe(1);
  });

  it("detects a target row whose legacy row no longer exists as MISSING_LEGACY", async () => {
    await raw(client).$executeRawUnsafe(
      `INSERT INTO evidence.observations (origin_type, claim_text, provenance, legacy_source, legacy_record_id, migration_confidence, migration_review_status)
       VALUES ('PRIMARY'::evidence.observation_origin_enum, 'orphan probe', '{}'::jsonb, 'Report', 'paso5-ghost-legacy-id', 'LOW', 'REQUIRES_REVIEW')`
    );
    const report = await dualReadDomain("Report", null, { env: SHADOW_ENV, getClient: async () => raw(client) });
    expect(report.counts.MISSING_LEGACY).toBeGreaterThanOrEqual(1);
    expect(report.divergences.some((row) => row.legacyId === "paso5-ghost-legacy-id")).toBe(true);

    await raw(client).$executeRawUnsafe(
      `DELETE FROM evidence.observations WHERE legacy_source = 'Report' AND legacy_record_id = 'paso5-ghost-legacy-id'`
    );
    const clean = await dualReadDomain("Report", null, { env: SHADOW_ENV, getClient: async () => raw(client) });
    expect(clean.counts.MISSING_LEGACY).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 4. Deferred is not loss; a disposition change is blocked, not applied
  // -------------------------------------------------------------------------
  it("deferred rows are reported as DEFERRED_EXPECTED, never as MISSING_TARGET", async () => {
    const help = await dualReadDomain("HelpRequest", null, { env: SHADOW_ENV, getClient: async () => raw(client) });
    expect(help.status).toBe("COMPLETED");
    expect(help.counts.MISSING_TARGET).toBe(0);
    expect(help.counts.DEFERRED_EXPECTED).toBeGreaterThan(0);
    expect(help.counts.MATCH + help.counts.DEFERRED_EXPECTED).toBe(help.legacyRows);

    const evidenceRows = await dualReadDomain("CriticalPoiStatusEvidence", null, {
      env: SHADOW_ENV,
      getClient: async () => raw(client),
    });
    expect(evidenceRows.counts.MISSING_TARGET).toBe(0);
    expect(evidenceRows.counts.DEFERRED_EXPECTED).toBe(evidenceRows.legacyRows);
  });

  it("a legacy help request that closes is BLOCKED_REQUIRES_DECISION, not fabricated with an invented closer", async () => {
    const open = await readOne<{ id: string; status: string }>(
      client,
      `SELECT hr.id, hr.status FROM "HelpRequest" hr
       JOIN help.help_requests h ON h.legacy_source = 'HelpRequest' AND h.legacy_record_id = hr.id
       LIMIT 1`
    );
    expect(open?.id).toBeTruthy();
    const { id, status } = open!;
    restore.push(async () => {
      await raw(client).$executeRawUnsafe(`UPDATE "HelpRequest" SET status = $2 WHERE id = $1`, id, status);
      await sync(client, "HelpRequest", [id]);
    });

    await raw(client).$executeRawUnsafe(`UPDATE "HelpRequest" SET status = 'RESOLVED' WHERE id = $1`, id);
    const result = await sync(client, "HelpRequest", [id]);
    expect(result.rows.some((row) => row.action === "BLOCKED_REQUIRES_DECISION")).toBe(true);
    expect(result.rows.find((row) => row.action === "BLOCKED_REQUIRES_DECISION")?.detail).toBe(
      "CLOSED_WITHOUT_AUTHORIZED_CLOSER"
    );

    const target = await readOne<{ status: string }>(
      client,
      `SELECT status::text AS status FROM help.help_requests WHERE legacy_source = 'HelpRequest' AND legacy_record_id = $1`,
      id
    );
    expect(target?.status).not.toBe("RESOLVED");

    const report = await dualReadDomain("HelpRequest", [id], { env: SHADOW_ENV, getClient: async () => raw(client) });
    expect(report.counts.VALUE_MISMATCH).toBe(1);
    expect(report.divergences[0].mismatchedFields.join(" ")).toContain("status");
  });

  it("a candidate is never promoted to an incident by a shadow write", async () => {
    const candidate = await readOne<{ id: string; vs: string }>(
      client,
      `SELECT ki.id, ki."verificationStatus" AS vs FROM "KnowledgeIncident" ki
       JOIN incident.incident_candidates c ON c.legacy_source = 'KnowledgeIncident' AND c.legacy_record_id = ki.id
       LIMIT 1`
    );
    expect(candidate?.id).toBeTruthy();
    const { id, vs } = candidate!;
    restore.push(async () => {
      await raw(client).$executeRawUnsafe(`UPDATE "KnowledgeIncident" SET "verificationStatus" = $2 WHERE id = $1`, id, vs);
      await sync(client, "KnowledgeIncident", [id]);
    });

    const before = await readOne<{ n: bigint }>(client, `SELECT count(*) AS n FROM incident.incidents`);
    await raw(client).$executeRawUnsafe(`UPDATE "KnowledgeIncident" SET "verificationStatus" = 'OFFICIAL' WHERE id = $1`, id);
    const result = await sync(client, "KnowledgeIncident", [id]);
    expect(result.rows.some((row) => row.action === "BLOCKED_RECLASSIFICATION")).toBe(true);
    expect(result.rows.find((row) => row.action === "BLOCKED_RECLASSIFICATION")?.detail).toBe(
      "PROMOTION_REQUIRES_INCIDENT_PROMOTION_DECISION"
    );

    const after = await readOne<{ n: bigint; mine: bigint }>(
      client,
      `SELECT (SELECT count(*) FROM incident.incidents) AS n,
              (SELECT count(*) FROM incident.incidents WHERE legacy_source = 'KnowledgeIncident' AND legacy_record_id = $1) AS mine`,
      id
    );
    expect(Number(after?.n)).toBe(Number(before?.n));
    expect(Number(after?.mine)).toBe(0);

    const report = await dualReadDomain("KnowledgeIncident", [id], { env: SHADOW_ENV, getClient: async () => raw(client) });
    expect(report.counts.VALUE_MISMATCH).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 4b. The two domains whose sync needs something extra: a session key, and
  //     a derived snapshot row.
  // -------------------------------------------------------------------------
  it("an audit event is mirrored and its integrity value verifies with the application's own verifier", async () => {
    const { computeAuditLogIntegrityValue } = await import("../../src/lib/database-target/security");
    const legacyId = "paso5-audit-probe-1";
    await raw(client).$executeRawUnsafe(
      `INSERT INTO "AuditLog" (id, "actorUserId", action, "targetType", "targetId", metadata, "createdAt")
       SELECT $1, u.id, 'PASO5_PROBE', 'HelpRequest', 'paso5-target-id', '{"probe":true}', timestamp '2026-09-21 10:11:12.123'
       FROM "User" u LIMIT 1`,
      legacyId
    );
    restore.push(async () => {
      await raw(client).$executeRawUnsafe(
        `DELETE FROM security.audit_logs WHERE legacy_source = 'AuditLog' AND legacy_record_id = $1`,
        legacyId
      );
      await raw(client).$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE id = $1`, legacyId);
    });

    const result = await sync(client, "AuditLog", [legacyId]);
    expect(result.status).toBe("COMPLETED");
    expect(result.rows[0].action).toBe("INSERTED");

    const row = await readOne<{
      actor_type: string;
      actor_id: string;
      action: string;
      target_table: string;
      target_id: string;
      classification: string;
      context: unknown;
      result: string;
      integrity_value: string;
      occurred_at: Date;
    }>(
      client,
      `SELECT actor_type::text AS actor_type, actor_id::text AS actor_id, action, target_table, target_id::text AS target_id,
              classification::text AS classification, context, result, integrity_value, occurred_at
       FROM security.audit_logs WHERE legacy_source = 'AuditLog' AND legacy_record_id = $1`,
      legacyId
    );
    expect(row?.integrity_value).toMatch(/^[0-9a-f]{64}$/);
    const signable = {
      actorType: row!.actor_type as never,
      actorId: row!.actor_id,
      action: row!.action,
      targetTable: row!.target_table,
      targetId: row!.target_id,
      classification: row!.classification as never,
      context: row!.context as never,
      purpose: null,
      decision: null,
      result: row!.result as never,
      beforeState: null,
      afterState: null,
    };
    // The verifier reads the key from the process env, exactly as the app does.
    expect(computeAuditLogIntegrityValue(signable as never)).toBe(row!.integrity_value);
    // The instant is the legacy wall time read as UTC, never shifted.
    expect(new Date(row!.occurred_at).toISOString()).toBe("2026-09-21T10:11:12.123Z");

    // A different key must not verify — the signature is real, not decorative.
    const savedKey = process.env.ARGUS_AUDIT_INTEGRITY_KEY_DEV;
    process.env.ARGUS_AUDIT_INTEGRITY_KEY_DEV = `${savedKey}-wrong`;
    try {
      expect(computeAuditLogIntegrityValue(signable as never)).not.toBe(row!.integrity_value);
    } finally {
      process.env.ARGUS_AUDIT_INTEGRITY_KEY_DEV = savedKey;
    }
  });

  it("the audit shadow write refuses to sign without the session key instead of inventing one", async () => {
    const legacyId = "paso5-audit-probe-2";
    await raw(client).$executeRawUnsafe(
      `INSERT INTO "AuditLog" (id, "actorUserId", action, "targetType", "targetId", metadata, "createdAt")
       VALUES ($1, NULL, 'PASO5_PROBE_NO_KEY', 'HelpRequest', NULL, NULL, timestamp '2026-09-21 11:00:00')`,
      legacyId
    );
    restore.push(async () => {
      await raw(client).$executeRawUnsafe(
        `DELETE FROM security.audit_logs WHERE legacy_source = 'AuditLog' AND legacy_record_id = $1`,
        legacyId
      );
      await raw(client).$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE id = $1`, legacyId);
    });

    const withoutKey = await shadowSyncLegacyWrite(
      { domain: "AuditLog", legacyIds: [legacyId] },
      {
        env: { ...SHADOW_ENV, ARGUS_AUDIT_INTEGRITY_KEY_DEV: "", ARGUS_AUDIT_INTEGRITY_KEY_ID: "" },
        getClient: async () => raw(client),
      }
    );
    expect(withoutKey.status).toBe("FAILED");
    const written = await readOne<{ n: bigint }>(
      client,
      `SELECT count(*) AS n FROM security.audit_logs WHERE legacy_source = 'AuditLog' AND legacy_record_id = $1`,
      legacyId
    );
    expect(Number(written?.n)).toBe(0);

    // With the key, the same row mirrors normally.
    const withKey = await sync(client, "AuditLog", [legacyId]);
    expect(withKey.rows[0].action).toBe("INSERTED");
  });

  it("a user with no authProvider is mirrored with a NULL, never with an invented provider", async () => {
    // The DDL had `auth_provider NOT NULL DEFAULT 'LOCAL'` while both
    // schema.target.prisma and legacy `User.authProvider` are nullable. A user
    // with a NULL provider would have failed the insert, and the only ways out
    // would have been to fabricate 'LOCAL' or to drop the row. Paso 5 made the
    // column nullable; this is the case that proves it.
    const user = await readOne<{ id: string; provider: string | null }>(
      client,
      `SELECT id, "authProvider" AS provider FROM "User" ORDER BY id LIMIT 1`
    );
    const { id, provider } = user!;
    restore.push(async () => {
      await raw(client).$executeRawUnsafe(`UPDATE "User" SET "authProvider" = $2 WHERE id = $1`, id, provider);
      await sync(client, "User", [id]);
    });

    await raw(client).$executeRawUnsafe(`UPDATE "User" SET "authProvider" = NULL WHERE id = $1`, id);
    const result = await sync(client, "User", [id]);
    expect(result.status).toBe("COMPLETED");
    expect(result.rows.some((row) => row.targetTable === "identity.user_accounts" && row.action === "UPDATED")).toBe(true);
    const account = await readOne<{ provider: string | null }>(
      client,
      `SELECT auth_provider AS provider FROM identity.user_accounts WHERE legacy_source = 'User' AND legacy_record_id = $1`,
      id
    );
    expect(account?.provider).toBeNull();
  });

  it("a legacy trustScore change converges into the identity.reputation_events snapshot", async () => {
    const user = await readOne<{ id: string; score: number }>(
      client,
      `SELECT id, "trustScore" AS score FROM "User" ORDER BY id LIMIT 1`
    );
    expect(user?.id).toBeTruthy();
    const { id, score } = user!;
    restore.push(async () => {
      await raw(client).$executeRawUnsafe(`UPDATE "User" SET "trustScore" = $2 WHERE id = $1`, id, score);
      await sync(client, "User", [id]);
    });

    await raw(client).$executeRawUnsafe(`UPDATE "User" SET "trustScore" = $2 WHERE id = $1`, id, score + 5);
    const result = await sync(client, "User", [id]);
    expect(result.rows.some((row) => row.targetTable === "identity.reputation_events" && row.action === "UPDATED")).toBe(true);
    const delta = await readOne<{ delta: number; n: bigint }>(
      client,
      `SELECT delta, (SELECT count(*) FROM identity.reputation_events WHERE legacy_source = 'User' AND legacy_record_id = $1) AS n
       FROM identity.reputation_events WHERE legacy_source = 'User' AND legacy_record_id = $1`,
      id
    );
    expect(Number(delta?.delta)).toBe(score + 5 - 70);
    expect(Number(delta?.n)).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 5. A failing target write leaves legacy alone
  // -------------------------------------------------------------------------
  it("a failed target write is reported and leaves legacy readable and unchanged", async () => {
    const id = created.externalEventIds[0];
    const beforeFp = await legacyFingerprint(client);
    const failed = await shadowSyncLegacyWrite(
      { domain: "ExternalEvent", legacyIds: [id] },
      {
        env: SHADOW_ENV,
        getClient: async () => {
          throw Object.assign(new Error("target unreachable"), { code: "P1001" });
        },
      }
    );
    expect(failed.status).toBe("FAILED");
    expect(failed.errorCode).toBe("P1001");
    expect(failed.outcomes.every((outcome) => outcome.code === "TARGET_WRITE_FAILED")).toBe(true);

    const legacyStillThere = await readOne<{ id: string }>(client, `SELECT id FROM "ExternalEvent" WHERE id = $1`, id);
    expect(legacyStillThere?.id).toBe(id);
    expect(await legacyFingerprint(client)).toBe(beforeFp);
  });

  // -------------------------------------------------------------------------
  // 6. Dual-read cannot write
  // -------------------------------------------------------------------------
  it("a write inside dual-read's own transaction mode is refused by the database", async () => {
    await expect(
      raw(client).$transaction(async (tx) => {
        await tx.$queryRawUnsafe("SET TRANSACTION READ ONLY");
        await tx.$executeRawUnsafe(
          `INSERT INTO migration_meta.legacy_deferred_rows (source_table, legacy_record_id, wave, reason)
           VALUES ('paso5', 'read-only-probe', 'paso5', 'SHOULD_NEVER_PERSIST')`
        );
      })
    ).rejects.toThrow();

    const leaked = await readOne<{ n: bigint }>(
      client,
      `SELECT count(*) AS n FROM migration_meta.legacy_deferred_rows WHERE legacy_record_id = 'read-only-probe'`
    );
    expect(Number(leaked?.n)).toBe(0);
  });

  it("a full dual-read pass changes neither the legacy nor the target rows", async () => {
    const legacyBefore = await legacyFingerprint(client);
    const targetBefore = await targetFingerprint(client);
    const report = await dualReadAllDomains({ env: SHADOW_ENV, getClient: async () => raw(client) });
    expect(report.domains.every((domain) => domain.status === "COMPLETED")).toBe(true);
    expect(await legacyFingerprint(client)).toBe(legacyBefore);
    expect(await targetFingerprint(client)).toBe(targetBefore);
  });

  // -------------------------------------------------------------------------
  // 7. The reconciliation matrix
  // -------------------------------------------------------------------------
  it("reconciles every domain: zero missing rows, zero orphans, zero value mismatches", async () => {
    // Undo the two deliberate divergences above before measuring parity.
    for (const undo of restore.splice(0, restore.length)) {
      await undo();
    }

    const report = await dualReadAllDomains({ env: SHADOW_ENV, getClient: async () => raw(client) });
    const lines: string[] = [];
    for (const domain of report.domains) {
      lines.push(
        `PASO5_RECONCILIATION|${domain.domain}|rows=${domain.legacyRows}|match=${domain.counts.MATCH}` +
          `|deferred=${domain.counts.DEFERRED_EXPECTED}|missing_target=${domain.counts.MISSING_TARGET}` +
          `|missing_legacy=${domain.counts.MISSING_LEGACY}|mismatch=${domain.counts.VALUE_MISMATCH}`
      );
    }
    // Printed so the rehearsal log carries the matrix as evidence.
    for (const line of lines) recordEvidence(line);
    for (const domain of report.domains) {
      expect(
        domain.counts.MISSING_TARGET,
        `${domain.domain}: ${JSON.stringify(domain.divergences.slice(0, 3))}`
      ).toBe(0);
      expect(domain.counts.MISSING_LEGACY, `${domain.domain} orphans`).toBe(0);
      expect(
        domain.counts.VALUE_MISMATCH,
        `${domain.domain}: ${JSON.stringify(domain.divergences.slice(0, 3))}`
      ).toBe(0);
      expect(domain.counts.MATCH + domain.counts.DEFERRED_EXPECTED).toBe(domain.legacyRows);
    }
    expect(report.reconciled).toBe(true);
    recordEvidence(
      `PASO5_RECONCILIATION_TOTALS|match=${report.totals.MATCH}|deferred=${report.totals.DEFERRED_EXPECTED}` +
        `|missing_target=${report.totals.MISSING_TARGET}|missing_legacy=${report.totals.MISSING_LEGACY}` +
        `|mismatch=${report.totals.VALUE_MISMATCH}`
    );
    recordEvidence("PASO5_DUAL_READ_RECONCILED_PASS");
  });

  it("reports the unmapped legacy columns per domain instead of hiding them behind a MATCH", async () => {
    const report = await dualReadAllDomains({ env: SHADOW_ENV, getClient: async () => raw(client) });
    const withGaps = report.domains.filter((domain) => domain.unmappedLegacyColumns.length > 0);
    expect(withGaps.length).toBeGreaterThan(0);
    for (const domain of withGaps) {
      recordEvidence(`PASO5_UNMAPPED|${domain.domain}|${domain.unmappedLegacyColumns.length}`);
    }
  });

  // -------------------------------------------------------------------------
  // 8. The cutover attempt, with evidence measured from this very database
  // -------------------------------------------------------------------------
  it("a cutover attempt is blocked, and names every gate that is missing", async () => {
    const state = await readOne<{ open_decisions: string[] | null; deferred: bigint; queue: bigint }>(
      client,
      `SELECT (SELECT array_agg(DISTINCT pending_decision) FROM migration_meta.legacy_deferred_rows WHERE pending_decision IS NOT NULL) AS open_decisions,
              (SELECT count(*) FROM migration_meta.legacy_deferred_rows) AS deferred,
              (SELECT count(*) FROM migration_meta.critical_poi_review_queue) AS queue`
    );
    const parity = await dualReadAllDomains({ env: SHADOW_ENV, getClient: async () => raw(client) });

    // Evidence assembled from what is actually true right now — the rehearsal
    // is green and parity holds in this container, and everything else is open.
    const evidence = {
      commitSha: process.env.GITHUB_SHA ?? "local-rehearsal",
      rehearsal: {
        commitSha: process.env.GITHUB_SHA ?? "local-rehearsal",
        success: true,
        requiredPhasesPassed: 1,
        requiredPhasesExpected: 1,
        missingPhases: [],
        finishedAt: new Date().toISOString(),
      },
      dualReadParity: {
        runAt: new Date().toISOString(),
        domainsCompared: parity.domains.length,
        domainsExpected: parity.domains.length,
        missingTarget: parity.totals.MISSING_TARGET,
        missingLegacy: parity.totals.MISSING_LEGACY,
        valueMismatch: parity.totals.VALUE_MISMATCH,
        consecutiveCleanDays: 0, // measured once, in a disposable container
      },
      deferredRows: {
        openPendingDecisions: state?.open_decisions ?? [],
        deferredRowCount: Number(state?.deferred ?? 0),
        reviewQueueRowCount: Number(state?.queue ?? 0),
      },
    };

    const result = evaluateCutoverReadiness(evidence);
    expect(result.allowed).toBe(false);
    const blocked = result.gates.filter((gate) => !gate.passed).map((gate) => gate.gate);
    for (const gate of blocked) recordEvidence(`PASO5_CUTOVER_BLOCKED|${gate}`);
    expect(blocked).toContain("DEFERRED_ROWS_RESOLVED");
    expect(blocked).toContain("DUAL_READ_PARITY"); // parity is clean, but it has not HELD for the required window
    expect(blocked).toContain("BACKUP_RESTORE_TESTED");
    expect(blocked).toContain("AUDIT_KEY_MANAGED");
    expect(blocked).toContain("HUMAN_DECISIONS_RESOLVED");
    expect(blocked).toContain("HUMAN_APPROVAL");
    expect(blocked).toContain("LEGACY_MIGRATION_HISTORY");

    // Even with the env flag forced on, the source of truth stays legacy.
    expect(resolveSourceOfTruth(evidence, { ARGUS_TARGET_DB_CUTOVER_ENABLED: "true" })).toBe("LEGACY");
    expect(REQUIRED_HUMAN_DECISIONS.length).toBeGreaterThan(0);
    recordEvidence("PASO5_CUTOVER_BLOCKED_PASS");
  });

  // -------------------------------------------------------------------------
  // 9. Leave the legacy database exactly as found
  // -------------------------------------------------------------------------
  it("removes everything it created and leaves the legacy database byte-identical", async () => {
    for (const undo of restore.splice(0, restore.length)) {
      await undo();
    }

    for (const id of created.externalEventIds) {
      await raw(client).$executeRawUnsafe(
        `DELETE FROM evidence.observations WHERE legacy_source = 'ExternalEvent' AND legacy_record_id = $1`,
        id
      );
      await raw(client).$executeRawUnsafe(
        `DELETE FROM ingest.source_records WHERE legacy_source = 'ExternalEvent' AND legacy_record_id = $1`,
        id
      );
      await raw(client).$executeRawUnsafe(`DELETE FROM "ExternalEvent" WHERE id = $1`, id);
    }
    // The ingestion run the app recorded alongside the event, if any.
    const runs = await raw(client).$queryRawUnsafe<{ id: string }>(
      `SELECT id FROM "IngestionRun" WHERE "sourceId" = $1 AND metadata::text LIKE '%persistedCount%' AND "fetchedAt" > now() - interval '1 hour'`,
      TEST_SOURCE_ID
    );
    for (const run of runs) {
      await raw(client).$executeRawUnsafe(
        `DELETE FROM ingest.ingestion_runs WHERE legacy_source = 'IngestionRun' AND legacy_record_id = $1`,
        run.id
      );
      await raw(client).$executeRawUnsafe(`DELETE FROM "IngestionRun" WHERE id = $1`, run.id);
    }

    expect(await legacyFingerprint(client)).toBe(baselineLegacyFingerprint);
    recordEvidence("PASO5_LEGACY_UNCHANGED_PASS");

    // And the target is reconciled again after the cleanup.
    const report: DualReadDomainReport = await dualReadDomain("ExternalEvent", null, {
      env: SHADOW_ENV,
      getClient: async () => raw(client),
    });
    expect(report.counts.MISSING_TARGET).toBe(0);
    expect(report.counts.MISSING_LEGACY).toBe(0);
    expect(report.counts.VALUE_MISMATCH).toBe(0);
    recordEvidence("PASO5_SIMULATION_PASS");
  });
});

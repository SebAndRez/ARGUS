import { afterAll, describe, expect, it } from "vitest";
import {
  closeTargetPrismaClient,
  getTargetPrismaClient,
  type TargetPrismaClientLike,
} from "../../src/lib/database-target/client/targetPrismaClient";
import { uuidFromSeed } from "../../src/lib/database-target/repositories/deterministicId";
import { computeAuditLogIntegrityValue } from "../../src/lib/database-target/security";
import { auditPartitionDockerShouldRun, raw, readWave010File } from "./auditPartitionTestHelpers";

/**
 * tests/database-target/legacy-audit-backfill-integrity.test.ts
 *
 * The Wave 010 AuditLog backfill signs every migrated row in SQL. This file
 * checks that from the OTHER side, with the application's own code:
 *   * computeAuditLogIntegrityValue() (src/lib/database-target/security.ts)
 *     recomputes the HMAC of each migrated row from its stored columns and
 *     must reproduce integrity_value exactly — i.e. the SQL canonical
 *     projection is byte-identical to the one the app signs and verifies;
 *   * migration_meta.fn_legacy_uuid() (SQL) and uuidFromSeed()
 *     (deterministicId.ts) derive the same uuid from the same seed, so a
 *     legacy cuid maps to one target id no matter which side computes it.
 * Both need the per-run key the rehearsal generates
 * (ARGUS_AUDIT_INTEGRITY_KEY_DEV); nothing here uses a constant key.
 */

describe("legacy AuditLog backfill integrity — SQL source", () => {
  const backfill = readWave010File("backfill.sql");

  it("signs with a key taken from the session, never a literal, and fails closed without it", () => {
    expect(backfill).toContain("current_setting('argus.audit_integrity_key')");
    expect(backfill).toContain("AUDIT_INTEGRITY_KEY_MISSING");
    expect(backfill).not.toMatch(/PLACEHOLDER_KEY/);
    expect(backfill).not.toMatch(/hmac\([^;]*'[A-Za-z0-9_-]{8,}'\s*,\s*'sha256'\)/);
  });

  it("never casts a legacy id with ::uuid", () => {
    expect(backfill).not.toMatch(/"(actorUserId|targetId)"[^;\n]*::uuid/);
    expect(backfill).toContain("migration_meta.fn_legacy_uuid(");
  });
});

describe.skipIf(!auditPartitionDockerShouldRun || !process.env.ARGUS_AUDIT_INTEGRITY_KEY_DEV)(
  "legacy AuditLog backfill integrity — real PostgreSQL",
  () => {
    let client: TargetPrismaClientLike;

    afterAll(async () => {
      await closeTargetPrismaClient();
    });

    it("the application's verifier reproduces integrity_value for every migrated audit row", async () => {
      client = await getTargetPrismaClient();
      const rows = await raw(client).$queryRawUnsafe<{
        legacy_record_id: string;
        actor_type: string;
        actor_id: string;
        action: string;
        target_table: string;
        target_id: string;
        classification: string;
        context: Record<string, unknown> | null;
        purpose: string | null;
        decision: string | null;
        result: string;
        before_state: Record<string, unknown> | null;
        after_state: Record<string, unknown> | null;
        integrity_value: string;
        integrity_key_id: string | null;
      }>(
        `SELECT legacy_record_id, actor_type::text AS actor_type, actor_id::text AS actor_id, action, target_table,
                target_id::text AS target_id, classification::text AS classification, context, purpose, decision,
                result, before_state, after_state, integrity_value, integrity_key_id
           FROM security.audit_logs WHERE legacy_source = 'AuditLog' ORDER BY legacy_record_id`
      );
      expect(rows.length).toBeGreaterThan(0);
      const mismatched = rows.filter(
        (row) =>
          computeAuditLogIntegrityValue({
            actorType: row.actor_type as never,
            actorId: row.actor_id,
            action: row.action,
            targetTable: row.target_table,
            targetId: row.target_id,
            classification: row.classification as never,
            context: row.context,
            purpose: row.purpose,
            decision: row.decision,
            result: row.result,
            beforeState: row.before_state,
            afterState: row.after_state,
          }) !== row.integrity_value
      );
      expect(mismatched.map((row) => row.legacy_record_id)).toEqual([]);
      expect(new Set(rows.map((row) => row.integrity_key_id))).toEqual(new Set([process.env.ARGUS_AUDIT_INTEGRITY_KEY_ID ?? "rehearsal-local-per-run"]));
    });

    it("a wrong key does NOT verify (the check above is not vacuous)", async () => {
      client = await getTargetPrismaClient();
      const rows = await raw(client).$queryRawUnsafe<{ integrity_value: string }>(
        `SELECT integrity_value FROM security.audit_logs WHERE legacy_source = 'AuditLog' ORDER BY legacy_record_id LIMIT 1`
      );
      const saved = process.env.ARGUS_AUDIT_INTEGRITY_KEY_DEV;
      process.env.ARGUS_AUDIT_INTEGRITY_KEY_DEV = `${saved}-wrong`;
      try {
        const recomputed = computeAuditLogIntegrityValue({
          actorType: "SYSTEM" as never, actorId: "x", action: "x", targetTable: "x", targetId: "x",
          classification: "RESTRICTED" as never, context: null, purpose: null, decision: null, result: "x",
          beforeState: null, afterState: null,
        });
        expect(recomputed).not.toBe(rows[0]!.integrity_value);
      } finally {
        process.env.ARGUS_AUDIT_INTEGRITY_KEY_DEV = saved;
      }
    });

    it("fn_legacy_uuid (SQL) and uuidFromSeed (TS) agree on every seed actually used", async () => {
      client = await getTargetPrismaClient();
      const seeds = await raw(client).$queryRawUnsafe<{ seed: string; derived: string }>(
        `SELECT s.seed, migration_meta.fn_legacy_uuid(s.seed)::text AS derived FROM (
           SELECT DISTINCT 'legacy:User:' || "actorUserId" AS seed FROM "AuditLog" WHERE "actorUserId" IS NOT NULL
           UNION SELECT DISTINCT 'legacy:' || "targetType" || ':' || "targetId" FROM "AuditLog" WHERE "targetId" IS NOT NULL
           UNION SELECT 'legacy:AuditLog:unrecorded-actor'
           UNION SELECT 'ñandú — non-ASCII seed'
         ) s`
      );
      expect(seeds.length).toBeGreaterThan(3);
      expect(seeds.filter((row) => uuidFromSeed(row.seed) !== row.derived)).toEqual([]);
    });
  }
);

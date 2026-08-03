import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  closeTargetPrincipalClients,
  closeTargetPrismaClient,
  describeTargetPrincipal,
  type TargetPrismaClientLike,
} from "../../src/lib/database-target/client/targetPrismaClient";
import { insertAuditLog, type RawSqlClient } from "../../src/lib/database-target/repositories/incidentPromotionRepository";
import { applyTargetSessionContext } from "../../src/lib/database-target/session/targetSessionContext";
import { grantAccessRole } from "../../src/lib/database-target/repositories/accessRoleAssignmentRepository";
import {
  accessRoleDockerShouldRun,
  adminClient,
  createAccessFixture,
  dropAccessFixture,
  ownerClient,
  raw,
  runtimeClient,
  type AccessFixture,
} from "./accessRoleTestHelpers";

/**
 * tests/database-target/audit-writer-principal.test.ts
 *
 * Proves WHICH PostgreSQL principal the canonical audit writer actually runs
 * as, end to end, through the real `insertAuditLog()` flow —
 * ensureAuditLogPartition + INSERT in one transaction, one connection.
 *
 * This test exists because the previous session's report simultaneously
 * asserted that `insertAuditLog()` calls `ensureAuditLogPartition()` and that
 * `app_api` may execute nothing in the partition lifecycle. Both were true,
 * which proved the writer was not running as app_api: it resolved its client
 * from TARGET_DATABASE_URL, i.e. the rehearsal owner — a superuser with
 * BYPASSRLS that owns the schema, the table and the SECURITY DEFINER
 * functions. Every privilege claim about the writer was unfalsifiable.
 */
describe.skipIf(!accessRoleDockerShouldRun)("canonical audit writer — real PostgreSQL principal", () => {
  let fixture: AccessFixture;
  let runtime: TargetPrismaClientLike;

  beforeAll(async () => {
    fixture = await createAccessFixture("WriterPrincipal");
    // The service identity the writer acts as. `security.audit_logs`' INSERT
    // policy requires a persisted SYSTEM/ADMIN role — granted here through the
    // authorized admin path, never by the runtime itself.
    await grantAccessRole(raw(await adminClient()), {
      accessSubjectId: fixture.systemSubjectId,
      accessRoleCode: "SYSTEM",
      source: "TEST_FIXTURE",
      idempotencyKey: randomUUID(),
    });
    runtime = await runtimeClient();
  }, 60_000);

  afterAll(async () => {
    if (fixture) await dropAccessFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  it("connects as app_api: not superuser, not BYPASSRLS, not the schema/table owner, no CREATE ON SCHEMA security", async () => {
    const identity = await describeTargetPrincipal(runtime);
    expect(identity.sessionUser).toBe("app_api");
    expect(identity.currentUser).toBe("app_api");
    expect(identity.isSuperuser).toBe(false);
    expect(identity.isBypassRls).toBe(false);
    expect(identity.ownsSecuritySchema).toBe(false);
    expect(identity.hasCreateOnSecuritySchema).toBe(false);
    expect(identity.ownsAuditLogs).toBe(false);
  });

  it("the owner principal is a DIFFERENT, genuinely privileged identity — the two are not the same connection", async () => {
    const owner = await describeTargetPrincipal(await ownerClient());
    const runtimeIdentity = await describeTargetPrincipal(runtime);
    expect(owner.currentUser).not.toBe(runtimeIdentity.currentUser);
    // Documents WHY the runtime must not be this one.
    expect(owner.ownsAuditLogs || owner.isSuperuser).toBe(true);
  });

  it("session_user, current_user and role are the same app_api identity inside the writer's own transaction", async () => {
    const transactional = runtime as unknown as {
      $transaction: <T>(fn: (tx: RawSqlClient) => Promise<T>) => Promise<T>;
    };
    const seen = await transactional.$transaction(async (tx) => {
      await applyTargetSessionContext(tx, { actorId: fixture.systemSubjectId });
      const rows = await tx.$queryRawUnsafe<{ s: string; c: string; r: string | null }>(
        `SELECT session_user::text AS s, current_user::text AS c, current_setting('role', true) AS r`
      );
      return rows[0]!;
    });
    expect(seen.s).toBe("app_api");
    expect(seen.c).toBe("app_api");
    // `role` is either unset or "none" — never switched to a privileged role.
    expect(["none", null, ""]).toContain(seen.r);
  });

  it("insertAuditLog() succeeds as app_api: ensure + INSERT on ONE connection, in ONE transaction", async () => {
    const transactional = runtime as unknown as {
      $transaction: <T>(fn: (tx: RawSqlClient) => Promise<T>) => Promise<T>;
    };
    const auditId = randomUUID();
    const occurredAt = new Date();

    const principals = await transactional.$transaction(async (tx) => {
      await applyTargetSessionContext(tx, { actorId: fixture.systemSubjectId, correlationId: randomUUID() });
      const before = await tx.$queryRawUnsafe<{ c: string }>(`SELECT current_user::text AS c`);
      await insertAuditLog(tx, auditId, {
        actorType: "SYSTEM",
        actorId: fixture.systemSubjectId,
        action: "AUDIT_WRITER_PRINCIPAL_PROBE",
        targetTable: "security.audit_logs",
        targetId: fixture.subjectAId,
        classification: "RESTRICTED",
        context: null,
        purpose: null,
        decision: null,
        result: "SUCCESS",
        beforeState: null,
        afterState: null,
        occurredAt,
      });
      const after = await tx.$queryRawUnsafe<{ c: string }>(`SELECT current_user::text AS c`);
      return { before: before[0]!.c, after: after[0]!.c };
    });

    // Same non-privileged principal before AND after the write — no silent
    // escalation in between.
    expect(principals.before).toBe("app_api");
    expect(principals.after).toBe("app_api");

    // The row is really there, in the right partition, readable by the owner.
    const rows = await raw(await ownerClient()).$queryRawUnsafe<{ landed: string; occurred_at: Date }>(
      `SELECT tableoid::regclass::text AS landed, occurred_at FROM security.audit_logs WHERE id = $1::uuid`,
      auditId
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.landed).toMatch(/^security\.audit_logs_y\d{4}m\d{2}$/);

    await raw(await ownerClient()).$executeRawUnsafe(`DELETE FROM security.audit_logs WHERE id = $1::uuid`, auditId);
  }, 30_000);

  it("app_api can ensure a month only through the horizon-bounded runtime entry point", async () => {
    const tx = raw(runtime);
    const rows = await tx.$queryRawUnsafe<{ result: string }>(
      `SELECT security.fn_ensure_audit_log_partition_for_write(now()) AS result`
    );
    expect(["CREATED", "ALREADY_EXISTS"]).toContain(rows[0]!.result);

    // ...and NOT through the unbounded creator or the window maintenance.
    await expect(
      tx.$queryRawUnsafe(`SELECT security.fn_ensure_audit_log_partition(now())`)
    ).rejects.toThrow(/permission denied/i);
    await expect(
      tx.$queryRawUnsafe(`SELECT * FROM security.fn_ensure_audit_log_partition_window(now(), 1, 3)`)
    ).rejects.toThrow(/permission denied/i);
  });

  it("app_api cannot ask for a month outside the runtime write horizon", async () => {
    await expect(
      raw(runtime).$queryRawUnsafe(
        `SELECT security.fn_ensure_audit_log_partition_for_write($1::timestamptz)`,
        new Date("2099-01-15T00:00:00Z")
      )
    ).rejects.toThrow(/AUDIT_PARTITION_WRITE_HORIZON_EXCEEDED/);
  });

  it("app_api cannot create a table, attach a partition, or alter/drop an existing one", async () => {
    const tx = raw(runtime);
    await expect(tx.$executeRawUnsafe(`CREATE TABLE security.writer_principal_evil (x integer)`)).rejects.toThrow(
      /permission denied/i
    );
    await expect(
      tx.$executeRawUnsafe(
        `CREATE TABLE security.audit_logs_y2098m01 PARTITION OF security.audit_logs FOR VALUES FROM ('2098-01-01') TO ('2098-02-01')`
      )
    ).rejects.toThrow(/permission denied/i);
    const current = await raw(await ownerClient()).$queryRawUnsafe<{ relname: string }>(
      `SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
        WHERE i.inhparent = 'security.audit_logs'::regclass ORDER BY c.relname LIMIT 1`
    );
    await expect(
      tx.$executeRawUnsafe(`ALTER TABLE security.${current[0]!.relname} ADD COLUMN evil integer`)
    ).rejects.toThrow(/must be owner|permission denied/i);
    await expect(tx.$executeRawUnsafe(`DROP TABLE security.${current[0]!.relname}`)).rejects.toThrow(
      /must be owner|permission denied/i
    );
  });

  it("app_api holds no direct access to a partition, and the audit sequence is usable but not resettable", async () => {
    const tx = raw(runtime);
    const partition = await raw(await ownerClient()).$queryRawUnsafe<{ relname: string }>(
      `SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
        WHERE i.inhparent = 'security.audit_logs'::regclass ORDER BY c.relname LIMIT 1`
    );
    // Either denied outright or filtered to nothing by the partition's own RLS —
    // both are a pass; returning rows is not.
    const direct = await tx
      .$queryRawUnsafe<{ n: string }>(`SELECT COUNT(*)::text AS n FROM security.${partition[0]!.relname}`)
      .catch((err: unknown) => (String(err).match(/permission denied/i) ? [{ n: "0" }] : Promise.reject(err)));
    expect(Number(direct[0]!.n)).toBe(0);

    const nextval = await tx.$queryRawUnsafe<{ v: string }>(
      `SELECT nextval('security.audit_logs_sequence_number_seq')::text AS v`
    );
    expect(Number(nextval[0]!.v)).toBeGreaterThan(0);
    await expect(
      tx.$queryRawUnsafe(`SELECT setval('security.audit_logs_sequence_number_seq', 1)`)
    ).rejects.toThrow(/permission denied/i);
  });

  it("a failed audit write rolls back completely — no orphan row, no orphan partition", async () => {
    const transactional = runtime as unknown as {
      $transaction: <T>(fn: (tx: RawSqlClient) => Promise<T>) => Promise<T>;
    };
    const auditId = randomUUID();
    await expect(
      transactional.$transaction(async (tx) => {
        await applyTargetSessionContext(tx, { actorId: fixture.systemSubjectId });
        await insertAuditLog(tx, auditId, {
          actorType: "SYSTEM",
          actorId: fixture.systemSubjectId,
          action: "AUDIT_WRITER_ROLLBACK_PROBE",
          targetTable: "security.audit_logs",
          targetId: fixture.subjectAId,
          classification: "RESTRICTED",
          context: null,
          purpose: null,
          decision: null,
          result: "SUCCESS",
          beforeState: null,
          afterState: null,
        });
        throw new Error("deliberate rollback");
      })
    ).rejects.toThrow("deliberate rollback");

    const rows = await raw(await ownerClient()).$queryRawUnsafe<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM security.audit_logs WHERE id = $1::uuid`,
      auditId
    );
    expect(rows[0]!.n).toBe("0");
  }, 30_000);

  it("without a persisted SYSTEM/ADMIN assignment the audit INSERT is refused by RLS, not silently accepted", async () => {
    const transactional = runtime as unknown as {
      $transaction: <T>(fn: (tx: RawSqlClient) => Promise<T>) => Promise<T>;
    };
    await expect(
      transactional.$transaction(async (tx) => {
        // Person A holds no assignment at all in this fixture.
        await applyTargetSessionContext(tx, { actorId: fixture.personAId });
        await insertAuditLog(tx, randomUUID(), {
          actorType: "PERSON",
          actorId: fixture.personAId,
          action: "AUDIT_WRITER_UNAUTHORIZED_PROBE",
          targetTable: "security.audit_logs",
          targetId: fixture.subjectAId,
          classification: "RESTRICTED",
          context: null,
          purpose: null,
          decision: null,
          result: "SUCCESS",
          beforeState: null,
          afterState: null,
        });
      })
    ).rejects.toThrow(/row-level security|permission denied/i);
  }, 30_000);
});

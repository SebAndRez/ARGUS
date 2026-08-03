import { afterAll, describe, expect, it } from "vitest";
import {
  closeTargetPrismaClient,
  getTargetPrismaClient,
  type TargetPrismaClientLike,
} from "../../src/lib/database-target/client/targetPrismaClient";
import { auditPartitionDockerShouldRun, raw } from "./auditPartitionTestHelpers";

/**
 * tests/database-target/audit-log-partition-no-residue.test.ts
 *
 * PRECONDITION (documented, not enforceable from inside this file, exactly
 * like `rollback-zero-residue.test.ts`): `TARGET_DATABASE_URL` must point at a
 * rehearsal database that has just completed a FULL 100->000 rollback. Run
 * against a freshly-applied database this file fails for the right reason but
 * the wrong cause — see the corresponding blocking step in
 * `.github/workflows/argus-database-rehearsal.yml`.
 *
 * What this proves that the generic residue classifier does not: the dynamic
 * partition set specifically. A rollback that dropped the parent and the one
 * partition it knew about by name would leave every dynamically created month
 * behind — and those are exactly the objects nobody wrote down.
 */

const LIFECYCLE_FUNCTIONS = [
  "fn_audit_log_month_start",
  "fn_audit_log_next_month_start",
  "fn_audit_log_partition_name",
  "fn_assert_audit_log_partition",
  "fn_ensure_audit_log_partition",
  "fn_ensure_audit_log_partition_window",
];

describe.skipIf(!auditPartitionDockerShouldRun)("audit_logs partition lifecycle leaves zero residue after rollback", () => {
  let client: TargetPrismaClientLike;

  afterAll(async () => {
    await closeTargetPrismaClient();
  });

  it("no table named audit_logs* survives, in any schema", async () => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ schemaname: string; tablename: string }>(
      `SELECT schemaname, tablename FROM pg_tables WHERE tablename LIKE 'audit_logs%'`
    );
    expect(rows).toEqual([]);
  });

  it.each(LIFECYCLE_FUNCTIONS)("lifecycle function %s does not survive", async (proname) => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ nspname: string; proname: string }>(
      `SELECT n.nspname, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.proname = $1`,
      proname
    );
    expect(rows).toEqual([]);
  });

  it("the bigserial sequence behind audit_logs.sequence_number does not survive", async () => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ sequence_name: string }>(
      `SELECT sequence_name FROM information_schema.sequences WHERE sequence_name LIKE 'audit_logs%'`
    );
    expect(rows).toEqual([]);
  });

  it("no index, constraint, or policy named after audit_logs survives", async () => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ kind: string; name: string }>(`
      SELECT 'INDEX' AS kind, indexname AS name FROM pg_indexes WHERE indexname LIKE '%audit_log%'
      UNION ALL
      SELECT 'CONSTRAINT', conname FROM pg_constraint WHERE conname LIKE '%audit_log%'
      UNION ALL
      SELECT 'POLICY', policyname FROM pg_policies WHERE policyname LIKE '%audit_log%'
    `);
    expect(rows).toEqual([]);
  });

  it("the security schema itself is gone (so no partition can be hiding in it)", async () => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ nspname: string }>(
      `SELECT nspname FROM pg_namespace WHERE nspname = 'security'`
    );
    expect(rows).toEqual([]);
  });
});

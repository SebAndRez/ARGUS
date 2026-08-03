import { afterAll, describe, expect, it } from "vitest";
import {
  closeTargetPrismaClient,
  getTargetPrismaClient,
  type TargetPrismaClientLike,
} from "../../src/lib/database-target/client/targetPrismaClient";
import { wave4ShouldRun } from "./wave4TestHelpers";

/**
 * tests/database-target/access-role-zero-residue.test.ts
 *
 * PRECONDITION (documented, not enforceable from inside this file — same as
 * `rollback-zero-residue.test.ts`): `TARGET_DATABASE_URL` must point at a
 * rehearsal database that has just completed a FULL 100->000 rollback. Run
 * against a freshly-applied database it fails for the right reason but the wrong
 * cause; see the corresponding blocking step in
 * `.github/workflows/argus-database-rehearsal.yml`.
 *
 * Uses the OWNER principal deliberately: after a full rollback the runtime roles
 * no longer exist, so a runtime connection could not even authenticate. This
 * file is checking the catalog, not exercising privileges.
 */

const ACCESS_FUNCTIONS = [
  "fn_resolve_access_subject",
  "fn_active_access_roles",
  "fn_has_access_role",
  "fn_has_any_access_role",
  "fn_classification_allowed",
  "fn_register_access_subject",
  "fn_grant_access_role",
  "fn_revoke_access_role",
  "fn_audit_access_role_change",
  "fn_ensure_audit_log_partition_for_write",
];

const ACCESS_ENUMS = ["access_subject_status_enum", "access_role_assignment_status_enum", "access_purpose_enum"];

function raw(client: TargetPrismaClientLike) {
  return client as unknown as { $queryRawUnsafe: <T>(q: string, ...v: unknown[]) => Promise<T[]> };
}

describe.skipIf(!wave4ShouldRun)("access role substrate leaves zero residue after rollback", () => {
  let client: TargetPrismaClientLike;

  afterAll(async () => {
    await closeTargetPrismaClient();
  });

  it("neither access table survives, in any schema", async () => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ schemaname: string; tablename: string }>(
      `SELECT schemaname, tablename FROM pg_tables WHERE tablename IN ('access_subjects','access_role_assignments')`
    );
    expect(rows).toEqual([]);
  });

  it.each(ACCESS_FUNCTIONS)("function %s does not survive", async (proname) => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ proname: string }>(
      `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.proname = $1`,
      proname
    );
    expect(rows).toEqual([]);
  });

  it.each(ACCESS_ENUMS)("enum %s does not survive", async (typname) => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ typname: string }>(
      `SELECT t.typname FROM pg_type t WHERE t.typname = $1`,
      typname
    );
    expect(rows).toEqual([]);
  });

  it("no index, constraint or policy named after the substrate survives", async () => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ kind: string; name: string }>(`
      SELECT 'INDEX' AS kind, indexname AS name FROM pg_indexes WHERE indexname LIKE '%access_subject%' OR indexname LIKE '%access_role_assignment%'
      UNION ALL
      SELECT 'CONSTRAINT', conname FROM pg_constraint WHERE conname LIKE '%access_subject%' OR conname LIKE '%access_role_assignment%'
      UNION ALL
      SELECT 'POLICY', policyname FROM pg_policies WHERE policyname LIKE '%access_subject%' OR policyname LIKE '%access_role_assignment%'
    `);
    expect(rows).toEqual([]);
  });

  it("the access_admin role does not survive", async () => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ rolname: string }>(
      `SELECT rolname FROM pg_roles WHERE rolname = 'access_admin'`
    );
    expect(rows).toEqual([]);
  });

  it("security.access_roles itself is gone, along with the classification_ceiling column it gained", async () => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ table_name: string }>(
      `SELECT table_name FROM information_schema.columns
        WHERE column_name = 'classification_ceiling' AND table_schema = 'security'`
    );
    expect(rows).toEqual([]);
  });

  it("the security schema itself is gone, so nothing can be hiding inside it", async () => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ nspname: string }>(
      `SELECT nspname FROM pg_namespace WHERE nspname = 'security'`
    );
    expect(rows).toEqual([]);
  });
});

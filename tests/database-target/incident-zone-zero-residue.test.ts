import { afterAll, describe, expect, it } from "vitest";
import {
  closeTargetPrismaClient,
  getTargetPrismaClient,
  type TargetPrismaClientLike,
} from "../../src/lib/database-target/client/targetPrismaClient";
import { wave4ShouldRun } from "./wave4TestHelpers";

/**
 * tests/database-target/incident-zone-zero-residue.test.ts
 *
 * PRECONDITION (documented, not enforceable from inside this file — same as
 * `access-role-zero-residue.test.ts`): `TARGET_DATABASE_URL` must point at a
 * rehearsal database that has just completed a FULL 100->000 rollback. Run
 * against a freshly-applied database it fails for the right reason but the
 * wrong cause; see the corresponding blocking step in
 * `.github/workflows/argus-database-rehearsal.yml`.
 *
 * Uses the OWNER principal deliberately: after a full rollback the runtime
 * roles no longer exist, so a runtime connection could not even authenticate.
 * This file is checking the catalog, not exercising privileges.
 */

const R31_TABLES = [
  "incident_operational_zone_assignments",
  "operational_zone_jurisdiction_assignments",
  "command_role_jurisdiction_scopes",
];

const R31_FUNCTIONS = [
  "fn_incident_effective_jurisdictions",
  "fn_incident_command_jurisdictions",
  "fn_resolve_zones_for_geography",
  "fn_resolve_incident_operational_zones",
  "fn_resolve_candidate_operational_zones",
  "fn_incident_resolution_geography",
  "fn_candidate_resolution_geography",
  "fn_incident_zone_idempotency_key",
  "fn_audit_incident_zone_change",
  "fn_assign_incident_operational_zone",
  "fn_revoke_incident_operational_zone_assignment",
  "fn_supersede_incident_operational_zone_assignment",
  "fn_persist_incident_zone_resolution",
  "fn_inherit_candidate_zone_assignments",
];

const R31_ENUMS = [
  "incident_zone_assignment_kind_enum",
  "incident_zone_resolution_method_enum",
  "incident_zone_assignment_status_enum",
  "zone_assignment_review_status_enum",
  "zone_jurisdiction_relation_kind_enum",
  "zone_jurisdiction_assignment_status_enum",
  "spatial_resolution_outcome_enum",
  "command_role_scope_status_enum",
];

function raw(client: TargetPrismaClientLike) {
  return client as unknown as { $queryRawUnsafe: <T>(q: string, ...v: unknown[]) => Promise<T[]> };
}

describe.skipIf(!wave4ShouldRun)("R31 substrate leaves zero residue after rollback", () => {
  let client: TargetPrismaClientLike;

  afterAll(async () => {
    await closeTargetPrismaClient();
  });

  it.each(R31_TABLES)("table %s does not survive, in any schema", async (tablename) => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE tablename = $1`,
      tablename
    );
    expect(rows).toEqual([]);
  });

  it.each(R31_FUNCTIONS)("function %s does not survive", async (proname) => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ proname: string }>(
      `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.proname = $1`,
      proname
    );
    expect(rows).toEqual([]);
  });

  it.each(R31_ENUMS)("enum %s does not survive", async (typname) => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ typname: string }>(
      `SELECT t.typname FROM pg_type t WHERE t.typname = $1`,
      typname
    );
    expect(rows).toEqual([]);
  });

  it("no R31 index, constraint or policy survives", async () => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ kind: string; name: string }>(`
      SELECT 'INDEX' AS kind, indexname AS name FROM pg_indexes
        WHERE indexname LIKE 'ix_ioza_%' OR indexname LIKE 'uq_ioza_%'
           OR indexname LIKE 'ix_ozja_%' OR indexname LIKE 'uq_ozja_%'
           OR indexname LIKE 'ix_crjs_%' OR indexname LIKE 'uq_crjs_%'
      UNION ALL
      SELECT 'CONSTRAINT', conname FROM pg_constraint
        WHERE conname LIKE 'ck_ioza_%' OR conname LIKE 'fk_ioza_%'
           OR conname LIKE 'ck_ozja_%' OR conname LIKE 'fk_ozja_%'
           OR conname LIKE 'ck_crjs_%' OR conname LIKE 'fk_crjs_%'
      UNION ALL
      SELECT 'POLICY', policyname FROM pg_policies
        WHERE policyname IN ('ioza_command_or_governance','ozja_governance','crjs_own_or_governance')
    `);
    expect(rows).toEqual([]);
  });

  it("the command_scope_authorized column added to governance.automation_rules does not survive", async () => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ table_name: string }>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'command_scope_authorized'`
    );
    expect(rows).toEqual([]);
  });

  it("the geo and command schemas themselves are gone, so nothing can be hiding inside them", async () => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ nspname: string }>(
      `SELECT nspname FROM pg_namespace WHERE nspname IN ('geo','command')`
    );
    expect(rows).toEqual([]);
  });

  it("security.fn_has_command_role is gone too — Wave 010's rollback finishes what Wave 080 restored", async () => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ proname: string }>(
      `SELECT p.proname FROM pg_proc p WHERE p.proname = 'fn_has_command_role'`
    );
    expect(rows).toEqual([]);
  });
});

import { afterAll, describe, expect, it } from "vitest";
import { closeTargetPrismaClient, getTargetPrismaClient, type TargetPrismaClientLike } from "../../src/lib/database-target/client/targetPrismaClient";
import { wave4ShouldRun } from "./wave4TestHelpers";

/**
 * tests/database-target/rollback-zero-residue.test.ts
 *
 * PRECONDITION (documented, not enforced by this file): `TARGET_DATABASE_URL`
 * must point at a rehearsal database that has just completed a FULL
 * 100->000 rollback (i.e. run right after `Invoke-ArgusRollbackCycle`,
 * before any reapplication) — see the corresponding step in
 * `.github/workflows/argus-database-rehearsal.yml` and
 * `Invoke-ArgusFullRehearsal.ps1`'s rollback phase. Running this against a
 * mid-install or freshly-applied database will fail for the wrong reason
 * (schemas legitimately still present) — that is intentional: this test
 * exists to prove rollback-completeness, not to be a generic health check.
 *
 * Confirmed by a real apply-then-rollback cycle against local Postgres
 * (`scripts/migration-rehearsal/sql/catalog-object-inventory.sql` diffed
 * before/after via `classify-catalog-residue.mjs`) that, before this
 * corrective session's fixes, `migration_meta` (schema + 3 tables) survived
 * a full rollback — this test pins that specific regression AND generalizes
 * to every other ARGUS target schema.
 */

const ARGUS_TARGET_SCHEMAS = [
  "ingest",
  "evidence",
  "incident",
  "risk",
  "command",
  "governance",
  "identity",
  "institution",
  "geo",
  "security",
  "alert",
  "comms",
  "help",
  "mission",
  "resource",
  "ice",
  "proj",
  "migration_meta",
];

function raw(client: TargetPrismaClientLike) {
  return client as unknown as { $queryRawUnsafe: <T>(q: string, ...v: unknown[]) => Promise<T[]> };
}

describe.skipIf(!wave4ShouldRun)("rollback zero residue — post 100->000 rollback state", () => {
  let client: TargetPrismaClientLike;

  afterAll(async () => {
    await closeTargetPrismaClient();
  });

  it("migration_meta schema does not exist (the exact regression this session fixed)", async () => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ schema_name: string }>(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'migration_meta'`
    );
    expect(rows).toHaveLength(0);
  });

  it("none of migration_meta's 3 tables exist", async () => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'migration_meta'
         AND table_name IN ('legacy_status_mapping', 'migration_checkpoints', 'critical_poi_review_queue')`
    );
    expect(rows).toEqual([]);
  });

  it.each(ARGUS_TARGET_SCHEMAS)("ARGUS target schema '%s' does not exist after full rollback", async (schemaName) => {
    client = await getTargetPrismaClient();
    const rows = await raw(client).$queryRawUnsafe<{ schema_name: string }>(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
      schemaName
    );
    expect(rows, `schema '${schemaName}' still exists after a full rollback — residue`).toHaveLength(0);
  });

  it("ARGUS_TARGET_RESIDUAL_OBJECT_COUNT is 0 (no non-extension, non-public-schema, non-pg_toast object survives)", async () => {
    client = await getTargetPrismaClient();
    // tiger/tiger_data/topology are PostGIS extension-bundled schemas
    // (postgis_tiger_geocoder/postgis_topology) — never ARGUS objects,
    // never removed by rollback, excluded per the mandate's own rule
    // ("Objetos de PostGIS/extensiones no cuentan como residuo ARGUS").
    const EXCLUDED_SCHEMAS = "'pg_catalog','information_schema','pg_toast','public','tiger','tiger_data','topology'";
    const rows = await raw(client).$queryRawUnsafe<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM (
        SELECT 1 FROM pg_tables WHERE schemaname NOT IN (${EXCLUDED_SCHEMAS})
        UNION ALL
        SELECT 1 FROM pg_views WHERE schemaname NOT IN (${EXCLUDED_SCHEMAS})
        UNION ALL
        SELECT 1 FROM pg_matviews WHERE schemaname NOT IN (${EXCLUDED_SCHEMAS})
        UNION ALL
        SELECT 1 FROM pg_namespace WHERE nspname NOT IN (${EXCLUDED_SCHEMAS})
      ) residual
    `);
    expect(rows[0]?.count).toBe("0");
  });
});

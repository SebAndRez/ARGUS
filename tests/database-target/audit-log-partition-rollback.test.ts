import { describe, expect, it } from "vitest";
import { readWave010File, readRepoFile } from "./auditPartitionTestHelpers";

/**
 * tests/database-target/audit-log-partition-rollback.test.ts
 *
 * The partition set is now DYNAMIC: partitions are created on demand for
 * whatever months the data and the operational window require. A rollback
 * that only knows how to drop `security.audit_logs_y2026m07` is therefore
 * incomplete by construction — it would leave orphan partitions and orphan
 * functions behind and break ARGUS_TARGET_RESIDUAL_OBJECT_COUNT=0.
 *
 * This file pins the ROLLBACK CONTRACT statically.
 * `audit-log-partition-no-residue.test.ts` proves the effect against a real
 * post-rollback database.
 */

describe("wave 010 rollback — audit_logs partition lifecycle", () => {
  const rollback = readWave010File("rollback.sql");

  it("discovers partitions from pg_inherits instead of hardcoding a name", () => {
    expect(rollback).toContain("FROM pg_inherits i");
    expect(rollback).toContain("WHERE i.inhparent = 'security.audit_logs'::regclass");
    expect(rollback).toContain("EXECUTE 'DROP TABLE IF EXISTS ' || v_child;");
    // The old hardcoded single-partition drop must be gone.
    expect(rollback).not.toContain("DROP TABLE IF EXISTS security.audit_logs_y2026m07;");
  });

  it("does not discover partitions by name pattern (a LIKE sweep would catch unrelated tables)", () => {
    expect(rollback).not.toMatch(/relname\s+LIKE\s+'audit_logs/i);
    expect(rollback).not.toMatch(/tablename\s+LIKE\s+'audit_logs/i);
  });

  it("quotes each discovered child identifier instead of interpolating a raw name", () => {
    expect(rollback).toContain("quote_ident(n.nspname) || '.' || quote_ident(c.relname)");
  });

  it("is a no-op when security.audit_logs does not exist (rollback of a partial install)", () => {
    expect(rollback).toContain("IF to_regclass('security.audit_logs') IS NULL THEN");
    expect(rollback).toContain("RETURN;");
  });

  it("drops the parent AFTER its partitions", () => {
    const loopIndex = rollback.indexOf("EXECUTE 'DROP TABLE IF EXISTS ' || v_child;");
    const parentIndex = rollback.indexOf("DROP TABLE IF EXISTS security.audit_logs;");
    expect(loopIndex).toBeGreaterThan(-1);
    expect(parentIndex).toBeGreaterThan(loopIndex);
  });

  it("drops all six lifecycle functions with their exact signatures", () => {
    for (const signature of [
      "security.fn_ensure_audit_log_partition_window(timestamptz, integer, integer)",
      "security.fn_ensure_audit_log_partition(timestamptz)",
      "security.fn_assert_audit_log_partition(regclass, timestamptz, timestamptz)",
      "security.fn_audit_log_partition_name(timestamptz)",
      "security.fn_audit_log_next_month_start(timestamptz)",
      "security.fn_audit_log_month_start(timestamptz)",
    ]) {
      expect(rollback).toContain(`DROP FUNCTION IF EXISTS ${signature};`);
    }
  });

  it("revokes the sequence grant this session added", () => {
    expect(rollback).toContain(
      "REVOKE USAGE ON SEQUENCE security.audit_logs_sequence_number_seq FROM app_api, ingest_worker, jobs_worker;"
    );
  });

  it("every function the migration creates is dropped by the rollback (no drift between the two files)", () => {
    const migration = readWave010File("migration.sql");
    const created = new Set(
      Array.from(migration.matchAll(/CREATE OR REPLACE FUNCTION (security\.fn_[a-z_]*audit_log[a-z_]*)\(/g)).map(
        (match) => match[1]!
      )
    );
    // 7 since the horizon-bounded runtime entry point
    // (fn_ensure_audit_log_partition_for_write) was added so the canonical audit
    // writer can ensure its month as app_api instead of as the schema owner.
    expect(created.size).toBe(7);
    for (const fn of created) {
      expect(rollback, `${fn} is created by migration.sql but never dropped by rollback.sql`).toContain(
        `DROP FUNCTION IF EXISTS ${fn}(`
      );
    }
  });

  it("does not use DROP SCHEMA ... CASCADE, drop legacy tables, or drop extensions", () => {
    // Comments in this file legitimately DISCUSS why extensions are not
    // dropped, so the check runs against executable statements only.
    const statements = rollback.replace(/--.*$/gm, "");
    expect(statements).not.toMatch(/DROP SCHEMA[^;]*CASCADE/i);
    expect(statements).not.toMatch(/DROP TABLE[^;]*"AuditLog"/);
    expect(statements).not.toMatch(/DROP EXTENSION/i);
  });

  it("the rehearsal asserts the audit-partition rollback explicitly, by name", () => {
    const rehearsal = readRepoFile("scripts", "migration-rehearsal", "Invoke-ArgusFullRehearsal.ps1");
    expect(rehearsal).toContain("AUDIT_PARTITION_ROLLBACK_PASS");
    expect(rehearsal).toContain("AUDIT_PARTITION_ROLLBACK_FAIL");
    expect(rehearsal).toContain("ARGUS_TARGET_RESIDUAL_OBJECT_COUNT=");
  });
});

import { describe, expect, it } from "vitest";
import { WAVE_080, readRepoFile } from "./incidentZoneTestHelpers";

/**
 * tests/database-target/incident-zone-rollback.test.ts
 *
 * The rollback CONTRACT for the R31 substrate, asserted statically so it runs
 * on every commit. `incident-zone-zero-residue.test.ts` proves the EFFECT
 * against a real post-rollback database.
 *
 * Ordering is the whole difficulty. The relation sits between two waves:
 * `geo.operational_zones` is created by Wave 080, `incident.incidents` and
 * `command.command_roles` by Wave 040 — and rollback runs 100 -> 000, so Wave
 * 080's rollback happens BEFORE Wave 040's. If the relation were not dropped
 * here, Wave 040 would then fail to drop `incident.incidents` at all.
 */
describe("wave 080 rollback — R31 substrate", () => {
  const rollback = readRepoFile(...WAVE_080, "rollback.sql");
  const migration = readRepoFile(...WAVE_080, "migration.sql");

  it("drops the R31 relation BEFORE geo.operational_zones, which it references", () => {
    const relation = rollback.indexOf("DROP TABLE IF EXISTS geo.incident_operational_zone_assignments;");
    const zones = rollback.indexOf("DROP TABLE IF EXISTS geo.operational_zones;");
    expect(relation).toBeGreaterThan(-1);
    expect(zones).toBeGreaterThan(relation);
  });

  it("drops the zone/jurisdiction relation and the command scope table too", () => {
    expect(rollback).toContain("DROP TABLE IF EXISTS geo.operational_zone_jurisdiction_assignments;");
    expect(rollback).toContain("DROP TABLE IF EXISTS command.command_role_jurisdiction_scopes;");
  });

  it("drops the command scope table in THIS wave, before Wave 040 drops command.command_roles", () => {
    const scope = rollback.indexOf("DROP TABLE IF EXISTS command.command_role_jurisdiction_scopes;");
    expect(scope).toBeGreaterThan(-1);
    const wave040 = readRepoFile("prisma", "target-migrations", "040_incident", "rollback.sql");
    expect(wave040).toContain("DROP TABLE IF EXISTS command.command_roles;");
    // Wave 040 must not have to know about the scope table at all.
    expect(wave040).not.toContain("command_role_jurisdiction_scopes");
  });

  it("drops every function it created — all 14, by exact signature", () => {
    const functions = [
      "geo.fn_inherit_candidate_zone_assignments",
      "geo.fn_persist_incident_zone_resolution",
      "geo.fn_supersede_incident_operational_zone_assignment",
      "geo.fn_revoke_incident_operational_zone_assignment",
      "geo.fn_assign_incident_operational_zone",
      "geo.fn_audit_incident_zone_change",
      "geo.fn_resolve_candidate_operational_zones",
      "geo.fn_resolve_incident_operational_zones",
      "geo.fn_resolve_zones_for_geography",
      "geo.fn_candidate_resolution_geography",
      "geo.fn_incident_resolution_geography",
      "geo.fn_incident_zone_idempotency_key",
      "geo.fn_incident_command_jurisdictions",
      "geo.fn_incident_effective_jurisdictions",
    ];
    for (const fn of functions) {
      expect(rollback, `rollback.sql must drop ${fn}`).toContain(`DROP FUNCTION IF EXISTS ${fn}(`);
      expect(migration, `migration.sql must create ${fn}`).toContain(`CREATE OR REPLACE FUNCTION ${fn}(`);
    }
  });

  it("drops the functions BEFORE the tables they depend on", () => {
    const lastFunction = rollback.lastIndexOf("DROP FUNCTION IF EXISTS geo.fn_incident_effective_jurisdictions");
    const firstTable = rollback.indexOf("DROP TABLE IF EXISTS command.command_role_jurisdiction_scopes;");
    expect(lastFunction).toBeGreaterThan(-1);
    expect(firstTable).toBeGreaterThan(lastFunction);
  });

  it("drops all 8 enums it created", () => {
    const enums = [
      "command.command_role_scope_status_enum",
      "geo.spatial_resolution_outcome_enum",
      "geo.zone_jurisdiction_assignment_status_enum",
      "geo.zone_jurisdiction_relation_kind_enum",
      "geo.zone_assignment_review_status_enum",
      "geo.incident_zone_assignment_status_enum",
      "geo.incident_zone_resolution_method_enum",
      "geo.incident_zone_assignment_kind_enum",
    ];
    for (const e of enums) {
      expect(rollback, `rollback.sql must drop ${e}`).toContain(`DROP TYPE IF EXISTS ${e};`);
    }
  });

  it("drops the enums AFTER the tables that use them", () => {
    const table = rollback.indexOf("DROP TABLE IF EXISTS geo.incident_operational_zone_assignments;");
    const enumDrop = rollback.indexOf("DROP TYPE IF EXISTS geo.incident_zone_assignment_kind_enum;");
    expect(enumDrop).toBeGreaterThan(table);
  });

  it("removes the command_scope_authorized column it added to governance.automation_rules", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS command_scope_authorized boolean NOT NULL DEFAULT false");
    expect(rollback).toContain("ALTER TABLE governance.automation_rules DROP COLUMN IF EXISTS command_scope_authorized;");
  });

  it("revokes the schema USAGE it granted to audit_reader and access_admin", () => {
    expect(migration).toContain("GRANT USAGE ON SCHEMA geo TO audit_reader, access_admin;");
    expect(rollback).toContain("REVOKE USAGE ON SCHEMA geo FROM audit_reader, access_admin;");
    expect(migration).toContain("GRANT USAGE ON SCHEMA evidence TO access_admin;");
    expect(rollback).toContain("REVOKE USAGE ON SCHEMA evidence FROM access_admin;");
  });

  it("RESTORES security.fn_has_command_role to its Wave 040 body rather than dropping it", () => {
    // Waves 040-070 still have live policies calling it at this point in the
    // rollback, so dropping it here would break every one of them until Wave
    // 010 finally removes it.
    expect(rollback).toContain("CREATE OR REPLACE FUNCTION security.fn_has_command_role");
    const restored = rollback.slice(
      rollback.indexOf("CREATE OR REPLACE FUNCTION security.fn_has_command_role"),
      rollback.indexOf("DROP FUNCTION IF EXISTS geo.fn_inherit_candidate_zone_assignments")
    );
    // The restored body must not reference anything this wave is about to drop.
    expect(restored).not.toContain("fn_incident_command_jurisdictions");
    expect(restored).not.toContain("command_role_jurisdiction_scopes");
    expect(restored).toContain("command.command_roles");
    expect(restored).toContain("institution.institutional_memberships");
  });

  it("uses no DROP SCHEMA CASCADE anywhere", () => {
    expect(rollback).not.toMatch(/DROP SCHEMA[^;]*CASCADE/i);
  });

  it("the R31 section is ordered FIRST in the rollback, before the pre-existing wave-080 drops", () => {
    const r31 = rollback.indexOf("DROP TABLE IF EXISTS geo.incident_operational_zone_assignments;");
    const deferredFk = rollback.indexOf("ALTER TABLE mission.mission_meeting_point_assignments DROP CONSTRAINT");
    expect(r31).toBeLessThan(deferredFk);
  });
});

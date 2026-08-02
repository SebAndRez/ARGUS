import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * tests/database-target/command-schema-reconciliation.test.ts
 *
 * Pins the `command.*` reconciliation performed in the corrective session
 * against `prisma/schema.target.prisma`. Before it, wave 040 carried
 * `command.*` as "OUT OF SCOPE" and was missing whole columns
 * (from_actor_type, from_actor_id, to_actor_type, decided_by_actor_type,
 * overridden_by_actor_type, generated_by_rule_id), both UNIQUE
 * constraints, and used a wrong enum value set.
 *
 * Vocabulary note the mandate calls out explicitly: a *command role*
 * (`command.command_roles`, ad hoc per incident) is NOT an *institutional
 * membership* (`institution.institutional_memberships`, org-scoped) and is
 * NOT a *PostgreSQL role* (app_api etc.). All three appear in this schema
 * and are kept distinct.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const WAVE_040 = join(REPO_ROOT, "prisma", "target-migrations", "040_incident", "migration.sql");
const SCHEMA = join(REPO_ROOT, "prisma", "schema.target.prisma");

function tableBlock(sql: string, table: string): string {
  const start = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`);
  expect(start, `${table} not found`).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf(");", start));
}

describe("command.* reconciled against schema.target.prisma", () => {
  if (!existsSync(WAVE_040)) {
    it.skip("040_incident/migration.sql missing — skipping", () => {});
    return;
  }
  const sql = readFileSync(WAVE_040, "utf8");
  const schema = readFileSync(SCHEMA, "utf8");

  it("recommendation_status_enum is (ACTIVE, OVERRIDDEN) — not the invented (PENDING, ACTED_ON)", () => {
    expect(sql).toMatch(/command\.recommendation_status_enum AS ENUM \('ACTIVE','OVERRIDDEN'\)/);
    expect(sql).not.toContain("recommendation_status_enum AS ENUM ('PENDING','ACTED_ON')");
    expect(schema).toMatch(/enum RecommendationStatus \{\s*ACTIVE\s*OVERRIDDEN/);
  });

  describe("command.incident_command_structures", () => {
    it("uses created_at (renamed from established_at)", () => {
      const b = tableBlock(sql, "command.incident_command_structures");
      expect(b).toMatch(/created_at/);
      expect(b).not.toContain("established_at");
    });

    it("enforces one command structure per incident (UNIQUE was missing)", () => {
      expect(sql).toContain("uq_incident_command_structures_incident_id UNIQUE (incident_id)");
    });
  });

  describe("command.command_handovers", () => {
    const block = () => tableBlock(sql, "command.command_handovers");

    it("has from_actor_type/from_actor_id, both nullable (first handover has no predecessor)", () => {
      expect(block()).toMatch(/from_actor_type\s+security\.actor_type_enum NULL/);
      expect(block()).toMatch(/from_actor_id\s+uuid NULL/);
    });

    it("has to_actor_type NOT NULL alongside to_actor_id (type was missing)", () => {
      expect(block()).toMatch(/to_actor_type\s+security\.actor_type_enum NOT NULL/);
      expect(block()).toMatch(/to_actor_id\s+uuid NOT NULL/);
    });

    it("uses occurred_at (renamed from handed_over_at)", () => {
      expect(block()).toMatch(/occurred_at/);
      expect(block()).not.toContain("handed_over_at");
    });
  });

  describe("command.operational_decisions", () => {
    it("has decided_by_actor_type, and decided_by_actor_id is NOT NULL", () => {
      const b = tableBlock(sql, "command.operational_decisions");
      expect(b).toMatch(/decided_by_actor_type\s+security\.actor_type_enum NOT NULL/);
      expect(b).toMatch(/decided_by_actor_id\s+uuid NOT NULL/);
    });
  });

  describe("command.automated_recommendations", () => {
    const block = () => tableBlock(sql, "command.automated_recommendations");

    it("links back to the AutomationRule that produced it", () => {
      expect(block()).toMatch(/generated_by_rule_id\s+uuid NULL/);
      expect(sql).toMatch(/fk_automated_recommendations_rule FOREIGN KEY \(generated_by_rule_id\) REFERENCES governance\.automation_rules\(id\)/);
    });

    it("uses `content` and `generated_at` (renamed from recommendation_text/created_at)", () => {
      const b = block();
      expect(b).toMatch(/content\s+text NOT NULL/);
      expect(b).toMatch(/generated_at/);
      expect(b).not.toContain("recommendation_text");
    });

    it("does NOT carry the D-02 mixin — no backfill targets command.*", () => {
      expect(block()).not.toMatch(/legacy_source/);
    });
  });

  describe("command.human_overrides (Clause V safeguard)", () => {
    const block = () => tableBlock(sql, "command.human_overrides");

    it("records who overrode, with both type and id NOT NULL", () => {
      expect(block()).toMatch(/overridden_by_actor_type\s+security\.actor_type_enum NOT NULL/);
      expect(block()).toMatch(/overridden_by_actor_id\s+uuid NOT NULL/);
    });

    it("requires a justification (renamed from nullable `reason`)", () => {
      expect(block()).toMatch(/justification\s+text NOT NULL/);
      expect(block()).not.toMatch(/reason\s+text/);
    });

    it("allows at most one override per recommendation (UNIQUE was missing)", () => {
      expect(sql).toContain("uq_human_overrides_recommendation_id UNIQUE (automated_recommendation_id)");
    });
  });

  it("command_roles keeps institutional_membership_id nullable and distinct from the membership itself", () => {
    const b = tableBlock(sql, "command.command_roles");
    expect(b).toMatch(/institutional_membership_id\s+uuid NULL/);
    expect(b).toMatch(/role_label\s+varchar\(100\) NOT NULL/);
    // A command role is per-incident-command-structure, never per-organization.
    expect(b).toMatch(/incident_command_structure_id/);
    expect(b).not.toMatch(/organization_id/);
  });

  it("no command.* table still carries a VERIFY_AGAINST_V1.0 out-of-scope marker", () => {
    const section = sql.slice(sql.indexOf("-- 4. command schema"), sql.indexOf("-- 5. Deferred FK"));
    // The section's own header states that no marker remains, so exclude
    // lines that merely NAME the marker while asserting its absence.
    const offenders = section
      .split(/\r?\n/)
      .filter((l) => /VERIFY_AGAINST_V1\.0|OUT OF SCOPE/.test(l))
      .filter((l) => !/marker remains|no `VERIFY_AGAINST_V1\.0`/i.test(l));
    expect(offenders).toEqual([]);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DRIFT_CLASSES,
  SHADOW_SURFACE,
  SYNCED_COLUMNS,
  classifyAll,
  classifyDriftIssue,
  columnOf,
} from "../../scripts/database-target/../migration-rehearsal/lib/classify-target-schema-drift.mjs";

/**
 * tests/database-target/paso5-drift-classification.test.ts
 *
 * Paso 5 point 6: the structural divergences between
 * `prisma/schema.target.prisma` and the DDL the waves apply are CLASSIFIED,
 * not deleted wholesale and not left as one anonymous pile of 388.
 *
 * Two things are ratcheted here:
 *   1. the per-class counts, so a new divergence cannot appear (or an existing
 *      one silently change class) without this test failing;
 *   2. the SHADOW-DEPENDENT list — real drift about a column the shadow-write
 *      writes or the dual-read compares. Those are the only entries whose
 *      reconciliation will touch the sync path, so a new one must be a
 *      deliberate, reviewed change.
 *
 * It also keeps `SYNCED_COLUMNS`/`SHADOW_SURFACE` honest against the SQL: every
 * table a `migration_meta.fn_sync_*` function inserts into must be declared
 * here, or the classification would silently stop covering it.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const BASELINE = join(REPO_ROOT, "scripts", "migration-rehearsal", "target-schema-drift-baseline.json");
const WAVES = join(REPO_ROOT, "prisma", "target-migrations");

interface Baseline {
  issues: string[];
}

function baseline(): Baseline {
  return JSON.parse(readFileSync(BASELINE, "utf8").replace(/^﻿/, "")) as Baseline;
}

interface Classified {
  wave: string;
  kind: string;
  object: string;
  detail: string;
  class: string;
  rule: string;
  rationale: string;
  onShadowSurface: boolean;
  column: string | null;
  affectsSyncedColumn: boolean;
}

interface Classification {
  classified: Classified[];
  counts: Record<string, number>;
  byWave: Record<string, Record<string, number>>;
  onShadowSurface: Classified[];
  shadowDependent: Classified[];
}

const classify = (issues: string[]): Classification => classifyAll(issues) as Classification;

/**
 * The measured state at the end of Paso 5. Numbers, not adjectives: the
 * divergences are known, counted and bucketed, and NONE of that makes any wave
 * production-ready.
 */
const EXPECTED_COUNTS = {
  INTENTIONAL_SQL_ONLY: 100,
  PRISMA_LIMITATION: 20,
  // 152 -> 8 in Paso 6A: the 144 divergences a FROZEN document decides were
  // reconciled (drift-reconciliation-plan.mjs), and the 8 that survive are the
  // enum vocabularies no frozen document decides, each one escalated to a named
  // human decision instead of guessed.
  REAL_DRIFT_TO_RECONCILE: 8,
  REQUIRES_HUMAN_DECISION: 234,
} as const;

/**
 * EMPTY since Paso 6A, and that is the point: every divergence that touched a
 * column the shadow-write writes or the dual-read compares has been reconciled
 * against the frozen catalog. A new entry here means the sync path drifted from
 * the model again.
 */
const EXPECTED_SHADOW_DEPENDENT: string[] = [];

describe("every structural divergence is classified", () => {
  it("assigns every baseline issue to exactly one of the four Paso 5 classes", () => {
    const { classified, counts } = classify(baseline().issues);
    expect(classified).toHaveLength(baseline().issues.length);
    for (const entry of classified) {
      expect(DRIFT_CLASSES).toContain(entry.class);
      expect(entry.rule).not.toBe("");
      expect(entry.rationale).not.toBe("");
    }
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(baseline().issues.length);
  });

  it("matches the recorded counts (a new or reclassified divergence fails here)", () => {
    expect(classify(baseline().issues).counts).toEqual(EXPECTED_COUNTS);
  });

  it("classifies the D-02 provenance mixin as intentional SQL-only, never as drift", () => {
    const entry = classifyDriftIssue("010|D02_MIXIN_ONLY_IN_SQL|security.audit_logs|legacy_record_id");
    expect(entry.class).toBe("INTENTIONAL_SQL_ONLY");
  });

  it("classifies views as a Prisma limitation, never as drift", () => {
    const entry = classifyDriftIssue("030|VIEW_NOT_MODELED|ingest.vw_migration_review_queue|v");
    expect(entry.class).toBe("PRISMA_LIMITATION");
  });

  it("classifies a decision-bound namespace as REQUIRES_HUMAN_DECISION and names the decision", () => {
    const ice = classifyDriftIssue("090|COLUMN_MISSING_IN_DB|ice.ice_records|some_column (String?)");
    expect(ice.class).toBe("REQUIRES_HUMAN_DECISION");
    expect(ice.rationale).toContain("D-08");
    const risk = classifyDriftIssue("040|NULLABILITY|risk.risk_matrices|x: prisma NOT NULL vs db NULL");
    expect(risk.rationale).toContain("T-09");
  });

  it("classifies a mechanical mismatch with no open decision as REAL_DRIFT_TO_RECONCILE", () => {
    const entry = classifyDriftIssue("020|NULLABILITY|identity.people|display_alias: prisma NOT NULL vs db NULL");
    expect(entry.class).toBe("REAL_DRIFT_TO_RECONCILE");
  });

  it("never invents a class for an unknown kind — it falls into the reconcile bucket, not into silence", () => {
    const entry = classifyDriftIssue("020|SOMETHING_NEW|identity.people|whatever");
    expect(entry.class).toBe("REAL_DRIFT_TO_RECONCILE");
  });
});

describe("the shadow-dependent drift is named, not anonymous", () => {
  it("is exactly the recorded list", () => {
    const actual = classify(baseline().issues).shadowDependent.map(
      (entry) => `${entry.wave}|${entry.kind}|${entry.object}|${entry.column}`
    );
    expect(actual.sort()).toEqual([...EXPECTED_SHADOW_DEPENDENT].sort());
  });

  it("does not include the auth_provider nullability Paso 5 fixed", () => {
    const issues = baseline().issues;
    expect(issues.some((issue) => issue.includes("identity.user_accounts|auth_provider"))).toBe(false);
  });

  it("every shadow-dependent entry is real drift about a column the sync actually uses", () => {
    for (const entry of classify(baseline().issues).shadowDependent) {
      expect(entry.class).toBe("REAL_DRIFT_TO_RECONCILE");
      expect(entry.onShadowSurface).toBe(true);
      expect(SYNCED_COLUMNS[entry.object as keyof typeof SYNCED_COLUMNS]).toContain(entry.column);
    }
  });

  it("columnOf reads the column out of every detail shape the comparer emits", () => {
    expect(columnOf("legacy_record_id")).toBe("legacy_record_id");
    expect(columnOf("created_at (DateTime)")).toBe("created_at");
    expect(columnOf("status: prisma NOT NULL vs db NULL")).toBe("status");
    expect(columnOf("(help_request_id) prisma CASCADE vs db RESTRICT")).toBe("help_request_id");
    expect(columnOf("")).toBeNull();
  });
});

describe("the classification stays in step with the SQL it classifies", () => {
  /** Every `INSERT INTO <schema>.<table>` inside a fn_sync_* function body. */
  function syncTargets(): string[] {
    const found = new Set<string>();
    for (const wave of ["010_foundation", "020_identity", "030_ingestion_observation_evidence", "040_incident", "050_help_mission", "060_resources"]) {
      // Comment lines are dropped first: several backfills document a mapping
      // as a commented-out INSERT (governance.administrative_area_kinds,
      // incident.incident_relations), and a commented statement writes nothing.
      const sql = readFileSync(join(WAVES, wave, "backfill.sql"), "utf8")
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n");
      for (const match of sql.matchAll(/INSERT INTO\s+([a-z_]+\.[a-z_]+)/gi)) {
        found.add(match[1].toLowerCase());
      }
    }
    return [...found].sort();
  }

  it("every target table the backfills/sync functions insert into is declared in SHADOW_SURFACE or is migration bookkeeping", () => {
    const bookkeeping = [
      "migration_meta.legacy_deferred_rows",
      "migration_meta.legacy_status_mapping",
      "migration_meta.migration_checkpoints",
      "migration_meta.critical_poi_review_queue",
      "governance.incident_categories",
      "governance.incident_types",
      "governance.hazard_types",
      "governance.feature_flags",
      "security.access_roles",
    ];
    const unexpected = syncTargets().filter(
      (table) => !SHADOW_SURFACE.includes(table) && !bookkeeping.includes(table)
    );
    expect(unexpected, `undeclared sync target(s): ${unexpected.join(", ")}`).toEqual([]);
  });

  it("every table in SHADOW_SURFACE is actually written or compared (no stale entries)", () => {
    const targets = syncTargets();
    const dualReadOnly = ["ingest.providers"]; // written via fn_sync_sources' provider bootstrap
    const stale = SHADOW_SURFACE.filter((table) => !targets.includes(table) && !dualReadOnly.includes(table));
    expect(stale, `SHADOW_SURFACE lists table(s) nothing writes: ${stale.join(", ")}`).toEqual([]);
  });
});

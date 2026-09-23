import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyAll } from "../../scripts/migration-rehearsal/lib/classify-target-schema-drift.mjs";
import {
  DIRECTIONS,
  OPENED_DECISIONS,
  PLAN,
  applyPlan,
} from "../../scripts/migration-rehearsal/lib/drift-reconciliation-plan.mjs";

/**
 * tests/database-target/paso6a-drift-reconciliation-plan.test.ts
 *
 * Paso 6A point 5. The reconciliation is not "we fixed some drift": it is a
 * decision per divergence, and this file keeps that property true over time.
 *
 * What is ratcheted here:
 *   1. every REAL_DRIFT_TO_RECONCILE entry in the baseline maps to a plan entry
 *      — a new divergence with no decision fails immediately;
 *   2. what SURVIVES is only ESCALATE, and every escalation names a decision
 *      that exists in OPENED_DECISIONS. A divergence cannot be left open
 *      anonymously;
 *   3. nothing shadow-dependent survives: the sync path and the model agree
 *      about every column the shadow-write writes or the dual-read compares;
 *   4. the plan cannot quietly become a to-do list — each entry cites an
 *      authority and says what it did.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const BASELINE = join(REPO_ROOT, "scripts", "migration-rehearsal", "target-schema-drift-baseline.json");

interface Classified {
  wave: string;
  kind: string;
  object: string;
  detail: string;
  class: string;
  affectsSyncedColumn: boolean;
}

interface PlanEntry {
  direction: string;
  authority: string;
  actions: string[];
  covers: string[];
  decision?: string;
}

function realDrift(): Classified[] {
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8").replace(/^﻿/, "")) as { issues: string[] };
  // Through `unknown`: the .mjs classifier is JSDoc-typed and its inferred
  // return shape carries fields this test does not model (rule, rationale,
  // column), so a direct assertion is rejected as non-overlapping.
  const { classified } = classifyAll(baseline.issues) as unknown as { classified: Classified[] };
  return classified.filter((entry) => entry.class === "REAL_DRIFT_TO_RECONCILE");
}

const plan = () =>
  applyPlan(realDrift()) as {
    covered: Array<{ entry: Classified; key: string; plan: PlanEntry }>;
    uncovered: Array<{ entry: Classified; key: string }>;
    byDirection: Record<string, number>;
    escalated: string[];
  };

/**
 * The measured end state of Paso 6A: 152 -> 8. Every one of the 8 is an enum
 * vocabulary that no frozen document fixes.
 */
const EXPECTED_SURVIVING = [
  "010|ENUM_VALUES|governance.policy_publication_status_enum",
  "010|ENUM_VALUES|governance.territorial_configuration_status_enum",
  "020|ENUM_VALUES|identity.operational_session_end_reason_enum",
  "020|ENUM_VALUES|identity.trust_domain_enum",
  "030|ENUM_VALUES|evidence.confidence_level_enum",
  "050|ENUM_VALUES|help.help_request_status_enum",
  "060|ENUM_VALUES|resource.inventory_movement_kind_enum",
  "060|ENUM_VALUES|resource.resource_status_enum",
];

describe("every reconcilable divergence has a decision", () => {
  it("leaves no baseline entry without a plan entry", () => {
    const { uncovered } = plan();
    expect(
      uncovered.map((u) => `${u.key} :: ${u.entry.detail}`),
      "a divergence with no recorded decision is exactly what this plan exists to prevent"
    ).toEqual([]);
  });

  it("is the recorded set of survivors, and they are all escalations", () => {
    const { covered, byDirection } = plan();
    const surviving = covered.map((c) => `${c.entry.wave}|${c.entry.kind}|${c.entry.object}`).sort();
    expect([...new Set(surviving)]).toEqual([...EXPECTED_SURVIVING].sort());
    expect(byDirection.ESCALATE).toBe(covered.length);
    expect(byDirection.FIX_DDL).toBe(0);
    expect(byDirection.FIX_PRISMA).toBe(0);
  });

  it("names a real decision for every escalation — nothing is left open anonymously", () => {
    const { covered } = plan();
    for (const { key, plan: entry } of covered) {
      expect(entry.direction, key).toBe("ESCALATE");
      expect(entry.decision, `${key} escalates without naming a decision`).toBeDefined();
      expect(Object.keys(OPENED_DECISIONS), `${key} names an unknown decision`).toContain(entry.decision);
    }
  });

  it("keeps ZERO shadow-dependent drift: the sync path and the model agree", () => {
    const shadowDependent = realDrift().filter((entry) => entry.affectsSyncedColumn);
    expect(
      shadowDependent.map((e) => `${e.object}|${e.detail}`),
      "a column the shadow-write writes or the dual-read compares drifted from the model again"
    ).toEqual([]);
  });
});

describe("the plan is a record of decisions, not a to-do list", () => {
  it("every entry cites an authority, states what it did, and uses a known direction", () => {
    for (const [key, entry] of Object.entries(PLAN) as Array<[string, PlanEntry]>) {
      expect(DIRECTIONS, `${key} has an unknown direction`).toContain(entry.direction);
      expect(entry.authority.length, `${key} cites no authority`).toBeGreaterThan(20);
      expect(entry.actions.length, `${key} records no action`).toBeGreaterThan(0);
      expect(entry.covers.length, `${key} covers no divergence kind`).toBeGreaterThan(0);
    }
  });

  it("every ESCALATE entry names a decision and every FIX entry does not", () => {
    for (const [key, entry] of Object.entries(PLAN) as Array<[string, PlanEntry]>) {
      if (entry.direction === "ESCALATE") {
        expect(entry.decision, `${key}`).toBeDefined();
      } else {
        expect(entry.decision, `${key} is a fix, so it must not defer to a human decision`).toBeUndefined();
      }
    }
  });

  it("every opened decision explains itself well enough to be answered", () => {
    for (const [name, text] of Object.entries(OPENED_DECISIONS)) {
      expect(name).toMatch(/^D-\d{2}_[A-Z0-9_]+$/);
      expect(text.length, `${name} is too terse to decide on`).toBeGreaterThan(120);
    }
  });

  it("the decisions this plan opened are exactly the ones its escalations use", () => {
    const { escalated } = plan();
    expect([...escalated].sort()).toEqual(Object.keys(OPENED_DECISIONS).sort());
  });
});

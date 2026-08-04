import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REPO_ROOT,
  WORKFLOW_YML,
  passingArtifact,
  parseWorkflowSteps,
  readRepoText,
  runResultVerifier,
} from "./rehearsalHarnessTestHelpers";

/**
 * tests/database-target/ci-target-tests-blocking.test.ts
 *
 * CI runs the canonical commands, not a second hand-rolled copy of them.
 *
 * The workflow used to invoke the .ps1 directly because `npm run
 * db:target:rehearsal` hardcoded `powershell`, which does not exist on
 * ubuntu-latest. Two invocation paths for one thing is how they drift: a
 * blocking condition added to one is missing from the other. There is one path
 * now, and CI additionally re-derives the verdict from the rehearsal's own
 * artifact rather than trusting its exit code alone.
 */

const workflow = readRepoText(WORKFLOW_YML);
const steps = parseWorkflowSteps(workflow);
const packageJson = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));

const stepRunning = (fragment: string) =>
  steps.find((step) => step.run?.includes(fragment));

describe("CI invokes the canonical commands", () => {
  it("runs `npm run db:target:ci` rather than re-implementing the rehearsal in YAML", () => {
    expect(stepRunning("npm run db:target:ci")).toBeDefined();
    expect(workflow).not.toContain("./scripts/migration-rehearsal/Invoke-ArgusFullRehearsal.ps1");
  });

  it("chains validate, the target suite and the rehearsal with && so any failure stops the chain", () => {
    expect(packageJson.scripts["db:target:ci"]).toBe(
      "npm run db:target:validate && npm run db:target:test && npm run db:target:rehearsal"
    );
  });

  it("launches the rehearsal through a cross-platform launcher, not a hardcoded `powershell`", () => {
    // `powershell` is Windows-only; on ubuntu-latest it simply does not exist,
    // which is why CI could not use the npm script before.
    expect(packageJson.scripts["db:target:rehearsal"]).toBe(
      "node scripts/migration-rehearsal/run-rehearsal.mjs"
    );
    const launcher = readRepoText(join(REPO_ROOT, "scripts", "migration-rehearsal", "run-rehearsal.mjs"));
    expect(launcher).toContain('["pwsh", "powershell"]');
    expect(launcher).toContain("REHEARSAL_INTERPRETER_MISSING");
    // The launcher must never be able to turn a red rehearsal green.
    expect(launcher).toContain("process.exit(result.status === null ? 1 : result.status)");
  });

  it("runs the canonical P0 suite as its own blocking step", () => {
    const step = stepRunning("npm run test:p0");
    expect(step).toBeDefined();
    expect(step?.shell).toBe("bash");
    expect(step?.run).toContain("set -euo pipefail");
  });
});

describe("CI re-derives the verdict from the rehearsal artifact", () => {
  it("runs the artifact verifier after the rehearsal", () => {
    const verifierIndex = steps.findIndex((step) =>
      step.run?.includes("verify-rehearsal-result.mjs")
    );
    const rehearsalIndex = steps.findIndex((step) => step.run?.includes("npm run db:target:ci"));
    expect(rehearsalIndex).toBeGreaterThan(-1);
    expect(verifierIndex).toBeGreaterThan(rehearsalIndex);
  });

  it("rejects Success=true that is not backed by every required phase", () => {
    const artifact = passingArtifact();
    const phases = artifact.RequiredPhaseResults as Array<Record<string, unknown>>;
    phases[0].Passed = false;
    phases[0].ExitCode = 1;
    phases[0].FailureCode = "TARGET_TESTS_FAILED";
    const result = runResultVerifier(artifact);
    expect(result.status).toBe(1);
    expect(result.output).toContain("REHEARSAL_REQUIRED_PHASE_FAILED");
    expect(result.output).toContain("TARGET_TESTS_FAILED");
  });

  it("rejects Success=true when a required phase was skipped", () => {
    const artifact = passingArtifact();
    const phases = artifact.RequiredPhaseResults as Array<Record<string, unknown>>;
    phases[1].Skipped = true;
    const result = runResultVerifier(artifact);
    expect(result.status).toBe(1);
    expect(result.output).toContain("REHEARSAL_REQUIRED_PHASE_SKIPPED");
  });

  it("rejects Success=false outright", () => {
    const result = runResultVerifier(passingArtifact({ Success: false, Error: "boom" }));
    expect(result.status).toBe(1);
    expect(result.output).toContain("REHEARSAL_NOT_SUCCESSFUL");
  });
});

describe("the pre-existing blocking steps are still present", () => {
  it("keeps the Docker-gated wave 3/4, audit-partition, access-role and R31 steps", () => {
    for (const fragment of [
      "wave3-local-integration.test.ts",
      "wave4-local-integration.test.ts",
      "audit-partition-checks.sql",
      "access-role-checks.sql",
      "incident-zone-checks.sql",
      "rls-matrix-checks.sql",
      "classify-catalog-residue.mjs",
    ]) {
      expect(workflow, `${fragment} must still be exercised by CI`).toContain(fragment);
    }
  });

  it("still confirms prisma/schema.prisma and prisma/migrations/ are untouched, before and after", () => {
    const guards = steps.filter((step) =>
      step.run?.includes("git status --porcelain -- prisma/schema.prisma prisma/migrations/")
    );
    expect(guards.length).toBe(2);
  });
});

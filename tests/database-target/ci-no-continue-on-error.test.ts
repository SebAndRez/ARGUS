import { describe, expect, it } from "vitest";
import { WORKFLOW_YML, parseWorkflowSteps, readRepoText } from "./rehearsalHarnessTestHelpers";

/**
 * tests/database-target/ci-no-continue-on-error.test.ts
 *
 * CI must fail on the same conditions the local harness fails on. Every way a
 * shell can swallow a non-zero exit code is asserted against here:
 *
 *   * `continue-on-error: true` turns a failed step into a green job;
 *   * `|| true` turns a failed command into a successful one;
 *   * bash without `-e` continues past a failed command in a multi-line step;
 *   * bash without `-o pipefail` reports the exit code of the LAST command in a
 *     pipe, so `failing-command | tee log` succeeds;
 *   * PowerShell without `$ErrorActionPreference = 'Stop'` continues past a
 *     non-terminating error.
 */

const workflow = readRepoText(WORKFLOW_YML);
const steps = parseWorkflowSteps(workflow);

describe("the workflow parses into real steps", () => {
  it("finds the steps the rest of this suite asserts about", () => {
    expect(steps.length).toBeGreaterThan(15);
    expect(steps.map((step) => step.name)).toContain("Checkout");
    expect(steps.filter((step) => step.run !== null).length).toBeGreaterThan(15);
  });
});

describe("no exit code is ever discarded", () => {
  it("uses continue-on-error nowhere", () => {
    expect(workflow).not.toMatch(/^\s*continue-on-error:/m);
  });

  it("uses `|| true` nowhere outside of prose", () => {
    const codeLines = workflow
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith("#"));
    const offenders = codeLines.filter((line) => line.includes("|| true"));
    expect(offenders).toEqual([]);
  });

  it("never redirects a command's failure into /dev/null or $null", () => {
    const codeLines = workflow.split(/\r?\n/).filter((line) => !line.trim().startsWith("#"));
    expect(codeLines.filter((line) => /2>\s*\/dev\/null/.test(line))).toEqual([]);
    expect(codeLines.filter((line) => /2>\s*\$null/.test(line))).toEqual([]);
  });
});

describe("every explicitly-shelled step is strict", () => {
  const bashSteps = steps.filter((step) => step.shell === "bash" && step.run);
  const pwshSteps = steps.filter((step) => step.shell === "pwsh" && step.run);

  it("has bash and pwsh steps to check", () => {
    expect(bashSteps.length).toBeGreaterThan(5);
    expect(pwshSteps.length).toBeGreaterThan(5);
  });

  it("starts every bash step with `set -euo pipefail`", () => {
    for (const step of bashSteps) {
      expect(step.run?.split(/\r?\n/)[0].trim(), `step "${step.name}"`).toBe("set -euo pipefail");
    }
  });

  it("starts every pwsh step with $ErrorActionPreference = 'Stop'", () => {
    for (const step of pwshSteps) {
      expect(step.run?.split(/\r?\n/)[0].trim(), `step "${step.name}"`).toBe(
        "$ErrorActionPreference = 'Stop'"
      );
    }
  });
});

describe("teardown is honest about its own failure", () => {
  const teardown = steps.find((step) => step.name.includes("tear down local Postgres/PostGIS"));

  it("exists and still runs on failure", () => {
    expect(teardown).toBeDefined();
    expect(teardown?.raw).toContain("if: always()");
  });

  it("checks whether there is anything to tear down instead of discarding the exit code", () => {
    expect(teardown?.run).toContain("set -euo pipefail");
    expect(teardown?.run).toContain("if [ -f .env.argus-migration.local ]; then");
    expect(teardown?.run).not.toContain("|| true");
  });
});

describe("artifacts are uploaded only when the job failed", () => {
  const upload = steps.find((step) => step.name.startsWith("Upload rehearsal logs"));

  it("is gated on failure()", () => {
    expect(upload).toBeDefined();
    expect(upload?.raw).toContain("if: failure()");
    expect(upload?.raw).not.toContain("if: always()");
  });
});

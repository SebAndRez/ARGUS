import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  REPO_ROOT,
  VERIFY_RESULT_MJS,
  passingArtifact,
  powershellAvailable,
  readJsonArtifact,
  runHarnessWithScratch,
  runResultVerifier,
} from "./rehearsalHarnessTestHelpers";

/**
 * tests/database-target/rehearsal-summary-failure.test.ts
 *
 * The summary a failed run leaves behind must say so.
 *
 * Before this change the summary was the crime scene: it contained
 * TargetTestsExitCode=1 AND Status: SUCCESS at the same time, because the exit
 * code was a recorded field and the status was a separate assignment. The two
 * are now the same fact — the status is derived from the same ledger the
 * verdicts come from, so they cannot disagree.
 */

const hasPowerShell = powershellAvailable();

describe.skipIf(!hasPowerShell)("the failure summary", () => {
  const failedRun = `
Initialize-ArgusPhaseLedger | Out-Null
Add-ArgusPhaseResult -Name "FirstInstall/TargetTests" -ExitCode 1 -Passed $false -FailureCode "TARGET_TESTS_FAILED" -Evidence "exit 1: 3 tests failed" | Out-Null
Add-ArgusPhaseResult -Name "FirstInstall/P0Tests" -Executed $false -Passed $false -Evidence "never reached" | Out-Null
$result = [ordered]@{
  Success = $false
  Error = "TARGET_TESTS_FAILED - phase 'FirstInstall/TargetTests': 'npm' exited 1."
  RequiredPhaseNames = @("FirstInstall/TargetTests","FirstInstall/P0Tests")
}
Complete-ArgusRehearsalRun -Result $result | Out-Null
`;

  it("names the failure and never claims success", () => {
    runHarnessWithScratch(
      () => failedRun,
      (scratch) => {
        const markdown = readFileSync(
          join(scratch, "docs", "ARGUS_FULL_LOCAL_MIGRATION_REHEARSAL_v1.0.md"),
          "utf8"
        );
        expect(markdown).toContain("Status: FAILED");
        expect(markdown).toContain("TARGET_TESTS_FAILED");
        expect(markdown).toContain("TargetTests=FAIL");
        expect(markdown).not.toContain("Status: SUCCESS");
        expect(markdown).not.toContain("Success=True");
      }
    );
  });

  it("prints the phase ledger so a failure names itself", () => {
    runHarnessWithScratch(
      () => failedRun,
      (scratch) => {
        const markdown = readFileSync(
          join(scratch, "docs", "ARGUS_FULL_LOCAL_MIGRATION_REHEARSAL_v1.0.md"),
          "utf8"
        );
        expect(markdown).toContain("| Phase | Required | Executed | ExitCode | Passed | Skipped | FailureCode |");
        expect(markdown).toMatch(/\| FirstInstall\/TargetTests \| True \| True \| 1 \| False \|/);
        // The phase that never ran is present as a row rather than absent, so
        // "did not run" and "ran and passed" cannot be confused.
        expect(markdown).toMatch(/\| FirstInstall\/P0Tests \| True \| False \|/);
      }
    );
  });

  it("reports no blocking markers when the run never reached the summary", () => {
    runHarnessWithScratch(
      () => failedRun,
      (scratch) => {
        const markdown = readFileSync(
          join(scratch, "docs", "ARGUS_FULL_LOCAL_MIGRATION_REHEARSAL_v1.0.md"),
          "utf8"
        );
        expect(markdown).not.toContain("TARGET_TESTS_BLOCKING_PASS");
        expect(markdown).not.toContain("P0_CANONICAL_SUITE_PASS");
        expect(markdown).toContain("(none - the run did not reach the blocking-test summary)");
      }
    );
  });

  it("writes a machine-readable artifact the verifier then rejects", () => {
    runHarnessWithScratch(
      () => failedRun,
      (scratch) => {
        const artifact = readJsonArtifact(
          join(scratch, "artifacts", "full-rehearsal-result.json")
        );
        const verdict = runResultVerifier(artifact);
        expect(verdict.status).toBe(1);
        expect(verdict.output).toContain("REHEARSAL_VERIFICATION_FAILED");
        expect(verdict.output).toContain("REHEARSAL_NOT_SUCCESSFUL");
      }
    );
  });
});

describe("the verifier rejects every shape of a dishonest summary", () => {
  it("rejects Success=true with TargetTests=FAIL", () => {
    const result = runResultVerifier(passingArtifact({ TargetTestsVerdict: "FAIL" }));
    expect(result.status).toBe(1);
    expect(result.output).toContain("TARGET_TESTS_FAILED");
  });

  it("rejects Success=true with a missing blocking marker", () => {
    const result = runResultVerifier(
      passingArtifact({ BlockingMarkers: ["TARGET_TESTS_BLOCKING_PASS", "P0_CANONICAL_SUITE_PASS"] })
    );
    expect(result.status).toBe(1);
    expect(result.output).toContain("REHEARSAL_BLOCKING_SUMMARY_FAIL");
    expect(result.output).toContain("REHEARSAL_FAILURE_PROPAGATION_PASS");
  });

  it("rejects Success=true when the P0 suite reported zero tests", () => {
    const result = runResultVerifier(passingArtifact({ P0_TESTS: 0 }));
    expect(result.status).toBe(1);
    expect(result.output).toContain("P0_TESTS_FAILED");
  });

  it("rejects Success=true when any P0 test was skipped", () => {
    const result = runResultVerifier(passingArtifact({ P0_SKIPPED: 4 }));
    expect(result.status).toBe(1);
    expect(result.output).toContain("P0_TESTS_FAILED");
  });

  it("rejects a missing artifact rather than treating absence as success", () => {
    const result = spawnSync(
      process.execPath,
      [VERIFY_RESULT_MJS, join(tmpdir(), "argus-no-such-rehearsal-result.json")],
      { cwd: REPO_ROOT, encoding: "utf8" }
    );
    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain("REHEARSAL_RESULT_MISSING");
  });

  it("accepts a complete, honest artifact", () => {
    const result = runResultVerifier(passingArtifact());
    expect(result.status).toBe(0);
    expect(result.output).toContain("REHEARSAL_VERIFIED");
  });
});

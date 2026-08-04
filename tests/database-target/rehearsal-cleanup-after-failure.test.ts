import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  FULL_REHEARSAL_PS1,
  powershellAvailable,
  readJsonArtifact,
  readRepoText,
  runHarnessWithScratch,
  stripPowerShellComments,
} from "./rehearsalHarnessTestHelpers";

/**
 * tests/database-target/rehearsal-cleanup-after-failure.test.ts
 *
 * A failed rehearsal must still tear its container and volume down, and must
 * still leave a summary behind. Otherwise the first real failure leaves a
 * stale database running that the next run inherits — and inheriting state is
 * how a rehearsal stops being a rehearsal.
 *
 * The teardown and summary logic lives in Complete-ArgusRehearsalRun precisely
 * so this can be exercised without a 40-minute Docker run. The harness is
 * pointed at a scratch directory whose env file does not exist, so the teardown
 * takes its "nothing to tear down" branch and no real container is touched.
 */

const hasPowerShell = powershellAvailable();
const orchestrator = stripPowerShellComments(readRepoText(FULL_REHEARSAL_PS1));

describe("cleanup is unconditional", () => {
  it("runs Complete-ArgusRehearsalRun from the finally block", () => {
    const finallyIndex = orchestrator.lastIndexOf("} finally {");
    expect(finallyIndex).toBeGreaterThan(-1);
    const tail = orchestrator.slice(finallyIndex);
    expect(tail).toContain("Complete-ArgusRehearsalRun -Result $overallResult");
  });

  it("exits non-zero whenever Success is not true", () => {
    expect(orchestrator).toContain("if (-not $overallResult.Success) {");
    expect(orchestrator).toContain("exit 1");
  });

  it("records the catch-path failure on the result before cleanup runs", () => {
    const catchIndex = orchestrator.lastIndexOf("} catch {");
    const finallyIndex = orchestrator.lastIndexOf("} finally {");
    const catchBlock = orchestrator.slice(catchIndex, finallyIndex);
    expect(catchBlock).toContain("$overallResult.Success = $false");
    expect(catchBlock).toContain("$overallResult.Error = $_.Exception.Message");
  });
});

describe.skipIf(!hasPowerShell)("Complete-ArgusRehearsalRun after a failure", () => {
  it("still writes the artifact, still attempts cleanup, and keeps Success=false", () => {
    runHarnessWithScratch(
      () => `
Initialize-ArgusPhaseLedger | Out-Null
Add-ArgusPhaseResult -Name "FirstInstall/TargetTests" -ExitCode 1 -Passed $false -FailureCode "TARGET_TESTS_FAILED" -Evidence "exit 1" | Out-Null
Add-ArgusPhaseResult -Name "FirstInstall/P0Tests" -Executed $false -ExitCode 0 -Passed $false -FailureCode "" -Evidence "never reached" | Out-Null
$result = [ordered]@{
  StartedAt = (Get-Date).ToString("o")
  Success = $false
  Error = "TARGET_TESTS_FAILED - phase 'FirstInstall/TargetTests': 'npm' exited 1."
}
$final = Complete-ArgusRehearsalRun -Result $result
Write-Output "SUCCESS=$($final.Success)"
Write-Output "CLEANUP_PERFORMED=$($final.CleanupPerformed)"
Write-Output "CLEANUP_EXIT=$($final.CleanupExitCode)"
Write-Output "TARGET_VERDICT=$($final.TargetTestsVerdict)"
`,
      (scratch, run) => {
        expect(run.status).toBe(0);
        expect(run.output).toContain("SUCCESS=False");
        expect(run.output).toContain("TARGET_VERDICT=FAIL");
        // Cleanup ran to its documented "nothing to tear down" branch rather
        // than being skipped because the run had already failed.
        expect(run.output).toMatch(/Fase 22: tearing down rehearsal container \+ volume/);
        expect(run.output).toContain("CLEANUP_EXIT=0");

        const artifactPath = join(scratch, "artifacts", "full-rehearsal-result.json");
        expect(existsSync(artifactPath)).toBe(true);
        const artifact = readJsonArtifact(artifactPath) as {
          Success: boolean;
          TargetTestsVerdict: string;
          Error: string;
          RequiredPhaseResults: Array<{ Name: string; Passed: boolean; ExitCode: number }>;
        };
        expect(artifact.Success).toBe(false);
        expect(artifact.TargetTestsVerdict).toBe("FAIL");
        expect(artifact.Error).toContain("TARGET_TESTS_FAILED");
        const target = artifact.RequiredPhaseResults.find(
          (phase) => phase.Name === "FirstInstall/TargetTests"
        )!;
        expect(target.Passed).toBe(false);
        expect(target.ExitCode).toBe(1);
      }
    );
  });

  it("demotes an otherwise-successful run when the teardown itself fails", () => {
    // A container left running is not a detail: the next rehearsal would
    // inherit it. So a broken cleanup takes the green verdict with it.
    runHarnessWithScratch(
      () => `
Initialize-ArgusPhaseLedger | Out-Null
Add-ArgusPhaseResult -Name "FirstInstall/TargetTests" -ExitCode 0 -Passed $true | Out-Null
function Invoke-ArgusRehearsalTeardown { return [pscustomobject]@{ Performed = $true; ExitCode = 17; Reason = "" } }
$result = [ordered]@{ Success = $true }
$final = Complete-ArgusRehearsalRun -Result $result
Write-Output "SUCCESS=$($final.Success)"
Write-Output "ERROR=$($final.Error)"
`,
      (_scratch, run) => {
        expect(run.output).toContain("SUCCESS=False");
        expect(run.output).toContain("REHEARSAL_CLEANUP_FAILED");
      }
    );
  });
});

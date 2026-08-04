import { describe, expect, it } from "vitest";
import {
  FAULT_FIXTURE,
  TEST_REHEARSAL_PS1,
  powershellAvailable,
  quote,
  readRepoText,
  runHarness,
  stripPowerShellComments,
} from "./rehearsalHarnessTestHelpers";

/**
 * tests/database-target/rehearsal-target-tests-exit-code.test.ts
 *
 * The original defect, locked out.
 *
 * Fase 17 of Test-ArgusRehearsal.ps1 read:
 *
 *     $targetTests = Invoke-ArgusNative { & npx vitest run tests/database-target/ }
 *     $summary.TargetTestsExitCode = $LASTEXITCODE
 *     $summary.TargetTestsOutput = ...
 *     $p0Tests = Invoke-ArgusNative { & npx vitest run tests/p0/<two files> }
 *
 * TargetTestsExitCode was RECORDED and never compared to zero. A red target
 * suite was written into the summary and the rehearsal carried straight on to
 * rollback, reinstall and Success=True. Recording a failure is not the same as
 * acting on one.
 */

const hasPowerShell = powershellAvailable();
const script = stripPowerShellComments(readRepoText(TEST_REHEARSAL_PS1));

describe("Fase 17 — the target suite's exit code is blocking", () => {
  it("no longer captures the exit code from $LASTEXITCODE without asserting it", () => {
    expect(script).not.toContain("$summary.TargetTestsExitCode = $LASTEXITCODE");
    expect(script).not.toContain("$summary.P0TestsExitCode = $LASTEXITCODE");
    expect(script).not.toContain("$summary.PrismaValidateExitCode = $LASTEXITCODE");
  });

  it("runs the target suite through the blocking runner with TARGET_TESTS_FAILED", () => {
    const phase = script.indexOf('-Phase "$PhaseScope/TargetTests"');
    expect(phase).toBeGreaterThan(-1);
    const block = script.slice(phase, phase + 800);
    expect(block).toContain("Invoke-ArgusBlockingCommand");
    expect(block).toContain('-FailureCode "TARGET_TESTS_FAILED"');
  });

  it("asserts the target result BEFORE the P0 command is ever launched", () => {
    // Ordering is the whole point: the old code ran the next command while the
    // previous one's failure sat unread in a variable.
    const targetRun = script.indexOf("$targetRun = Invoke-ArgusBlockingCommand");
    const targetCoverage = script.indexOf("$targetCoverage = Assert-ArgusVitestCoverage");
    const p0Run = script.indexOf("$p0Run = Invoke-ArgusBlockingCommand");
    expect(targetRun).toBeGreaterThan(-1);
    expect(targetCoverage).toBeGreaterThan(targetRun);
    expect(p0Run).toBeGreaterThan(targetCoverage);
  });

  it("records the target verdict in the required-phase ledger, not only in the summary", () => {
    expect(script).toContain('Add-ArgusPhaseResult -Name "$PhaseScope/TargetTests"');
    expect(script).toContain('$summary.TargetTests = "PASS"');
    expect(script).toContain('$summary.TargetTests = "FAIL"');
  });

  it("writes the summary before the failure propagates", () => {
    const catchIndex = script.lastIndexOf("} catch {");
    const tail = script.slice(catchIndex);
    const save = tail.indexOf("Save-ArgusTestSummary $summary");
    const rethrow = tail.indexOf("\n    throw");
    expect(save).toBeGreaterThan(-1);
    expect(rethrow).toBeGreaterThan(save);
  });
});

describe.skipIf(!hasPowerShell)("TARGET_TESTS_FAILED propagation", () => {
  it("a target command that exits 1 stops the phase with TARGET_TESTS_FAILED", () => {
    const run = runHarness(`
$threw = $false
$message = ''
try {
  Invoke-ArgusBlockingCommand -Phase "FirstInstall/TargetTests" -Command 'node' -Arguments @(${quote(FAULT_FIXTURE)}, 'fail') -FailureCode "TARGET_TESTS_FAILED" -TimeoutSeconds 120 | Out-Null
  Write-Output "CONTINUED_AFTER_FAILURE"
} catch { $threw = $true; $message = $_.Exception.Message }
$last = Get-ArgusLastCommandResult
Write-Output "THREW=$threw"
Write-Output "CODE_PRESENT=$($message -match 'TARGET_TESTS_FAILED')"
Write-Output "EXIT=$($last.ExitCode)"
`);
    expect(run.output).not.toContain("CONTINUED_AFTER_FAILURE");
    expect(run.output).toContain("THREW=True");
    expect(run.output).toContain("CODE_PRESENT=True");
    expect(run.output).toContain("EXIT=1");
  });

  it("a target suite that exits 0 but collected nothing is still rejected", () => {
    const run = runHarness(`
$r = Invoke-ArgusBlockingCommand -Phase "FirstInstall/TargetTests" -Command 'node' -Arguments @(${quote(FAULT_FIXTURE)}, 'empty') -FailureCode "TARGET_TESTS_FAILED" -TimeoutSeconds 120
Write-Output "COMMAND_EXIT=$($r.ExitCode)"
Test-Throws { Assert-ArgusVitestCoverage -Phase "FirstInstall/TargetTests" -Output $r.Output -FailureCode "TARGET_TESTS_FAILED" -MinFiles 1 -MinTests 1 }
`);
    expect(run.output).toContain("COMMAND_EXIT=0");
    expect(run.output).toContain("THREW:");
    expect(run.output).toContain("TARGET_TESTS_FAILED");
    expect(run.output).toMatch(/zero tests were collected/);
  });
});

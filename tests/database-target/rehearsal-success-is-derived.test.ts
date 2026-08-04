import { describe, expect, it } from "vitest";
import {
  FULL_REHEARSAL_PS1,
  powershellAvailable,
  readRepoText,
  runHarness,
  stripPowerShellComments,
} from "./rehearsalHarnessTestHelpers";

/**
 * tests/database-target/rehearsal-success-is-derived.test.ts
 *
 * Success must be DERIVED, never assigned.
 *
 * The old orchestrator set `$overallResult.Success = $true` simply because
 * control reached the end of the try block. Nothing between a failing suite and
 * that line ever looked at an exit code, so "the script did not crash" was the
 * whole basis of a green verdict. Success is now computed from the
 * required-phase ledger: every required phase must have executed, not been
 * skipped, exited zero and passed.
 */

const hasPowerShell = powershellAvailable();
const orchestrator = stripPowerShellComments(readRepoText(FULL_REHEARSAL_PS1));

const LEDGER_PREAMBLE = `
Initialize-ArgusPhaseLedger | Out-Null
Add-ArgusPhaseResult -Name "A" -ExitCode 0 -Passed $true -Evidence "ok" | Out-Null
Add-ArgusPhaseResult -Name "B" -ExitCode 0 -Passed $true -Evidence "ok" | Out-Null
`;

describe("Success is derived from the required-phase ledger", () => {
  it("assigns Success=$true only after Assert-ArgusRequiredPhases has run", () => {
    const assertIndex = orchestrator.indexOf("Assert-ArgusRequiredPhases -RequiredPhases $requiredPhases");
    const successIndex = orchestrator.indexOf("$overallResult.Success = $true");
    expect(assertIndex).toBeGreaterThan(-1);
    expect(successIndex).toBeGreaterThan(assertIndex);
  });

  it("has exactly one place that can set Success=$true", () => {
    const matches = orchestrator.match(/\$overallResult\.Success = \$true/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("requires the target and P0 phases of the first install", () => {
    expect(orchestrator).toContain('"FirstInstall/TargetTests"');
    expect(orchestrator).toContain('"FirstInstall/P0Tests"');
    expect(orchestrator).toContain('"FirstInstall/PrismaValidate"');
    expect(orchestrator).toContain('"RollbackZeroResidue"');
    expect(orchestrator).toContain('"FirstInstall/RlsMatrix"');
  });

  it("derives each blocking marker from a ledger entry rather than printing it unconditionally", () => {
    for (const marker of [
      "TARGET_TESTS_BLOCKING_PASS",
      "P0_CANONICAL_SUITE_PASS",
      "REHEARSAL_FAILURE_PROPAGATION_PASS",
    ]) {
      const index = orchestrator.indexOf(`$blockingMarkers += "${marker}"`);
      expect(index, `${marker} must be appended conditionally`).toBeGreaterThan(-1);
      const line = orchestrator.slice(orchestrator.lastIndexOf("\n", index) + 1, index);
      expect(line, `${marker} must be guarded by a ledger check`).toContain("if (");
    }
  });
});

describe.skipIf(!hasPowerShell)("Assert-ArgusRequiredPhases — behaviour", () => {
  it("passes when every required phase executed, exited 0 and passed", () => {
    const run = runHarness(`${LEDGER_PREAMBLE}
Write-Output "RESULT=$(Assert-ArgusRequiredPhases -RequiredPhases @('A','B'))"
`);
    expect(run.status).toBe(0);
    expect(run.output).toContain("RESULT=True");
    expect(run.output).toContain("REHEARSAL_REQUIRED_PHASES_PASS");
  });

  it("blocks when a required phase did not pass, even with exit code 0", () => {
    // The coverage gate produces exactly this shape: the command exited 0 but
    // the suite proved nothing.
    const run = runHarness(`${LEDGER_PREAMBLE}
Add-ArgusPhaseResult -Name "C" -ExitCode 0 -Passed $false -FailureCode "TARGET_TESTS_FAILED" | Out-Null
Test-Throws { Assert-ArgusRequiredPhases -RequiredPhases @('A','B','C') }
`);
    expect(run.output).toContain("THREW:");
    expect(run.output).toContain("REHEARSAL_REQUIRED_PHASE_FAILED");
    expect(run.output).toContain("TARGET_TESTS_FAILED");
  });

  it("blocks when a required phase exited non-zero", () => {
    const run = runHarness(`${LEDGER_PREAMBLE}
Add-ArgusPhaseResult -Name "C" -ExitCode 1 -Passed $true -FailureCode "TARGET_TESTS_FAILED" | Out-Null
Test-Throws { Assert-ArgusRequiredPhases -RequiredPhases @('A','B','C') }
`);
    expect(run.output).toContain("REHEARSAL_REQUIRED_PHASE_FAILED");
    expect(run.output).toMatch(/exited 1/);
  });

  it("refuses to accept a required phase that was demoted to Required=false", () => {
    // Otherwise the cheapest way to make a red phase green would be to edit one
    // boolean instead of fixing the failure.
    const run = runHarness(`${LEDGER_PREAMBLE}
Add-ArgusPhaseResult -Name "C" -Required $false -ExitCode 0 -Passed $true | Out-Null
Test-Throws { Assert-ArgusRequiredPhases -RequiredPhases @('A','B','C') }
`);
    expect(run.output).toContain("THREW:");
    expect(run.output).toMatch(/registered as Required=false/);
  });

  it("records the full contract for every ledger entry", () => {
    const run = runHarness(`${LEDGER_PREAMBLE}
$l = Get-ArgusPhaseLedger
foreach ($p in @('Name','Required','Executed','ExitCode','Passed','Evidence','Skipped','FailureCode')) {
  if ($null -eq $l['A'].PSObject.Properties[$p]) { Write-Output "MISSING:$p" }
}
Write-Output "CONTRACT_OK"
`);
    expect(run.output).not.toContain("MISSING:");
    expect(run.output).toContain("CONTRACT_OK");
  });
});

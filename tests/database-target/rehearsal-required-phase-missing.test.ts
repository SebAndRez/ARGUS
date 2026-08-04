import { describe, expect, it } from "vitest";
import {
  FULL_REHEARSAL_PS1,
  passingArtifact,
  powershellAvailable,
  readRepoText,
  runHarness,
  runResultVerifier,
} from "./rehearsalHarnessTestHelpers";

/**
 * tests/database-target/rehearsal-required-phase-missing.test.ts
 *
 * A phase that silently never ran must be as fatal as one that ran and failed.
 *
 * This is the failure mode that survives every exit-code check: delete the
 * phase, and there is no exit code left to be non-zero. REHEARSAL_REQUIRED_
 * PHASE_MISSING closes that door — the required set is declared up front, and
 * a name in it with no ledger row rejects the run.
 */

const hasPowerShell = powershellAvailable();
const orchestrator = readRepoText(FULL_REHEARSAL_PS1);

describe("a required phase with no result rejects the run", () => {
  it("declares the required set explicitly rather than inferring it", () => {
    expect(orchestrator).toContain("$requiredPhases = @(");
    expect(orchestrator).toContain("$overallResult.RequiredPhaseNames = $requiredPhases");
  });

  it("adds the second-install phases only when that install actually runs", () => {
    // Otherwise -SkipSecondInstall would report a phase missing that was never
    // supposed to run, and the code would be tempted to soften the check.
    const conditional = orchestrator.indexOf("if (-not $SkipSecondInstall) {");
    const secondInstall = orchestrator.indexOf('"SecondInstall/TargetTests"');
    expect(conditional).toBeGreaterThan(-1);
    expect(secondInstall).toBeGreaterThan(conditional);
  });
});

describe.skipIf(!hasPowerShell)("REHEARSAL_REQUIRED_PHASE_MISSING — behaviour", () => {
  it("rejects a required phase that never registered a result", () => {
    const run = runHarness(`
Initialize-ArgusPhaseLedger | Out-Null
Add-ArgusPhaseResult -Name "A" -ExitCode 0 -Passed $true | Out-Null
Test-Throws { Assert-ArgusRequiredPhases -RequiredPhases @('A','FirstInstall/TargetTests') }
`);
    expect(run.output).toContain("THREW:");
    expect(run.output).toContain("REHEARSAL_REQUIRED_PHASE_MISSING");
    expect(run.output).toContain("FirstInstall/TargetTests");
  });

  it("rejects a phase that was registered but never executed", () => {
    const run = runHarness(`
Initialize-ArgusPhaseLedger | Out-Null
Add-ArgusPhaseResult -Name "A" -Executed $false -ExitCode 0 -Passed $true | Out-Null
Test-Throws { Assert-ArgusRequiredPhases -RequiredPhases @('A') }
`);
    expect(run.output).toContain("REHEARSAL_REQUIRED_PHASE_MISSING");
    expect(run.output).toMatch(/never executed/);
  });

  it("rejects a required phase that was skipped", () => {
    const run = runHarness(`
Initialize-ArgusPhaseLedger | Out-Null
Add-ArgusPhaseResult -Name "A" -Skipped $true -ExitCode 0 -Passed $true | Out-Null
Test-Throws { Assert-ArgusRequiredPhases -RequiredPhases @('A') }
`);
    expect(run.output).toContain("REHEARSAL_REQUIRED_PHASE_SKIPPED");
  });
});

describe("the artifact verifier rejects a missing phase too", () => {
  it("accepts an artifact whose every required phase is present and passing", () => {
    const result = runResultVerifier(passingArtifact());
    expect(result.status).toBe(0);
    expect(result.output).toContain("REHEARSAL_VERIFIED");
  });

  it("rejects Success=true when a declared required phase has no row", () => {
    const artifact = passingArtifact();
    artifact.RequiredPhaseNames = [
      ...(artifact.RequiredPhaseNames as string[]),
      "FirstInstall/RlsMatrix",
    ];
    const result = runResultVerifier(artifact);
    expect(result.status).toBe(1);
    expect(result.output).toContain("REHEARSAL_REQUIRED_PHASE_MISSING");
    expect(result.output).toContain("FirstInstall/RlsMatrix");
  });

  it("rejects an artifact that declares no required phases at all", () => {
    const result = runResultVerifier(passingArtifact({ RequiredPhaseNames: [] }));
    expect(result.status).toBe(1);
    expect(result.output).toContain("REHEARSAL_REQUIRED_PHASE_MISSING");
  });
});

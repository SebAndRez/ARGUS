import { describe, expect, it } from "vitest";
import {
  COMMON_PS1,
  FAULT_FIXTURE,
  powershellAvailable,
  quote,
  readRepoText,
  runHarness,
} from "./rehearsalHarnessTestHelpers";

/**
 * tests/database-target/rehearsal-native-command-failure.test.ts
 *
 * The contract of Invoke-ArgusBlockingCommand, exercised for real.
 *
 * The rehearsal used to run every native command through Invoke-ArgusNative,
 * which returns output and leaves the exit-code check to the caller. Callers
 * forgot. The replacement cannot be used incorrectly: a non-zero exit throws
 * and NOTHING is returned, so there is no code path that obtains a result
 * object from a failed command.
 */

const hasPowerShell = powershellAvailable();
const NODE = "node";

describe("Invoke-ArgusBlockingCommand — source-level guarantees", () => {
  const common = readRepoText(COMMON_PS1);

  it("never silences an exit code with || true", () => {
    expect(common).not.toContain("|| true");
  });

  it("does not read $LASTEXITCODE inside the blocking runner", () => {
    // $LASTEXITCODE is the value that gets lost across pipelines; the blocking
    // runner owns a Process object and reads .ExitCode from it instead. Sliced
    // past the doc comment, which mentions $LASTEXITCODE only to explain why
    // the code below never touches it.
    const declaration = common.indexOf("function Invoke-ArgusBlockingCommand");
    const bodyStart = common.indexOf("#>", declaration) + 2;
    const runner = common.slice(bodyStart, common.indexOf("function Stop-ArgusProcessTree"));
    expect(runner.length).toBeGreaterThan(500);
    expect(runner).not.toContain("$LASTEXITCODE");
    expect(runner).toContain("$proc.ExitCode");
  });

  it("throws rather than returning when the exit code is non-zero", () => {
    const runner = common.slice(common.indexOf("function Invoke-ArgusBlockingCommand"));
    const throwIndex = runner.indexOf('throw "$FailureCode - phase');
    const returnIndex = runner.indexOf("return $result");
    expect(throwIndex).toBeGreaterThan(-1);
    expect(returnIndex).toBeGreaterThan(throwIndex);
  });
});

describe.skipIf(!hasPowerShell)("Invoke-ArgusBlockingCommand — behaviour", () => {
  it("returns the full structured contract for a successful command", () => {
    const run = runHarness(`
$r = Invoke-ArgusBlockingCommand -Phase "T/Ok" -Command ${quote(NODE)} -Arguments @(${quote(FAULT_FIXTURE)}, 'pass') -FailureCode "T_FAILED" -TimeoutSeconds 120
foreach ($p in @('Command','Arguments','ExitCode','Output','Duration','Phase','Success')) {
  if ($null -eq $r.PSObject.Properties[$p]) { Write-Output "MISSING:$p" }
}
Write-Output "EXIT=$($r.ExitCode) SUCCESS=$($r.Success) PHASE=$($r.Phase)"
`);
    expect(run.status).toBe(0);
    expect(run.output).not.toContain("MISSING:");
    expect(run.output).toContain("EXIT=0 SUCCESS=True PHASE=T/Ok");
  });

  it("throws with the phase's failure code when the command exits 1", () => {
    const run = runHarness(`
Test-Throws { Invoke-ArgusBlockingCommand -Phase "T/Fail" -Command ${quote(NODE)} -Arguments @(${quote(FAULT_FIXTURE)}, 'fail') -FailureCode "TARGET_TESTS_FAILED" -TimeoutSeconds 120 }
`);
    expect(run.status).toBe(0);
    expect(run.output).toContain("THREW:");
    expect(run.output).toContain("TARGET_TESTS_FAILED");
    expect(run.output).not.toContain("NO_THROW");
  });

  it("still fails when the command prints a green summary and exits 1", () => {
    // The fixture's `fail` mode prints "Test Files 2 passed (2)" and
    // "ALL GREEN" before exiting 1. Trusting the text instead of the exit code
    // is the exact failure this whole change removes.
    const run = runHarness(`
$threw = $false
try { Invoke-ArgusBlockingCommand -Phase "T/GreenText" -Command ${quote(NODE)} -Arguments @(${quote(FAULT_FIXTURE)}, 'fail') -FailureCode "T_FAILED" -TimeoutSeconds 120 | Out-Null }
catch { $threw = $true }
$last = Get-ArgusLastCommandResult
Write-Output "THREW=$threw LAST_EXIT=$($last.ExitCode) LAST_SUCCESS=$($last.Success)"
Write-Output "GREEN_TEXT_PRESENT=$(($last.Output -join ' ') -match 'ALL GREEN')"
`);
    expect(run.status).toBe(0);
    expect(run.output).toContain("THREW=True LAST_EXIT=1 LAST_SUCCESS=False");
    expect(run.output).toContain("GREEN_TEXT_PRESENT=True");
  });

  it("treats a non-existent command as a failure, never a skip", () => {
    const run = runHarness(`
Test-Throws { Invoke-ArgusBlockingCommand -Phase "T/Missing" -Command "argus-nonexistent-binary" -FailureCode "T_FAILED" -TimeoutSeconds 30 }
`);
    expect(run.output).toContain("THREW:");
    expect(run.output).toMatch(/was not found on PATH/);
    expect(run.output).toMatch(/not a skipped one/);
  });

  it("enforces the explicit timeout and reports it as a failure", () => {
    const run = runHarness(`
$sw = [System.Diagnostics.Stopwatch]::StartNew()
Test-Throws { Invoke-ArgusBlockingCommand -Phase "T/Hang" -Command ${quote(NODE)} -Arguments @('-e', 'setTimeout(function(){}, 120000)') -FailureCode "T_FAILED" -TimeoutSeconds 3 }
$sw.Stop()
Write-Output "ELAPSED=$([int]$sw.Elapsed.TotalSeconds)"
`);
    expect(run.output).toContain("THREW:");
    expect(run.output).toMatch(/did not finish within 3 s/);
    const elapsed = Number(/ELAPSED=(\d+)/.exec(run.output)?.[1] ?? "999");
    expect(elapsed).toBeLessThan(60);
  });

  it("captures stderr as well as stdout, and keeps the real exit code", () => {
    const run = runHarness(`
$threw = $false
try {
  Invoke-ArgusBlockingCommand -Phase "T/Stderr" -Command ${quote(NODE)} -Arguments @('-e', 'process.stderr.write("BOOM-ON-STDERR"); process.stdout.write("HELLO-ON-STDOUT"); process.exit(7)') -FailureCode "T_FAILED" -TimeoutSeconds 60 | Out-Null
} catch { $threw = $true }
$last = Get-ArgusLastCommandResult
$text = $last.Output -join ' '
Write-Output "THREW=$threw EXIT=$($last.ExitCode) STDOUT=$($text -match 'HELLO-ON-STDOUT') STDERR=$($text -match 'BOOM-ON-STDERR')"
`);
    expect(run.output).toContain("THREW=True EXIT=7 STDOUT=True STDERR=True");
  });

  it("redacts credentials from what it logs", () => {
    const run = runHarness(`
Write-Output ("REDACTED=" + (Get-ArgusRedactedText 'postgresql://app_api:sup3rs3cretvalue@127.0.0.1:55432/db'))
Write-Output ("PG=" + (Get-ArgusRedactedText 'PGPASSWORD=sup3rs3cretvalue'))
`);
    expect(run.output).not.toContain("sup3rs3cretvalue");
    expect(run.output).toContain("postgresql://app_api:***@127.0.0.1:55432/db");
    expect(run.output).toContain("PGPASSWORD=***");
  });
});

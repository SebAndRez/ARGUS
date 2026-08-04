import { describe, expect, it } from "vitest";
import {
  FAULT_FIXTURE,
  TEST_REHEARSAL_PS1,
  powershellAvailable,
  quote,
  readRepoText,
  runHarness,
} from "./rehearsalHarnessTestHelpers";

/**
 * tests/database-target/rehearsal-required-docker-skip-fails.test.ts
 *
 * A Docker-gated suite that skipped everything exits 0.
 *
 * That is the shape of the most dangerous false green in this harness: the
 * app_api/access_admin credentials go missing, every gated test skips itself,
 * vitest reports success, and the rehearsal claims the runtime principal was
 * proven. The gated phases therefore tolerate zero skips.
 *
 * Skips are NOT forbidden globally, and that distinction is deliberate: the
 * Fase 17 whole-suite run has the Docker gate deliberately OFF (so the
 * post-rollback residue suites are not run against a fully-applied database),
 * and its skips are documented and allowed. Each phase declares its own budget.
 */

const hasPowerShell = powershellAvailable();
const script = readRepoText(TEST_REHEARSAL_PS1);

const ALL_SKIPPED = `
$out = @(' Test Files  0 passed | 14 skipped (14)', '      Tests  0 passed | 96 skipped (96)')
`;

describe("per-phase skip budgets", () => {
  it("forbids skips in the Docker-gated runtime-principal phase", () => {
    const index = script.indexOf('-Phase "$PhaseScope/AuditWriterPrincipal" -Output');
    expect(index).toBeGreaterThan(-1);
    const block = script.slice(index, index + 400);
    expect(block).toContain("-MaxSkippedFiles 0");
    expect(block).toContain("-MaxSkippedTests 0");
  });

  it("forbids skips in the Docker-gated R31 phase", () => {
    const index = script.indexOf('-Phase "$PhaseScope/IncidentZoneTests" -Output');
    expect(index).toBeGreaterThan(-1);
    const block = script.slice(index, index + 400);
    expect(block).toContain("-MaxSkippedFiles 0");
    expect(block).toContain("-MaxSkippedTests 0");
  });

  it("forbids skips in the canonical P0 phase", () => {
    const index = script.indexOf('$p0Coverage = Assert-ArgusVitestCoverage');
    expect(index).toBeGreaterThan(-1);
    const block = script.slice(index, index + 400);
    expect(block).toContain("-MaxSkippedFiles 0");
    expect(block).toContain("-MaxSkippedTests 0");
  });

  it("permits skips in the Fase 17 whole-suite run, where the gate is off by design", () => {
    const index = script.indexOf("$targetCoverage = Assert-ArgusVitestCoverage");
    expect(index).toBeGreaterThan(-1);
    const block = script.slice(index, index + 400);
    expect(block).not.toContain("-MaxSkippedFiles 0");
    expect(block).toContain("-MinFiles $targetFileCount");
  });
});

describe.skipIf(!hasPowerShell)("a fully-skipped Docker suite is rejected where coverage is mandatory", () => {
  it("rejects an all-skipped suite when the budget is zero", () => {
    const run = runHarness(`${ALL_SKIPPED}
Test-Throws { Assert-ArgusVitestCoverage -Phase "FirstInstall/AuditWriterPrincipal" -Output $out -FailureCode "AUDIT_WRITER_PRINCIPAL_FAIL" -MinFiles 14 -MinTests 1 -MaxSkippedFiles 0 -MaxSkippedTests 0 }
`);
    expect(run.output).toContain("THREW:");
    expect(run.output).toContain("AUDIT_WRITER_PRINCIPAL_FAIL");
    expect(run.output).toMatch(/were SKIPPED but this phase allows at most 0/);
    expect(run.output).toMatch(/Docker coverage this phase requires was not exercised/);
  });

  it("rejects an all-skipped suite for zero executed tests before the skip budget even applies", () => {
    const run = runHarness(`${ALL_SKIPPED}
Test-Throws { Assert-ArgusVitestCoverage -Phase "T" -Output $out -FailureCode "T_FAILED" -MinFiles 14 -MinTests 1 }
`);
    expect(run.output).toContain("THREW:");
    expect(run.output).toMatch(/only 0 test\(s\) actually executed and passed/);
  });

  it("accepts documented skips where the phase's budget permits them", () => {
    const run = runHarness(`
$out = @(' Test Files  80 passed | 32 skipped (112)', '      Tests  881 passed | 443 skipped (1324)')
$s = Assert-ArgusVitestCoverage -Phase "FirstInstall/TargetTests" -Output $out -FailureCode "TARGET_TESTS_FAILED" -MinFiles 112 -MinTests 1
Write-Output "ACCEPTED SKIPPED=$($s.TestsSkipped)"
`);
    expect(run.status).toBe(0);
    expect(run.output).toContain("ACCEPTED SKIPPED=443");
  });

  it("rejects the fixture's all-skipped output end to end, exit code 0 and all", () => {
    const run = runHarness(`
$r = Invoke-ArgusBlockingCommand -Phase "T/Skipped" -Command 'node' -Arguments @(${quote(FAULT_FIXTURE)}, 'skipped') -FailureCode "T_FAILED" -TimeoutSeconds 120
Write-Output "COMMAND_EXIT=$($r.ExitCode)"
Test-Throws { Assert-ArgusVitestCoverage -Phase "T/Skipped" -Output $r.Output -FailureCode "REHEARSAL_REQUIRED_DOCKER_SKIP" -MinFiles 1 -MinTests 1 -MaxSkippedFiles 0 -MaxSkippedTests 0 }
`);
    expect(run.output).toContain("COMMAND_EXIT=0");
    expect(run.output).toContain("THREW:");
    expect(run.output).toContain("REHEARSAL_REQUIRED_DOCKER_SKIP");
  });
});

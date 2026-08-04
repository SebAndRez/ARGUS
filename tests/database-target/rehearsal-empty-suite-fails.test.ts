import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  REPO_ROOT,
  TEST_REHEARSAL_PS1,
  powershellAvailable,
  readRepoText,
  runHarness,
} from "./rehearsalHarnessTestHelpers";

/**
 * tests/database-target/rehearsal-empty-suite-fails.test.ts
 *
 * "vitest exited 0" is not proof that anything ran.
 *
 * A suite that collected zero tests exits 0. A suite whose files were all
 * filtered out by a typo'd glob exits 0. A phase whose gate variable was never
 * set exits 0. None of those is a pass, and none of them is caught by an
 * exit-code check — which is why every blocking phase also declares a
 * structural minimum.
 *
 * The minimum is read from disk, never hardcoded: pinning "expect 881 tests"
 * would be wrong the moment a test is added, and a stale number is how a
 * coverage gate quietly stops gating.
 */

const hasPowerShell = powershellAvailable();
const script = readRepoText(TEST_REHEARSAL_PS1);

const countTestFiles = (relative: string): number =>
  readdirSync(join(REPO_ROOT, relative)).filter((name) => name.endsWith(".test.ts")).length;

describe("structural coverage minimums are derived, not hardcoded", () => {
  it("reads the expected file count from disk for both blocking suites", () => {
    expect(script).toContain('$targetFileCount = Get-ArgusTestFileCount "tests/database-target"');
    expect(script).toContain('$p0FileCount = Get-ArgusTestFileCount "tests/p0"');
    expect(script).toContain("-MinFiles $targetFileCount");
    expect(script).toContain("-MinFiles $p0FileCount");
  });

  it("does not pin a total test count anywhere in the harness", () => {
    // 881 was the target total at the time this was written; it will change.
    expect(script).not.toMatch(/\b881\b/);
    expect(script).not.toMatch(/-MinTests\s+\d{3,}/);
  });

  it("has real suites on disk for the counts to be derived from", () => {
    expect(countTestFiles("tests/p0")).toBeGreaterThan(30);
    expect(countTestFiles("tests/database-target")).toBeGreaterThan(100);
  });
});

describe.skipIf(!hasPowerShell)("Assert-ArgusVitestCoverage — empty and unreported suites", () => {
  const REAL = `
$out = @(' RUN  v4.1.10', '', ' Test Files  80 passed | 32 skipped (112)', '      Tests  881 passed | 443 skipped (1324)')
`;

  it("accepts a suite that genuinely ran", () => {
    const run = runHarness(`${REAL}
$s = Assert-ArgusVitestCoverage -Phase "T" -Output $out -FailureCode "T_FAILED" -MinFiles 112 -MinTests 1
Write-Output "FILES=$($s.FilesTotal) PASSED=$($s.TestsPassed) SKIPPED=$($s.TestsSkipped)"
`);
    expect(run.status).toBe(0);
    expect(run.output).toContain("FILES=112 PASSED=881 SKIPPED=443");
  });

  it("rejects a suite that collected zero tests", () => {
    const run = runHarness(`
$out = @(' Test Files  0 passed (0)', '      Tests  0 passed (0)')
Test-Throws { Assert-ArgusVitestCoverage -Phase "T" -Output $out -FailureCode "T_FAILED" -MinFiles 1 -MinTests 1 }
`);
    expect(run.output).toContain("THREW:");
    expect(run.output).toMatch(/zero tests were collected/);
    expect(run.output).toMatch(/An empty suite is never a pass/);
  });

  it("rejects output with no vitest summary at all", () => {
    const run = runHarness(`
$out = @('some unrelated output', 'no summary here')
Test-Throws { Assert-ArgusVitestCoverage -Phase "T" -Output $out -FailureCode "T_FAILED" -MinFiles 1 -MinTests 1 }
`);
    expect(run.output).toContain("THREW:");
    expect(run.output).toMatch(/never reported a result/);
  });

  it("rejects a run that collected fewer files than exist on disk", () => {
    const run = runHarness(`${REAL}
Test-Throws { Assert-ArgusVitestCoverage -Phase "T" -Output $out -FailureCode "T_FAILED" -MinFiles 113 -MinTests 1 }
`);
    expect(run.output).toContain("THREW:");
    expect(run.output).toMatch(/only 112 test file\(s\) ran, expected at least 113/);
  });

  it("rejects a run that reported failures even if the totals look healthy", () => {
    const run = runHarness(`
$out = @(' Test Files  1 failed | 79 passed (80)', '      Tests  3 failed | 878 passed (881)')
Test-Throws { Assert-ArgusVitestCoverage -Phase "T" -Output $out -FailureCode "T_FAILED" -MinFiles 80 -MinTests 1 }
`);
    expect(run.output).toContain("THREW:");
    expect(run.output).toMatch(/3 test\(s\) in 1 file\(s\) failed/);
  });

  it("rejects a run missing a required marker", () => {
    const run = runHarness(`${REAL}
Test-Throws { Assert-ArgusVitestCoverage -Phase "T" -Output $out -FailureCode "T_FAILED" -MinFiles 1 -MinTests 1 -RequiredMarkers @('SOME_MARKER_PASS') }
`);
    expect(run.output).toContain("THREW:");
    expect(run.output).toMatch(/required marker SOME_MARKER_PASS is missing/);
  });
});

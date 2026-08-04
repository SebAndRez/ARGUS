import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REHEARSAL_DIR,
  REPO_ROOT,
  TEST_REHEARSAL_PS1,
  WORKFLOW_YML,
  readRepoText,
  stripPowerShellComments,
  stripYamlComments,
} from "./rehearsalHarnessTestHelpers";

/**
 * tests/database-target/p0-canonical-command.test.ts
 *
 * "P0 20/20" and "P0 322/322" were both true, and that was the problem.
 *
 * package.json's `test:p0` is `vitest run tests/p0` — the whole directory, 37
 * files, 322 tests. The rehearsal's Fase 17 did NOT use it. It ran:
 *
 *     npx vitest run tests/p0/notifications-endpoint-auth.test.ts \
 *                    tests/p0/risk-assessments-endpoint-auth.test.ts
 *
 * Two files, 20 tests. So a session that ran `npm run test:p0` by hand reported
 * 322/322 while the rehearsal reported 20/20 for a suite it called "P0" — and
 * a failure in any of the other 35 files was invisible to the rehearsal.
 *
 * There is one canonical command now, and both the rehearsal and CI invoke it.
 */

const P0_DIR = join(REPO_ROOT, "tests", "p0");
const packageJson = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
const rehearsalScript = stripPowerShellComments(readRepoText(TEST_REHEARSAL_PS1));
const workflow = readRepoText(WORKFLOW_YML);

const p0Files = readdirSync(P0_DIR).filter((name) => name.endsWith(".test.ts"));

describe("the canonical P0 command", () => {
  it("is a single npm script covering the whole tests/p0 directory", () => {
    expect(packageJson.scripts["test:p0"]).toBe("vitest run tests/p0");
  });

  it("covers far more than the two files the rehearsal used to run", () => {
    // The 20/20 figure came from exactly two of these.
    expect(p0Files.length).toBeGreaterThan(2);
    expect(p0Files).toContain("notifications-endpoint-auth.test.ts");
    expect(p0Files).toContain("risk-assessments-endpoint-auth.test.ts");
    expect(p0Files).toContain("module-access-rbac.test.ts");
  });

  it("is invoked by the rehearsal as `npm run test:p0`", () => {
    expect(rehearsalScript).toContain('-Command "npm" -Arguments @("run", "test:p0")');
  });

  it("is invoked by CI as `npm run test:p0`", () => {
    expect(workflow).toContain("npm run test:p0");
  });

  it("no longer runs a reduced P0 glob anywhere in the harness or CI", () => {
    // Comments are stripped first: several files quote the old two-file command
    // to explain what was wrong with it, and that prose must not be mistaken
    // for the command still being there.
    const reduced = /tests\/p0\/[A-Za-z0-9._-]+\.test\.ts/;
    for (const file of readdirSync(REHEARSAL_DIR, { recursive: true, encoding: "utf8" })) {
      if (!/\.(ps1|mjs|json)$/.test(file)) continue;
      const text = stripPowerShellComments(readFileSync(join(REHEARSAL_DIR, file), "utf8"));
      expect(reduced.test(text), `${file} still names an individual tests/p0 file`).toBe(false);
    }
    expect(
      reduced.test(stripYamlComments(workflow)),
      "the workflow still names an individual tests/p0 file"
    ).toBe(false);
  });
});

describe("the P0 phase is blocking and fully covered", () => {
  it("derives its expected file count from disk instead of hardcoding one", () => {
    expect(rehearsalScript).toContain('$p0FileCount = Get-ArgusTestFileCount "tests/p0"');
    expect(rehearsalScript).toContain("-MinFiles $p0FileCount");
    // Every structural minimum must be a variable or 1 — a literal threshold is
    // a number that goes stale, and a stale threshold stops gating.
    const literals = rehearsalScript.match(/-Min(?:Files|Tests)\s+(\S+)/g) ?? [];
    expect(literals.length).toBeGreaterThan(3);
    for (const literal of literals) {
      const value = literal.split(/\s+/)[1];
      expect(
        value.startsWith("$") || value === "1",
        `${literal} pins a threshold that will go stale`
      ).toBe(true);
    }
  });

  it("tolerates zero skips, because nothing in tests/p0 is Docker-gated", () => {
    const index = rehearsalScript.indexOf("$p0Coverage = Assert-ArgusVitestCoverage");
    const block = rehearsalScript.slice(index, index + 400);
    expect(block).toContain("-MaxSkippedFiles 0");
    expect(block).toContain("-MaxSkippedTests 0");
  });

  it("fails the phase with P0_TESTS_FAILED rather than recording the exit code", () => {
    expect(rehearsalScript).toContain('-FailureCode "P0_TESTS_FAILED"');
    expect(rehearsalScript).not.toContain("$summary.P0TestsExitCode = $LASTEXITCODE");
  });

  it("reports P0_FILES, P0_TESTS, P0_SKIPPED and P0_EXIT_CODE in the summary", () => {
    for (const field of ["P0_FILES", "P0_TESTS", "P0_SKIPPED", "P0_EXIT_CODE"]) {
      expect(rehearsalScript).toContain(`$summary.${field}`);
    }
    expect(rehearsalScript).toContain("P0_CANONICAL_SUITE_PASS");
  });
});

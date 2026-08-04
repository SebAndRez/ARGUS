import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

/**
 * tests/database-target/rehearsalHarnessTestHelpers.ts
 *
 * Lets the rehearsal-harness suites assert BEHAVIOUR rather than grep for
 * strings. Each helper dot-sources scripts/migration-rehearsal/lib/Common.ps1
 * into a real PowerShell process and calls the harness functions for real, so
 * "a command that exits 1 stops the harness" is demonstrated instead of
 * asserted about the source text.
 *
 * No Docker and no database are involved: every function exercised here is
 * pure process/ledger/parsing logic. That is deliberate — the guarantees these
 * suites cover must hold on a laptop with Docker off, not only inside a
 * 40-minute rehearsal.
 */

export const REPO_ROOT = join(__dirname, "..", "..");
export const REHEARSAL_DIR = join(REPO_ROOT, "scripts", "migration-rehearsal");
export const COMMON_PS1 = join(REHEARSAL_DIR, "lib", "Common.ps1");
export const FAULT_FIXTURE = join(REHEARSAL_DIR, "lib", "harness-fault-command.mjs");
export const FULL_REHEARSAL_PS1 = join(REHEARSAL_DIR, "Invoke-ArgusFullRehearsal.ps1");
export const TEST_REHEARSAL_PS1 = join(REHEARSAL_DIR, "Test-ArgusRehearsal.ps1");
export const RESET_REHEARSAL_PS1 = join(REHEARSAL_DIR, "Reset-ArgusRehearsal.ps1");
export const VERIFY_RESULT_MJS = join(REHEARSAL_DIR, "lib", "verify-rehearsal-result.mjs");
export const WORKFLOW_YML = join(REPO_ROOT, ".github", "workflows", "argus-database-rehearsal.yml");

export function readRepoText(path: string): string {
  return readFileSync(path, "utf8");
}

/**
 * PowerShell 5.1 writes a BOM with `Set-Content -Encoding utf8` and PowerShell
 * 7 does not, so an artifact's first byte depends on which interpreter ran.
 */
export function readJsonArtifact(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, ""));
}

/**
 * Strips comments so a source assertion is about the CODE and not about the
 * comment that explains the code. Several of these suites quote the exact
 * defective line they replaced ("$summary.TargetTestsExitCode = $LASTEXITCODE")
 * in a comment, which would otherwise make the assertion fail against itself.
 */
export function stripPowerShellComments(source: string): string {
  return source
    .replace(/<#[\s\S]*?#>/g, "")
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("#"))
    .map((line) => line.replace(/\s+#(?![{}])[^"']*$/, ""))
    .join("\n");
}

export function stripYamlComments(source: string): string {
  return source
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
}

function probe(interpreter: string): boolean {
  const result = spawnSync(interpreter, ["-NoProfile", "-Command", "exit 0"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

let cachedInterpreter: string | null | undefined;

export function powershellInterpreter(): string | null {
  if (cachedInterpreter === undefined) {
    cachedInterpreter = ["pwsh", "powershell"].find(probe) ?? null;
  }
  return cachedInterpreter;
}

export const powershellAvailable = (): boolean => powershellInterpreter() !== null;

export interface HarnessRun {
  status: number;
  stdout: string;
  stderr: string;
  output: string;
}

/**
 * Runs `body` with Common.ps1 already dot-sourced.
 *
 * The harness is redirected at temp directories first, so a test can never
 * clobber a real rehearsal's artifacts and — critically — can never tear down a
 * live rehearsal container: Invoke-ArgusRehearsalTeardown only acts when the
 * local env file exists, and this points that path at a file that does not.
 */
export function runHarness(body: string): HarnessRun {
  const interpreter = powershellInterpreter();
  if (!interpreter) throw new Error("No PowerShell interpreter available");

  const scratch = mkdtempSync(join(tmpdir(), "argus-harness-"));
  const scriptPath = join(scratch, `${randomUUID()}.ps1`);
  const preamble = [
    `$ErrorActionPreference = 'Stop'`,
    `. ${quote(COMMON_PS1)}`,
    `$Script:ArgusArtifactDir = ${quote(join(scratch, "artifacts"))}`,
    `$Script:ArgusPrivateDocsDir = ${quote(join(scratch, "docs"))}`,
    `$Script:ArgusLogDir = ${quote(join(scratch, "logs"))}`,
    `$Script:ArgusEnvLocalFile = ${quote(join(scratch, "no-such-env-file.local"))}`,
    `$Script:ArgusComposeFile = ${quote(join(scratch, "no-such-compose.yml"))}`,
    `$env:ARGUS_HARNESS_SCRATCH = ${quote(scratch)}`,
    `function Test-Throws { param([scriptblock]$Block)`,
    `  try { & $Block | Out-Null; Write-Output "NO_THROW" }`,
    `  catch { Write-Output "THREW: $($_.Exception.Message)" }`,
    `}`,
  ].join("\n");

  writeFileSync(scriptPath, `${preamble}\n${body}\n`, "utf8");
  try {
    const result = spawnSync(
      interpreter,
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
      { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
    );
    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";
    return { status: result.status ?? -1, stdout, stderr, output: `${stdout}\n${stderr}` };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Same as runHarness but keeps the scratch directory alive for the callback so
 * a test can read back the artifacts the harness wrote.
 */
export function runHarnessWithScratch<T>(
  body: (scratch: string) => string,
  inspect: (scratch: string, run: HarnessRun) => T
): T {
  const interpreter = powershellInterpreter();
  if (!interpreter) throw new Error("No PowerShell interpreter available");

  const scratch = mkdtempSync(join(tmpdir(), "argus-harness-"));
  const scriptPath = join(scratch, `${randomUUID()}.ps1`);
  const preamble = [
    `$ErrorActionPreference = 'Stop'`,
    `. ${quote(COMMON_PS1)}`,
    `$Script:ArgusArtifactDir = ${quote(join(scratch, "artifacts"))}`,
    `$Script:ArgusPrivateDocsDir = ${quote(join(scratch, "docs"))}`,
    `$Script:ArgusLogDir = ${quote(join(scratch, "logs"))}`,
    `$Script:ArgusEnvLocalFile = ${quote(join(scratch, "no-such-env-file.local"))}`,
    `$Script:ArgusComposeFile = ${quote(join(scratch, "no-such-compose.yml"))}`,
    `New-Item -ItemType Directory -Force -Path ${quote(join(scratch, "docs"))} | Out-Null`,
  ].join("\n");

  writeFileSync(scriptPath, `${preamble}\n${body(scratch)}\n`, "utf8");
  try {
    const result = spawnSync(
      interpreter,
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
      { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
    );
    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";
    return inspect(scratch, { status: result.status ?? -1, stdout, stderr, output: `${stdout}\n${stderr}` });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Runs verify-rehearsal-result.mjs against an arbitrary artifact. */
export function runResultVerifier(artifact: unknown): { status: number; output: string } {
  const scratch = mkdtempSync(join(tmpdir(), "argus-verify-"));
  const artifactPath = join(scratch, "full-rehearsal-result.json");
  writeFileSync(artifactPath, JSON.stringify(artifact, null, 2), "utf8");
  try {
    const result = spawnSync(process.execPath, [VERIFY_RESULT_MJS, artifactPath], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    return { status: result.status ?? -1, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** A minimal artifact whose every required phase passes. */
export function passingArtifact(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const names = ["FirstInstall/TargetTests", "FirstInstall/P0Tests", "RollbackZeroResidue"];
  return {
    Success: true,
    RequiredPhaseNames: names,
    RequiredPhaseResults: names.map((Name) => ({
      Name,
      Required: true,
      Executed: true,
      ExitCode: 0,
      Passed: true,
      Skipped: false,
      FailureCode: "",
      Evidence: "test fixture",
    })),
    BlockingMarkers: [
      "TARGET_TESTS_BLOCKING_PASS",
      "P0_CANONICAL_SUITE_PASS",
      "REHEARSAL_REQUIRED_PHASES_PASS",
      "REHEARSAL_FAILURE_PROPAGATION_PASS",
    ],
    TargetTestsVerdict: "PASS",
    P0TestsVerdict: "PASS",
    P0_FILES: 37,
    P0_TESTS: 322,
    P0_SKIPPED: 0,
    P0_EXIT_CODE: 0,
    ...overrides,
  };
}

/**
 * Splits the workflow into its steps. The workflow has no YAML dependency in
 * this repo, and the structure being asserted (one `- name:` per step at a
 * fixed indent, with a `run:` block) is stable enough that a parser is honest
 * here — it fails loudly if the shape changes rather than silently matching
 * nothing.
 */
export interface WorkflowStep {
  name: string;
  shell: string | null;
  run: string | null;
  raw: string;
}

export function parseWorkflowSteps(yaml: string): WorkflowStep[] {
  const lines = yaml.split(/\r?\n/);
  const startIndexes: number[] = [];
  lines.forEach((line, index) => {
    if (/^ {6}- name: /.test(line)) startIndexes.push(index);
  });
  return startIndexes.map((start, position) => {
    const end = position + 1 < startIndexes.length ? startIndexes[position + 1] : lines.length;
    const block = lines.slice(start, end);
    const raw = block.join("\n");
    const name = block[0].replace(/^ {6}- name: /, "").trim();
    const shellLine = block.find((line) => /^ {8}shell: /.test(line));
    const shell = shellLine ? shellLine.replace(/^ {8}shell: /, "").trim() : null;

    let run: string | null = null;
    const runIndex = block.findIndex((line) => /^ {8}run: /.test(line));
    if (runIndex >= 0) {
      const runLine = block[runIndex];
      if (runLine.trim() === "run: |") {
        run = block
          .slice(runIndex + 1)
          .filter((line) => line.startsWith("          ") || line.trim() === "")
          .join("\n")
          .trim();
      } else {
        run = runLine.replace(/^ {8}run: /, "").trim();
      }
    }
    return { name, shell, run, raw };
  });
}

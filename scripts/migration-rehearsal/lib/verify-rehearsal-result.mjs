#!/usr/bin/env node
/**
 * scripts/migration-rehearsal/lib/verify-rehearsal-result.mjs
 *
 * Independent verification of a completed rehearsal, read back from the
 * artifact the run itself wrote.
 *
 * The point is that "the rehearsal script exited 0" and "the rehearsal proved
 * what it claims" are different statements. This re-derives the second one from
 * the recorded ledger: Success=true is only accepted when EVERY phase named in
 * RequiredPhaseNames has a row that executed, was not skipped, exited zero and
 * passed, and when every blocking marker is present. A Success=true that is not
 * backed by the full required set is rejected here, which is what stops a
 * future edit from re-introducing "green because the script reached the end".
 *
 * Exit 0 = verified. Exit 1 = rejected, with the reason on stderr.
 *
 * Usage: node scripts/migration-rehearsal/lib/verify-rehearsal-result.mjs [path]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_MARKERS = [
  "TARGET_TESTS_BLOCKING_PASS",
  "P0_CANONICAL_SUITE_PASS",
  "REHEARSAL_REQUIRED_PHASES_PASS",
  "REHEARSAL_FAILURE_PROPAGATION_PASS",
];

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const resultPath =
  process.argv[2] ??
  path.join(repoRoot, "migration-rehearsal-artifacts", "full-rehearsal-result.json");

const failures = [];

if (!fs.existsSync(resultPath)) {
  process.stderr.write(
    `REHEARSAL_RESULT_MISSING - no rehearsal artifact at ${resultPath}. ` +
      "A rehearsal that left no result did not run.\n"
  );
  process.exit(1);
}

let result;
try {
  // Windows PowerShell 5.1's `Set-Content -Encoding utf8` writes a BOM and
  // PowerShell 7's does not, so the artifact's first byte depends on which
  // interpreter ran the rehearsal. JSON.parse rejects a leading BOM outright,
  // which would have made this verifier crash on every Windows-produced
  // artifact — reported as "unreadable" rather than as the pass it was.
  result = JSON.parse(fs.readFileSync(resultPath, "utf8").replace(/^﻿/, ""));
} catch (error) {
  process.stderr.write(`REHEARSAL_RESULT_UNREADABLE - ${resultPath}: ${error.message}\n`);
  process.exit(1);
}

const asArray = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]);

if (result.Success !== true) {
  failures.push(`REHEARSAL_NOT_SUCCESSFUL - Success=${result.Success}: ${result.Error ?? "(no error recorded)"}`);
}

const requiredNames = asArray(result.RequiredPhaseNames);
if (requiredNames.length === 0) {
  failures.push(
    "REHEARSAL_REQUIRED_PHASE_MISSING - the artifact declares no required phases at all, " +
      "so Success=true is not backed by anything."
  );
}

const ledger = new Map(asArray(result.RequiredPhaseResults).map((phase) => [phase.Name, phase]));

for (const name of requiredNames) {
  const phase = ledger.get(name);
  if (!phase) {
    failures.push(`REHEARSAL_REQUIRED_PHASE_MISSING - required phase '${name}' has no row in the ledger.`);
    continue;
  }
  if (phase.Executed !== true) {
    failures.push(`REHEARSAL_REQUIRED_PHASE_MISSING - required phase '${name}' was never executed.`);
  }
  if (phase.Skipped === true) {
    failures.push(`REHEARSAL_REQUIRED_PHASE_SKIPPED - required phase '${name}' was skipped.`);
  }
  if (phase.ExitCode !== 0) {
    failures.push(
      `REHEARSAL_REQUIRED_PHASE_FAILED - required phase '${name}' exited ${phase.ExitCode} (${phase.FailureCode || "no code"}).`
    );
  }
  if (phase.Passed !== true) {
    failures.push(
      `REHEARSAL_REQUIRED_PHASE_FAILED - required phase '${name}' did not pass (${phase.FailureCode || "no code"}).`
    );
  }
  if (phase.Required !== true) {
    failures.push(`REHEARSAL_REQUIRED_PHASE_FAILED - phase '${name}' is required but is recorded as Required=false.`);
  }
}

const markers = asArray(result.BlockingMarkers);
for (const marker of REQUIRED_MARKERS) {
  if (!markers.includes(marker)) {
    failures.push(`REHEARSAL_BLOCKING_SUMMARY_FAIL - marker ${marker} is missing from the rehearsal summary.`);
  }
}

if (result.TargetTestsVerdict !== "PASS") {
  failures.push(`TARGET_TESTS_FAILED - TargetTests=${result.TargetTestsVerdict ?? "NOT RUN"}.`);
}
if (result.P0TestsVerdict !== "PASS") {
  failures.push(`P0_TESTS_FAILED - P0Tests=${result.P0TestsVerdict ?? "NOT RUN"}.`);
}
if (!(Number(result.P0_TESTS) > 0)) {
  failures.push(`P0_TESTS_FAILED - P0_TESTS=${result.P0_TESTS ?? "(absent)"}; an empty P0 suite is never a pass.`);
}
if (Number(result.P0_SKIPPED) !== 0) {
  failures.push(`P0_TESTS_FAILED - P0_SKIPPED=${result.P0_SKIPPED}; nothing in tests/p0 is gated, so a skip means the suite did not run.`);
}

if (failures.length > 0) {
  process.stderr.write("REHEARSAL_VERIFICATION_FAILED\n");
  for (const failure of failures) process.stderr.write(`  - ${failure}\n`);
  process.exit(1);
}

process.stdout.write(
  [
    "REHEARSAL_VERIFIED",
    `  required phases: ${requiredNames.length} declared, all executed, exit 0, passed`,
    `  markers: ${markers.join(", ")}`,
    `  TargetTests=${result.TargetTestsVerdict} P0Tests=${result.P0TestsVerdict}`,
    `  P0_FILES=${result.P0_FILES} P0_TESTS=${result.P0_TESTS} P0_SKIPPED=${result.P0_SKIPPED} P0_EXIT_CODE=${result.P0_EXIT_CODE}`,
    "",
  ].join("\n")
);

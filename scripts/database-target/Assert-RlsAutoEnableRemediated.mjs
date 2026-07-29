#!/usr/bin/env node
// scripts/database-target/Assert-RlsAutoEnableRemediated.mjs
//
// CLI entry point for the rls_auto_enable() cutover guard (see
// lib/rlsAutoEnableGuard.mjs for the pure logic). Never executes the
// function, never connects to production — reads a local, explicit
// evidence JSON file from ARGUS_RLS_AUTO_ENABLE_EVIDENCE_PATH (or
// --evidence <path>). Exits 1 and prints every blocking reason when
// evidence is absent or incomplete; exits 0 only when a human has fully
// captured/reviewed/remediated the function.

import { readFileSync } from "node:fs";
import { evaluateRlsAutoEnableRemediation } from "./lib/rlsAutoEnableGuard.mjs";

function resolveEvidencePath(argv, env) {
  const flagIndex = argv.indexOf("--evidence");
  if (flagIndex !== -1 && argv[flagIndex + 1]) return argv[flagIndex + 1];
  return env.ARGUS_RLS_AUTO_ENABLE_EVIDENCE_PATH ?? null;
}

function loadEvidence(path) {
  if (!path) return null;
  try {
    const raw = readFileSync(path, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    return { __loadError: err instanceof Error ? err.message : String(err) };
  }
}

function main() {
  const path = resolveEvidencePath(process.argv.slice(2), process.env);
  const evidence = loadEvidence(path);

  if (evidence && typeof evidence === "object" && "__loadError" in evidence) {
    process.stderr.write(
      `ARGUS_RLS_AUTO_ENABLE_GUARD_VIOLATION: could not read/parse evidence file at ${JSON.stringify(path)}: ${evidence.__loadError}\n`
    );
    process.exit(1);
  }

  const result = evaluateRlsAutoEnableRemediation(evidence);
  if (!result.ready) {
    process.stderr.write(
      "ARGUS_RLS_AUTO_ENABLE_GUARD_VIOLATION: cutover is NOT ready — rls_auto_enable() not remediated:\n"
    );
    for (const reason of result.blockingReasons) {
      process.stderr.write(`  - ${reason}\n`);
    }
    process.exit(1);
  }

  process.stdout.write("rls_auto_enable() remediation evidence verified — guard passes.\n");
  process.exit(0);
}

main();

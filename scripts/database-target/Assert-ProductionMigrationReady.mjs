#!/usr/bin/env node
// scripts/database-target/Assert-ProductionMigrationReady.mjs
//
// CLI entry point for the drift guard (see lib/driftGuard.mjs for the pure
// logic). Never connects to production — reads a local, explicit evidence
// JSON file from ARGUS_DRIFT_EVIDENCE_PATH (or --evidence <path>). Exits 1
// and prints every blocking reason when evidence is absent or incomplete;
// exits 0 only when a human has fully reconciled the drift.

import { readFileSync } from "node:fs";
import { evaluateDriftReconciliation } from "./lib/driftGuard.mjs";

function resolveEvidencePath(argv, env) {
  const flagIndex = argv.indexOf("--evidence");
  if (flagIndex !== -1 && argv[flagIndex + 1]) return argv[flagIndex + 1];
  return env.ARGUS_DRIFT_EVIDENCE_PATH ?? null;
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
      `ARGUS_DRIFT_GUARD_VIOLATION: could not read/parse evidence file at ${JSON.stringify(path)}: ${evidence.__loadError}\n`
    );
    process.exit(1);
  }

  const result = evaluateDriftReconciliation(evidence);
  if (!result.ready) {
    process.stderr.write("ARGUS_DRIFT_GUARD_VIOLATION: production migration is NOT ready — drift 13/15 not reconciled:\n");
    for (const reason of result.blockingReasons) {
      process.stderr.write(`  - ${reason}\n`);
    }
    process.exit(1);
  }

  process.stdout.write("Drift 13/15 reconciliation evidence verified — guard passes.\n");
  process.exit(0);
}

main();

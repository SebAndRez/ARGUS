#!/usr/bin/env node
// scripts/database-target/Assert-ProductionMigrationReady.mjs
//
// CLI for the legacy `_prisma_migrations` history guard (pure logic in
// lib/driftGuard.mjs). Never connects to production: the production side is a
// read-only snapshot a human captured (ARGUS_DRIFT_EVIDENCE_PATH / --evidence),
// the local side is MEASURED here from prisma/migrations on disk so the
// evidence file cannot misstate it.
//
// Exit 0 only when every check passes. Exit 1 prints each blocking reason.
//
// Evidence file shape (see lib/driftGuard.mjs for the full contract):
// {
//   "capturedAt": "2026-09-21T12:00:00Z",
//   "capturedBy": "ops-lead@example.com",
//   "approvedBy": "db-owner@example.com",
//   "approvedAt": "2026-09-21T12:30:00Z",
//   "productionRows": [
//     { "migrationName": "20260620_init_supabase_postgres", "checksum": "…",
//       "finishedAt": "2026-06-20T…", "rolledBackAt": null, "appliedStepsCount": 1 }
//   ],
//   "acknowledgedChecksumMismatches": [
//     { "migrationName": "20260620_add_external_events_and_reliefweb",
//       "productionChecksum": "3d84d2af…", "localChecksum": "e838a406…",
//       "structuralImpact": "prisma migrate diff: 0 differences",
//       "approvedBy": "db-owner@example.com", "approvedAt": "2026-09-21T12:30:00Z" }
//   ]
// }

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateLegacyMigrationHistory, LEGACY_MIGRATION_HISTORY_CONSTANTS } from "./lib/driftGuard.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "prisma", "migrations");

function resolveEvidencePath(argv, env) {
  const flagIndex = argv.indexOf("--evidence");
  if (flagIndex !== -1 && argv[flagIndex + 1]) return argv[flagIndex + 1];
  return env.ARGUS_DRIFT_EVIDENCE_PATH ?? null;
}

function loadEvidence(path) {
  if (!path) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return { __loadError: err instanceof Error ? err.message : String(err) };
  }
}

/** Measures the local migrations: one entry per folder, checksum = SHA-256 of migration.sql's bytes (Prisma's own definition). */
function measureLocalMigrations() {
  let entries;
  try {
    entries = readdirSync(MIGRATIONS_DIR, { withFileTypes: true });
  } catch (err) {
    process.stderr.write(
      `ARGUS_DRIFT_GUARD_VIOLATION: cannot read ${MIGRATIONS_DIR}: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(1);
  }
  const local = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sqlPath = join(MIGRATIONS_DIR, entry.name, "migration.sql");
    try {
      statSync(sqlPath);
    } catch {
      process.stderr.write(`ARGUS_DRIFT_GUARD_VIOLATION: ${entry.name} has no migration.sql\n`);
      process.exit(1);
    }
    const bytes = readFileSync(sqlPath);
    const lfNormalized = Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
    local.push({
      migrationName: entry.name,
      checksum: createHash("sha256").update(bytes).digest("hex"),
      // Printed for a human comparing a divergence: a checksum that only
      // differs by line endings is a different finding than a different body.
      checksumLfNormalized: createHash("sha256").update(lfNormalized).digest("hex"),
    });
  }
  return local.sort((a, b) => a.migrationName.localeCompare(b.migrationName));
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

  const localMigrations = measureLocalMigrations();
  const merged =
    evidence && typeof evidence === "object"
      ? { ...evidence, localMigrations }
      : evidence;

  const result = evaluateLegacyMigrationHistory(merged);

  process.stdout.write(
    `Local prisma/migrations folders measured: ${localMigrations.length} ` +
      `(Paso 3 measured ${LEGACY_MIGRATION_HISTORY_CONSTANTS.KNOWN_LOCAL_FOLDER_COUNT})\n`
  );
  if (result.summary.checksumMismatches.length > 0) {
    process.stdout.write(`Checksum divergences: ${result.summary.checksumMismatches.join(", ")}\n`);
  }

  if (!result.ready) {
    process.stderr.write(
      "ARGUS_DRIFT_GUARD_VIOLATION: production migration is NOT ready — the legacy `_prisma_migrations` history is not reconciled:\n"
    );
    for (const reason of result.blockingReasons) {
      process.stderr.write(`  - ${reason}\n`);
    }
    process.exit(1);
  }

  process.stdout.write(
    `Legacy migration history reconciled: ${result.summary.appliedNames.length} applied, ` +
      `${result.summary.rolledBackNames.length} rolled-back attempts, 0 unknown names — guard passes.\n`
  );
  process.exit(0);
}

main();

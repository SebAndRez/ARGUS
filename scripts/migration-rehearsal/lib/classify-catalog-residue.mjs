#!/usr/bin/env node
/**
 * scripts/migration-rehearsal/lib/classify-catalog-residue.mjs
 *
 * Reproducible classifier for the Fase 3/4 rollback-residue audit. Takes
 * two catalog-object-inventory.sql outputs (before ANY wave applies, and
 * after a full 100->000 rollback) and classifies every line present in
 * AFTER but absent from BEFORE into one of 6 buckets:
 *
 *   - extension        : `EXTENSION|*` lines — never ARGUS residue by the
 *                         mandate's own rule (postgis/pgcrypto/pg_trgm are
 *                         deliberately never removed by rollback).
 *   - legacy_fixture    : anything in the `public` schema, or a
 *                         `pg_toast.*` index — the synthetic CURRENT-schema
 *                         fixture tables (`User`, `Report`,
 *                         `KnowledgeIncident`, etc., loaded by
 *                         fixtures/000_legacy_synthetic_fixtures.sql to
 *                         give backfill something to read from) and their
 *                         automatic TOAST indexes. ARGUS target rollback
 *                         must never touch these — they are not ARGUS's
 *                         objects, exactly as ARGUS never touches
 *                         `prisma/schema.prisma`'s own tables.
 *   - argus_target      : everything else — a real ARGUS target-schema
 *                         object (ingest/evidence/incident/risk/command/
 *                         governance/migration_meta/etc.) that survived a
 *                         full rollback. This is the ONLY bucket that
 *                         counts toward ARGUS_TARGET_RESIDUAL_OBJECT_COUNT.
 *
 * Usage: node classify-catalog-residue.mjs <before-file> <after-file>
 * Exit code 0 if ARGUS_TARGET_RESIDUAL_OBJECT_COUNT === 0, else 1.
 * Prints a full classified report to stdout either way.
 */

import { readFileSync } from "node:fs";

const [, , beforePath, afterPath] = process.argv;

if (!beforePath || !afterPath) {
  console.error("Usage: node classify-catalog-residue.mjs <before-file> <after-file>");
  process.exit(2);
}

function readLines(path) {
  return new Set(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
  );
}

const before = readLines(beforePath);
const after = readLines(afterPath);

const residualLines = [...after].filter((line) => !before.has(line)).sort();

// Schemas installed BY a PostGIS extension (postgis_tiger_geocoder,
// postgis_topology). Their tables/functions/types are extension-owned, are
// never created or dropped by any ARGUS wave, and per the mandate
// ("Objetos de PostGIS/extensiones no cuentan como residuo ARGUS") never
// count as residue. Listed explicitly rather than inferred so the
// classifier is correct even against an EMPTY baseline (as CI uses).
const EXTENSION_SCHEMAS = new Set(["tiger", "tiger_data", "topology"]);

function classify(line) {
  const [category, rest] = line.split("|");
  if (category === "EXTENSION") return "extension";
  if (rest && EXTENSION_SCHEMAS.has(rest.split(".")[0])) return "extension";
  if (rest && (rest.startsWith("public.") || rest === "public")) return "legacy_fixture";
  if (rest && rest.startsWith("pg_toast.")) return "legacy_fixture";
  // `ROLE|argus_rehearsal_user` is the harness's own connection role, not an
  // ARGUS target object — the 6 ARGUS roles are dropped by 000's rollback.
  if (category === "ROLE" && rest === "argus_rehearsal_user") return "harness";
  return "argus_target";
}

const buckets = { extension: [], legacy_fixture: [], harness: [], argus_target: [] };
for (const line of residualLines) {
  buckets[classify(line)].push(line);
}

console.log("=== Catalog residue classification ===");
console.log(`Total residual lines (AFTER not in BEFORE): ${residualLines.length}`);
console.log("");
console.log(`-- extension (${buckets.extension.length}) — never ARGUS residue --`);
buckets.extension.forEach((l) => console.log(`  ${l}`));
console.log("");
console.log(`-- legacy_fixture (${buckets.legacy_fixture.length}) — synthetic current-schema fixtures + their TOAST, never touched by ARGUS rollback --`);
buckets.legacy_fixture.forEach((l) => console.log(`  ${l}`));
console.log("");
console.log(`-- harness (${buckets.harness.length}) — the rehearsal's own connection role, not an ARGUS object --`);
buckets.harness.forEach((l) => console.log(`  ${l}`));
console.log("");
console.log(`-- argus_target (${buckets.argus_target.length}) — REAL ARGUS residue, must be zero --`);
buckets.argus_target.forEach((l) => console.log(`  ${l}`));
console.log("");
console.log(`ARGUS_TARGET_RESIDUAL_OBJECT_COUNT=${buckets.argus_target.length}`);

process.exit(buckets.argus_target.length === 0 ? 0 : 1);

// scripts/database-target/lib/driftGuard.mjs
//
// The legacy `_prisma_migrations` history guard (Executable Migration Plan
// Fase 11), REWRITTEN in Paso 5 because the previous model of the "13/15
// drift" was wrong in a way that made honest evidence impossible.
//
// What the previous version asserted:
//   * `prisma/migrations/` has 13 folders and production has 15 rows;
//   * therefore at least 2 production rows have NO local folder;
//   * so the evidence must name exactly 2 "unidentified" migration names.
//
// What the Paso 3 preflight actually measured against the real project
// (read-only, ARGUS_SUPABASE_PREFLIGHT_v1.0.md §2):
//   * 15 rows, 13 DISTINCT migration_name values, and every one of the 13 has
//     a local folder — there are ZERO unknown names;
//   * the 2 extra rows are FAILED ATTEMPTS of names that also have a
//     successful row (`rolled_back_at` set, a BOM failure);
//   * 12 of the 13 checksums match the local `migration.sql` byte-for-byte;
//     1 (`20260620_add_external_events_and_reliefweb`) does not match any
//     committed version, i.e. what ran in production was never committed.
//     Structural effect: none (the resulting schema is identical), but that
//     is a human finding, not something a guard may assume.
// So the real risk is not "2 mystery migrations". It is: an applied migration
// with no local folder, a local folder never applied, a still-in-progress
// attempt, or a checksum divergence nobody has acknowledged. This guard checks
// exactly those, per migration name, and requires a signed acknowledgment for
// each divergence instead of a count that can be satisfied by inventing names.
//
// This module NEVER connects to any database. The production side is supplied
// as a snapshot (captured read-only by a human, e.g. the preflight);
// the local side is measured from disk by the CLI. Absent or incomplete
// evidence fails CLOSED.

/** The count Paso 3 measured. Used for a sanity warning, never as the pass condition. */
const KNOWN_LOCAL_FOLDER_COUNT = 13;
const KNOWN_PRODUCTION_ROW_COUNT = 15;
/** Rows beyond the applied set that Paso 3 explained as rolled-back failed attempts. */
const KNOWN_ROLLED_BACK_ROW_COUNT = 2;
/** How old the production snapshot may be before it stops counting as evidence. */
const SNAPSHOT_MAX_AGE_DAYS = 14;

/**
 * @typedef {object} ProductionMigrationRow
 * @property {string} migrationName
 * @property {string} checksum
 * @property {string|null} [finishedAt]   - ISO 8601, or null/absent when never finished.
 * @property {string|null} [rolledBackAt] - ISO 8601 when the attempt was marked rolled back.
 * @property {number} [appliedStepsCount]
 */

/**
 * @typedef {object} LocalMigration
 * @property {string} migrationName
 * @property {string} checksum - SHA-256 of the local migration.sql, measured from disk.
 */

/**
 * @typedef {object} ChecksumAcknowledgement
 * @property {string} migrationName
 * @property {string} productionChecksum
 * @property {string} localChecksum
 * @property {string} structuralImpact - what was verified about the difference (e.g. "prisma migrate diff: 0 differences").
 * @property {string} approvedBy
 * @property {string} approvedAt
 */

/**
 * @typedef {object} LegacyMigrationHistoryEvidence
 * @property {string} capturedAt
 * @property {string} capturedBy
 * @property {ProductionMigrationRow[]} productionRows
 * @property {LocalMigration[]} localMigrations
 * @property {ChecksumAcknowledgement[]} [acknowledgedChecksumMismatches]
 * @property {string} approvedBy
 * @property {string} approvedAt
 */

/**
 * @typedef {object} LegacyMigrationHistoryResult
 * @property {boolean} ready
 * @property {string[]} blockingReasons
 * @property {object} summary
 */

function isIsoDate(value) {
  return typeof value === "string" && value.trim() !== "" && !Number.isNaN(Date.parse(value));
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * @param {unknown} evidence
 * @param {{ now?: Date }} [options]
 * @returns {LegacyMigrationHistoryResult}
 */
export function evaluateLegacyMigrationHistory(evidence, options = {}) {
  const now = options.now ?? new Date();
  const blockingReasons = [];
  const summary = {
    appliedNames: [],
    rolledBackNames: [],
    inProgressNames: [],
    localOnlyNames: [],
    productionOnlyNames: [],
    checksumMismatches: [],
  };

  if (!evidence || typeof evidence !== "object") {
    return {
      ready: false,
      blockingReasons: [
        "no legacy migration-history evidence supplied — failing closed (nothing is known about production's `_prisma_migrations`)",
      ],
      summary,
    };
  }

  const e = /** @type {Partial<LegacyMigrationHistoryEvidence>} */ (evidence);

  if (!nonEmptyString(e.capturedBy)) blockingReasons.push("capturedBy is required — an unattributed snapshot is not evidence");
  if (!isIsoDate(e.capturedAt)) {
    blockingReasons.push("capturedAt must be a valid ISO 8601 timestamp");
  } else {
    const ageDays = (now.getTime() - Date.parse(e.capturedAt)) / 86_400_000;
    if (ageDays < 0) blockingReasons.push("capturedAt is in the future");
    else if (ageDays > SNAPSHOT_MAX_AGE_DAYS) {
      blockingReasons.push(`the production snapshot is ${Math.floor(ageDays)} days old (limit ${SNAPSHOT_MAX_AGE_DAYS})`);
    }
  }
  if (!nonEmptyString(e.approvedBy)) blockingReasons.push("approvedBy is required");
  if (!isIsoDate(e.approvedAt)) blockingReasons.push("approvedAt must be a valid ISO 8601 timestamp");

  const productionRows = Array.isArray(e.productionRows) ? e.productionRows : null;
  const localMigrations = Array.isArray(e.localMigrations) ? e.localMigrations : null;
  if (!productionRows || productionRows.length === 0) {
    blockingReasons.push("productionRows must list every `_prisma_migrations` row (name, checksum, finishedAt, rolledBackAt)");
  }
  if (!localMigrations || localMigrations.length === 0) {
    blockingReasons.push("localMigrations must list every local prisma/migrations folder with its measured checksum");
  }
  if (!productionRows || !localMigrations) {
    return { ready: false, blockingReasons, summary };
  }

  for (const [index, row] of productionRows.entries()) {
    if (!row || typeof row !== "object" || !nonEmptyString(row.migrationName) || !nonEmptyString(row.checksum)) {
      blockingReasons.push(`productionRows[${index}] must have a migrationName and a checksum`);
    }
  }
  for (const [index, local] of localMigrations.entries()) {
    if (!local || typeof local !== "object" || !nonEmptyString(local.migrationName) || !nonEmptyString(local.checksum)) {
      blockingReasons.push(`localMigrations[${index}] must have a migrationName and a checksum`);
    }
  }
  if (blockingReasons.length > 0) {
    return { ready: false, blockingReasons, summary };
  }

  const applied = productionRows.filter((row) => isIsoDate(row.finishedAt) && !isIsoDate(row.rolledBackAt));
  const rolledBack = productionRows.filter((row) => isIsoDate(row.rolledBackAt));
  const inProgress = productionRows.filter((row) => !isIsoDate(row.finishedAt) && !isIsoDate(row.rolledBackAt));

  summary.appliedNames = applied.map((row) => row.migrationName);
  summary.rolledBackNames = rolledBack.map((row) => row.migrationName);
  summary.inProgressNames = inProgress.map((row) => row.migrationName);

  // 1. A row that never finished and was never rolled back means production is
  //    mid-migration (or a failure was never resolved). Nothing else matters
  //    until a human says what happened.
  for (const row of inProgress) {
    blockingReasons.push(
      `production migration ${row.migrationName} is neither finished nor rolled back — the history is in an unresolved state`
    );
  }

  const localByName = new Map(localMigrations.map((local) => [local.migrationName, local]));
  const appliedByName = new Map();
  for (const row of applied) {
    const existing = appliedByName.get(row.migrationName) ?? [];
    existing.push(row);
    appliedByName.set(row.migrationName, existing);
  }

  // 2. Every applied migration must exist locally (an unknown name is the real
  //    "drift" risk: code that does not describe the database it runs against).
  for (const [name] of appliedByName) {
    if (!localByName.has(name)) {
      summary.productionOnlyNames.push(name);
      blockingReasons.push(`production applied migration ${name} has no local prisma/migrations folder`);
    }
  }

  // 3. Every local migration must have exactly one applied row.
  for (const [name] of localByName) {
    const rows = appliedByName.get(name) ?? [];
    if (rows.length === 0) {
      summary.localOnlyNames.push(name);
      blockingReasons.push(`local migration ${name} has no applied row in production`);
    } else if (rows.length > 1) {
      blockingReasons.push(`local migration ${name} has ${rows.length} applied rows in production (expected exactly 1)`);
    }
  }

  // 4. A rolled-back attempt is only benign when the same name also succeeded.
  for (const row of rolledBack) {
    if (!appliedByName.has(row.migrationName)) {
      blockingReasons.push(
        `production has a rolled-back attempt of ${row.migrationName} with no successful row — that migration never applied`
      );
    }
  }

  // 5. Checksum divergence: every one must be acknowledged, by name, with the
  //    two checksums, what was verified about the difference, and a signature.
  //    An acknowledgment for a migration that actually matches is stale and
  //    also blocks, so this list cannot be left behind as permanent cover.
  const acknowledgements = Array.isArray(e.acknowledgedChecksumMismatches) ? e.acknowledgedChecksumMismatches : [];
  const ackByName = new Map();
  for (const [index, ack] of acknowledgements.entries()) {
    if (!ack || typeof ack !== "object" || !nonEmptyString(ack.migrationName)) {
      blockingReasons.push(`acknowledgedChecksumMismatches[${index}] must name a migration`);
      continue;
    }
    ackByName.set(ack.migrationName, ack);
  }

  for (const [name, rows] of appliedByName) {
    const local = localByName.get(name);
    if (!local) continue;
    const row = rows[0];
    if (row.checksum === local.checksum) {
      if (ackByName.has(name)) {
        blockingReasons.push(
          `acknowledgedChecksumMismatches names ${name}, but its production and local checksums are identical — stale acknowledgment`
        );
      }
      continue;
    }
    summary.checksumMismatches.push(name);
    const ack = ackByName.get(name);
    if (!ack) {
      blockingReasons.push(
        `production checksum of ${name} differs from the local migration.sql and is not acknowledged — what ran in production was never committed`
      );
      continue;
    }
    if (ack.productionChecksum !== row.checksum || ack.localChecksum !== local.checksum) {
      blockingReasons.push(`the acknowledgment for ${name} does not quote the two checksums actually observed`);
    }
    if (!nonEmptyString(ack.structuralImpact)) {
      blockingReasons.push(`the acknowledgment for ${name} must state what was verified about the difference (structuralImpact)`);
    }
    if (!nonEmptyString(ack.approvedBy)) blockingReasons.push(`the acknowledgment for ${name} must name an approver`);
    if (!isIsoDate(ack.approvedAt)) blockingReasons.push(`the acknowledgment for ${name} must carry a valid approvedAt`);
  }

  // 6. Sanity check against what Paso 3 measured. A different shape is not
  //    automatically wrong — production moves — but it must be re-attested,
  //    never silently accepted.
  if (productionRows.length !== KNOWN_PRODUCTION_ROW_COUNT || localMigrations.length !== KNOWN_LOCAL_FOLDER_COUNT) {
    if (!nonEmptyString(e.shapeChangeAttestation)) {
      blockingReasons.push(
        `the history no longer matches the measured shape (${KNOWN_LOCAL_FOLDER_COUNT} local folders / ` +
          `${KNOWN_PRODUCTION_ROW_COUNT} production rows, ${KNOWN_ROLLED_BACK_ROW_COUNT} rolled back); ` +
          `got ${localMigrations.length}/${productionRows.length}. Supply shapeChangeAttestation explaining the change.`
      );
    }
  }

  return { ready: blockingReasons.length === 0, blockingReasons, summary };
}

export const LEGACY_MIGRATION_HISTORY_CONSTANTS = {
  KNOWN_LOCAL_FOLDER_COUNT,
  KNOWN_PRODUCTION_ROW_COUNT,
  KNOWN_ROLLED_BACK_ROW_COUNT,
  SNAPSHOT_MAX_AGE_DAYS,
};

// scripts/database-target/lib/driftGuard.mjs
//
// Core, importable logic for the "13 local migration folders vs. 15
// production `_prisma_migrations` rows" drift guard (Executable Migration
// Plan Fase 11). Confirmed by ARGUS_PRISMA_MIGRATION_DRIFT_v1.0.md §3:
// `prisma/migrations/` has 13 folders; the live `_prisma_migrations` table
// has 15 rows; at least 2 rows have no corresponding local folder, and
// their identity is not verifiable without reading production
// `migration_name`/`checksum` columns this guard is never given.
//
// This module NEVER connects to any database. It only validates a future,
// explicitly-supplied evidence file (JSON) proving a human reconciled the
// drift. Absent that file, or with an incomplete one, it fails CLOSED.

const KNOWN_LOCAL_FOLDER_COUNT = 13;
const KNOWN_PRODUCTION_ROW_COUNT = 15;
const KNOWN_UNIDENTIFIED_ROW_COUNT = KNOWN_PRODUCTION_ROW_COUNT - KNOWN_LOCAL_FOLDER_COUNT; // 2

/**
 * @typedef {object} DriftReconciliationEvidence
 * @property {number} localMigrationFolderCount
 * @property {number} productionMigrationRowCount
 * @property {string[]} unidentifiedRowMigrationNames - the migration_name of every production row with no local folder; must have exactly the expected count, never empty while a gap exists.
 * @property {string} reconciliationApprovedBy
 * @property {string} reconciliationApprovedAt - ISO 8601 timestamp
 * @property {string} [reconciliationNotes]
 */

/**
 * @typedef {object} DriftGuardResult
 * @property {boolean} ready
 * @property {string[]} blockingReasons
 */

/**
 * @param {unknown} evidence
 * @returns {DriftGuardResult}
 */
export function evaluateDriftReconciliation(evidence) {
  const blockingReasons = [];

  if (!evidence || typeof evidence !== "object") {
    return {
      ready: false,
      blockingReasons: ["no drift-reconciliation evidence supplied — failing closed (drift 13/15 not reconciled)"],
    };
  }

  const e = /** @type {Partial<DriftReconciliationEvidence>} */ (evidence);

  if (e.localMigrationFolderCount !== KNOWN_LOCAL_FOLDER_COUNT) {
    blockingReasons.push(
      `localMigrationFolderCount must equal the known count of ${KNOWN_LOCAL_FOLDER_COUNT} (got ${JSON.stringify(e.localMigrationFolderCount)})`
    );
  }
  if (e.productionMigrationRowCount !== KNOWN_PRODUCTION_ROW_COUNT) {
    blockingReasons.push(
      `productionMigrationRowCount must equal the known count of ${KNOWN_PRODUCTION_ROW_COUNT} (got ${JSON.stringify(e.productionMigrationRowCount)})`
    );
  }
  if (!Array.isArray(e.unidentifiedRowMigrationNames) || e.unidentifiedRowMigrationNames.length !== KNOWN_UNIDENTIFIED_ROW_COUNT) {
    blockingReasons.push(
      `unidentifiedRowMigrationNames must list exactly ${KNOWN_UNIDENTIFIED_ROW_COUNT} identified migration_name values — the 2 additional production rows must be named, never guessed`
    );
  } else if (e.unidentifiedRowMigrationNames.some((name) => typeof name !== "string" || name.trim() === "")) {
    blockingReasons.push("unidentifiedRowMigrationNames contains an empty/non-string entry — every row must be genuinely identified");
  }
  if (!e.reconciliationApprovedBy || typeof e.reconciliationApprovedBy !== "string") {
    blockingReasons.push("reconciliationApprovedBy is required — an unattributed reconciliation is not accepted");
  }
  if (!e.reconciliationApprovedAt || Number.isNaN(Date.parse(e.reconciliationApprovedAt))) {
    blockingReasons.push("reconciliationApprovedAt must be a valid ISO 8601 timestamp");
  }

  return { ready: blockingReasons.length === 0, blockingReasons };
}

export const DRIFT_GUARD_CONSTANTS = {
  KNOWN_LOCAL_FOLDER_COUNT,
  KNOWN_PRODUCTION_ROW_COUNT,
  KNOWN_UNIDENTIFIED_ROW_COUNT,
};

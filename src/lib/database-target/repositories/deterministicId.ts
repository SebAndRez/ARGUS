/**
 * src/lib/database-target/repositories/deterministicId.ts
 *
 * Target-schema `id` columns are `uuid` (`@db.Uuid`). Wave-3 transformers
 * (`adapters/wave3Transformers.ts`) set `target.id` to the LEGACY row's own
 * id for traceability at the pure-transform layer — but a legacy `cuid()`
 * (e.g. `cljk3n8p90000abc123`) is not a valid UUID and Postgres will reject
 * it against a `uuid` column. This module bridges that gap: it derives a
 * STABLE, deterministic UUID-shaped string from any stable seed (in
 * practice, the transformer's own idempotency key) — the same seed always
 * yields the same id, so a real idempotent `findUnique`-then-`create` is
 * possible at the repository layer, while the original legacy id is still
 * preserved verbatim in the row's `legacy_record_id` column.
 *
 * Not a cryptographic UUIDv5 implementation (no namespace/RFC 4122
 * name-based spec compliance needed here) — just a deterministic,
 * collision-resistant (SHA-256-backed), syntactically valid UUID string.
 */

import { createHash } from "node:crypto";

/** Marks every id produced by this function as deterministically derived (never confused with a real `gen_random_uuid()` value) — nibble `a` in the version position. */
const DETERMINISTIC_VERSION_NIBBLE = "a";

export function uuidFromSeed(seed: string): string {
  const hash = createHash("sha256").update(seed).digest("hex"); // 64 hex chars
  const bytes = hash.slice(0, 32);
  const variantNibble = "89ab"[parseInt(bytes[16], 16) % 4];
  return [
    bytes.slice(0, 8),
    bytes.slice(8, 12),
    DETERMINISTIC_VERSION_NIBBLE + bytes.slice(13, 16),
    variantNibble + bytes.slice(17, 20),
    bytes.slice(20, 32),
  ].join("-");
}

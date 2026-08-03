/**
 * src/lib/database-target/security.ts
 *
 * Target-schema type + integrity-value computation for
 * `security.audit_logs`, as applied by
 * `prisma/target-migrations/010_foundation/migration.sql`. Development/
 * tests only, same as every other file in this directory — never imported
 * by production runtime code.
 *
 * `integrityValue` (D-01, frozen decision register) is a real HMAC-SHA256
 * over a canonical JSON projection of the row's own content — not a
 * fabricated placeholder. The signing key comes from
 * `ARGUS_AUDIT_INTEGRITY_KEY_DEV` when set (local rehearsal convenience);
 * outside that, a fixed, published dev-only string is used, which is fine
 * because this module is never reachable in production (see
 * `client/targetPrismaClient.ts`'s own `NODE_ENV==='production'` guard) —
 * a real KMS-backed key (`integrity_key_id`) is a follow-up for the
 * production audit-log writer, out of scope here.
 */

import { createHmac } from "node:crypto";
import type { ActorType, InformationClassification } from "./shared";

const DEV_ONLY_INTEGRITY_KEY = "argus-dev-only-audit-integrity-key-never-used-in-production";

function resolveIntegrityKey(): string {
  return process.env.ARGUS_AUDIT_INTEGRITY_KEY_DEV ?? DEV_ONLY_INTEGRITY_KEY;
}

/** The subset of `security.audit_logs` columns that participate in the integrity computation — deliberately excludes `id`/`integrityValue` itself (obviously) and `occurredAt` (assigned by the DB's `now()` default, not known at signing time; ordering integrity is instead provided by `sequence_number`, outside this module's concern). */
export interface AuditLogSignableContent {
  actorType: ActorType;
  actorId: string;
  action: string;
  targetTable: string;
  targetId: string;
  classification: InformationClassification;
  context: Record<string, unknown> | null;
  purpose: string | null;
  decision: string | null;
  result: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
}

export interface AuditLogInput extends AuditLogSignableContent {
  correlationId?: string | null;
  incidentId?: string | null;
  /**
   * The instant the audited event occurred — also `security.audit_logs`'
   * partition key. Optional; the canonical writer defaults it to "now" when
   * omitted, so existing callers keep their previous semantics.
   *
   * Deliberately NOT part of `AuditLogSignableContent`: it does not
   * participate in the integrity computation (see that interface's own
   * comment — a verifier recomputing from a stored row signs the content
   * columns only). It IS, however, the value that decides which monthly
   * partition the row lands in, which is why the writer needs it explicitly
   * rather than leaving it to the database's `now()` default.
   */
  occurredAt?: Date;
}

/** `security.audit_logs` row shape this module is prepared to insert. */
export interface AuditLog extends AuditLogInput {
  id: string;
  integrityValue: string;
  integrityAlgorithm: string;
  canonicalizationVersion: number;
  integrityKeyId: string | null;
}

/**
 * Deep, recursive key-sorting so the same logical content always signs to
 * the same value no matter how it was constructed OR how it round-tripped
 * through storage. This recursion is load-bearing, not cosmetic:
 * PostgreSQL's `jsonb` type does NOT preserve the original object-key
 * insertion order (confirmed empirically against the local rehearsal
 * Postgres — it reorders keys by length-then-lexicographic order for its
 * internal binary representation). A verifier that recomputes this value
 * from a freshly-`SELECT`ed `security.audit_logs` row (the only way a real
 * verifier ever would) would see nested objects (`context`/`beforeState`/
 * `afterState`) with DIFFERENT key order than at signing time — sorting
 * only the top-level keys of `AuditLogSignableContent` is not enough, only
 * every nested plain object also being sorted makes verification agree
 * with signing regardless of storage round-trip.
 */
function deepSortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepSortKeys);
  if (value !== null && typeof value === "object") {
    const ordered: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      ordered[key] = deepSortKeys((value as Record<string, unknown>)[key]);
    }
    return ordered;
  }
  return value;
}

function canonicalize(content: AuditLogSignableContent): string {
  const ordered: Record<string, unknown> = {};
  for (const key of Object.keys(content).sort()) {
    ordered[key] = deepSortKeys((content as Record<string, unknown>)[key] ?? null);
  }
  return JSON.stringify(ordered);
}

/** `canonicalization_version` this module produces — bump if `canonicalize`'s shape ever changes. */
export const AUDIT_LOG_CANONICALIZATION_VERSION = 1;

export function computeAuditLogIntegrityValue(content: AuditLogSignableContent): string {
  return createHmac("sha256", resolveIntegrityKey()).update(canonicalize(content)).digest("hex");
}

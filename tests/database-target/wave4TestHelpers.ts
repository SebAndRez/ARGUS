import { randomUUID } from "node:crypto";
import type { TargetPrismaClientLike } from "../../src/lib/database-target/client/targetPrismaClient";

/**
 * tests/database-target/wave4TestHelpers.ts
 *
 * Shared fixtures for the wave-4 Docker integration tests. Same gating
 * convention as `wave3-local-integration.test.ts`: every wave-4 Docker test
 * file checks `wave4ShouldRun` itself and `describe.skipIf`s when it's
 * false, so `npm run db:target:test` stays Docker-independent.
 */
export const wave4ShouldRun = process.env.ARGUS_WAVE3_INTEGRATION_TEST === "true" && Boolean(process.env.TARGET_DATABASE_URL);

function raw(client: TargetPrismaClientLike) {
  return client as unknown as {
    $queryRawUnsafe: <T = unknown>(query: string, ...values: unknown[]) => Promise<T[]>;
    $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<number>;
  };
}

/** The one real `governance.incident_types` row guaranteed to exist after wave 040's own backfill.sql runs — never fabricated, the same fallback the backfill itself uses for unmappable legacy rows. */
export async function getUnclassifiedLegacyIncidentTypeId(client: TargetPrismaClientLike): Promise<string> {
  const rows = await raw(client).$queryRawUnsafe<{ id: string }>(
    `SELECT id FROM governance.incident_types WHERE code = 'UNCLASSIFIED_LEGACY'`
  );
  if (!rows[0]) throw new Error("governance.incident_types UNCLASSIFIED_LEGACY row not found — has wave 040's backfill.sql run?");
  return rows[0].id;
}

export interface TestCandidateOptions {
  status?: "UNDER_ASSESSMENT" | "PROMOTING" | "PROMOTED" | "DISCARDED";
  classification?: string;
}

/** Inserts a fresh, isolated `incident.incident_candidates` row for a single test — real INSERT, no fabricated ids beyond a fresh random UUID. */
export async function insertTestCandidate(client: TargetPrismaClientLike, options: TestCandidateOptions = {}): Promise<string> {
  const id = randomUUID();
  await raw(client).$executeRawUnsafe(
    `INSERT INTO incident.incident_candidates (id, status, classification, created_at)
     VALUES ($1::uuid, $2::incident.incident_candidate_status_enum, $3::security.information_classification_enum, now())`,
    id,
    options.status ?? "UNDER_ASSESSMENT",
    options.classification ?? "OPERATIONAL"
  );
  return id;
}

export interface TestAutomationRuleOptions {
  status?: "PROPOSED" | "APPROVED" | "ACTIVE" | "DEPRECATED";
  confidenceThreshold?: number | null;
  requiredCorroborationCount?: number | null;
  effectiveFrom?: Date;
  effectiveTo?: Date | null;
  linkToIncidentTypeId?: string | null;
}

/** Inserts a fresh `governance.automation_rules` row (+ optional `automation_rule_incident_types` link) for a single test. */
export async function insertTestAutomationRule(client: TargetPrismaClientLike, options: TestAutomationRuleOptions = {}): Promise<string> {
  const id = randomUUID();
  await raw(client).$executeRawUnsafe(
    `INSERT INTO governance.automation_rules
       (id, name, version, status, confidence_threshold, required_corroboration_count, effective_from, effective_to)
     VALUES ($1::uuid, $2, 1, $3::governance.rule_status_enum, $4, $5, $6::timestamptz, $7::timestamptz)`,
    id,
    `Test Automation Rule ${id}`,
    options.status ?? "APPROVED",
    options.confidenceThreshold ?? null,
    options.requiredCorroborationCount ?? null,
    options.effectiveFrom ?? new Date("2026-01-01T00:00:00Z"),
    options.effectiveTo ?? null
  );
  if (options.linkToIncidentTypeId) {
    await raw(client).$executeRawUnsafe(
      `INSERT INTO governance.automation_rule_incident_types (automation_rule_id, incident_type_id) VALUES ($1::uuid, $2::uuid)`,
      id,
      options.linkToIncidentTypeId
    );
  }
  return id;
}

export async function fetchCandidateStatus(client: TargetPrismaClientLike, candidateId: string): Promise<string> {
  const rows = await raw(client).$queryRawUnsafe<{ status: string }>(
    `SELECT status FROM incident.incident_candidates WHERE id = $1::uuid`,
    candidateId
  );
  if (!rows[0]) throw new Error(`candidate ${candidateId} not found`);
  return rows[0].status;
}

export async function countRows(client: TargetPrismaClientLike, table: string, whereSql: string, ...values: unknown[]): Promise<number> {
  const rows = await raw(client).$queryRawUnsafe<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${table} WHERE ${whereSql}`, ...values);
  return Number(rows[0]?.count ?? "0");
}

export function baseProposedProfile(incidentTypeId: string) {
  return {
    incidentTypeId,
    title: "Test wildfire incident",
    description: "Synthetic test description",
    classification: "OPERATIONAL" as const,
    verificationStatus: "CONFIRMED" as const,
    operationalStatus: "ACTIVE" as const,
    preventiveStatus: "NONE" as const,
    trend: "STABLE" as const,
    structuralStatus: "INDEPENDENT" as const,
    confidence: "HIGH" as const,
  };
}

import { afterAll, describe, expect, it } from "vitest";
import { closeTargetPrismaClient, getTargetPrismaClient, type TargetPrismaClientLike } from "../../src/lib/database-target/client/targetPrismaClient";
import { promoteIncidentCandidateHuman, discardIncidentCandidate } from "../../src/lib/database-target/services/incidentPromotionService";
import { computeAuditLogIntegrityValue } from "../../src/lib/database-target/security";
import { randomUUID } from "node:crypto";
import { wave4ShouldRun, getUnclassifiedLegacyIncidentTypeId, insertTestCandidate, baseProposedProfile } from "./wave4TestHelpers";

interface AuditLogRow {
  actor_type: string;
  actor_id: string;
  action: string;
  target_table: string;
  target_id: string;
  classification: string;
  context: unknown;
  purpose: string | null;
  decision: string | null;
  result: string;
  before_state: unknown;
  after_state: unknown;
  integrity_value: string;
  integrity_algorithm: string;
  canonicalization_version: number;
}

function raw(client: TargetPrismaClientLike) {
  return client as unknown as { $queryRawUnsafe: <T>(q: string, ...v: unknown[]) => Promise<T[]> };
}

describe.skipIf(!wave4ShouldRun)("incident promotion — audit log", () => {
  let client: TargetPrismaClientLike;

  afterAll(async () => {
    await closeTargetPrismaClient();
  });

  it("writes exactly one AuditLog row per promotion with a verifiable HMAC integrity_value", async () => {
    client = await getTargetPrismaClient();
    const incidentTypeId = await getUnclassifiedLegacyIncidentTypeId(client);
    const candidateId = await insertTestCandidate(client);
    const actorId = randomUUID();

    const promotion = await promoteIncidentCandidateHuman(client, {
      incidentCandidateId: candidateId,
      idempotencyKey: randomUUID(),
      decidedByActorId: actorId,
      explanation: "audit log verification",
      ...baseProposedProfile(incidentTypeId),
    });

    const rows = await raw(client).$queryRawUnsafe<AuditLogRow>(
      `SELECT actor_type, actor_id, action, target_table, target_id, classification, context, purpose, decision, result,
              before_state, after_state, integrity_value, integrity_algorithm, canonicalization_version
       FROM security.audit_logs WHERE target_id = $1::uuid AND action = 'INCIDENT_CANDIDATE_PROMOTED'`,
      promotion.incidentId
    );

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.actor_type).toBe("PERSON");
    expect(row.actor_id).toBe(actorId);
    expect(row.result).toBe("SUCCESS");
    expect(row.integrity_algorithm).toBe("HMAC-SHA256");

    const recomputed = computeAuditLogIntegrityValue({
      actorType: row.actor_type as "PERSON",
      actorId: row.actor_id,
      action: row.action,
      targetTable: row.target_table,
      targetId: row.target_id,
      classification: row.classification as "OPERATIONAL",
      context: row.context as Record<string, unknown> | null,
      purpose: row.purpose,
      decision: row.decision,
      result: row.result,
      beforeState: row.before_state as Record<string, unknown> | null,
      afterState: row.after_state as Record<string, unknown> | null,
    });
    expect(row.integrity_value).toBe(recomputed);
  });

  it("writes exactly one AuditLog row per discard", async () => {
    client = await getTargetPrismaClient();
    const candidateId = await insertTestCandidate(client);
    await discardIncidentCandidate(client, {
      incidentCandidateId: candidateId,
      decidedByActorType: "PERSON",
      decidedByActorId: randomUUID(),
      reason: "audit log verification",
    });

    const rows = await raw(client).$queryRawUnsafe<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM security.audit_logs WHERE target_id = $1::uuid AND action = 'INCIDENT_CANDIDATE_DISCARDED'`,
      candidateId
    );
    expect(rows[0].count).toBe("1");
  });
});

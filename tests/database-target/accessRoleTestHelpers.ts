import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getTargetPrismaClient,
  getTargetAdminPrismaClient,
  getTargetRuntimePrismaClient,
  type TargetPrismaClientLike,
} from "../../src/lib/database-target/client/targetPrismaClient";
import type { RawSqlClient } from "../../src/lib/database-target/repositories/incidentPromotionRepository";

/**
 * tests/database-target/accessRoleTestHelpers.ts
 *
 * Shared plumbing for the AccessSubject / AccessRoleAssignment /
 * audit-writer-principal suites.
 *
 * Three DIFFERENT principals, deliberately:
 *   * owner   (TARGET_DATABASE_URL)          — fixture setup only. It is the
 *     migration credential (superuser in the rehearsal), so nothing under test
 *     ever runs on it; using it for assertions is what previously made every
 *     RLS/grant claim unfalsifiable.
 *   * runtime (TARGET_RUNTIME_DATABASE_URL)  — app_api. Everything that claims
 *     to be "the runtime" runs here.
 *   * admin   (TARGET_ADMIN_DATABASE_URL)    — access_admin. Only grant/revoke.
 */
export const accessRoleDockerShouldRun =
  process.env.ARGUS_WAVE3_INTEGRATION_TEST === "true" &&
  Boolean(process.env.TARGET_DATABASE_URL) &&
  Boolean(process.env.TARGET_RUNTIME_DATABASE_URL) &&
  Boolean(process.env.TARGET_ADMIN_DATABASE_URL);

const REPO_ROOT = join(__dirname, "..", "..");

export function readRepoFile(...segments: string[]): string {
  return readFileSync(join(REPO_ROOT, ...segments), "utf8");
}

export function raw(client: TargetPrismaClientLike): RawSqlClient {
  return client as unknown as RawSqlClient;
}

export const ownerClient = (): Promise<TargetPrismaClientLike> => getTargetPrismaClient();
export const runtimeClient = (): Promise<TargetPrismaClientLike> => getTargetRuntimePrismaClient();
export const adminClient = (): Promise<TargetPrismaClientLike> => getTargetAdminPrismaClient();

export interface AccessFixture {
  personAId: string;
  personBId: string;
  orgAId: string;
  orgBId: string;
  subjectAId: string;
  subjectBId: string;
  systemSubjectId: string;
  emergencyBasisActiveId: string;
  emergencyBasisDeprecatedId: string;
  /** Prefix every fixture row carries, so cleanup is exact and never touches another suite's data. */
  tag: string;
}

/**
 * Creates an isolated fixture set (2 people, 2 institutions, 3 subjects, 2
 * emergency bases) via the OWNER client and the canonical registration
 * function. Every id is fresh per call, so suites running in parallel cannot
 * collide on the partial unique indexes.
 */
export async function createAccessFixture(tag: string): Promise<AccessFixture> {
  const owner = raw(await ownerClient());
  const personAId = randomUUID();
  const personBId = randomUUID();
  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const emergencyBasisActiveId = randomUUID();
  const emergencyBasisDeprecatedId = randomUUID();

  await owner.$executeRawUnsafe(
    `INSERT INTO identity.people (id, legal_name) VALUES ($1::uuid, $3), ($2::uuid, $4)`,
    personAId,
    personBId,
    `${tag} Person A`,
    `${tag} Person B`
  );
  await owner.$executeRawUnsafe(
    `INSERT INTO institution.organizations (id, name, status) VALUES ($1::uuid, $3, 'ACTIVE'), ($2::uuid, $4, 'ACTIVE')`,
    orgAId,
    orgBId,
    `${tag} Institution A`,
    `${tag} Institution B`
  );
  await owner.$executeRawUnsafe(
    `INSERT INTO governance.emergency_bases (id, category, description, max_access_duration, status)
     VALUES ($1::uuid, 'LIFE_THREATENING', $3, interval '2 hours', 'ACTIVE'),
            ($2::uuid, 'OTHER', $4, interval '2 hours', 'DEPRECATED')`,
    emergencyBasisActiveId,
    emergencyBasisDeprecatedId,
    `${tag} active basis`,
    `${tag} deprecated basis`
  );

  const subjectAId = await registerSubjectAsOwner({ subjectType: "PERSON", personId: personAId });
  const subjectBId = await registerSubjectAsOwner({ subjectType: "PERSON", personId: personBId });
  const systemSubjectId = await registerSubjectAsOwner({
    subjectType: "SYSTEM",
    systemKey: `ARGUS_TEST_${tag.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 40)}`,
  });

  return {
    personAId,
    personBId,
    orgAId,
    orgBId,
    subjectAId,
    subjectBId,
    systemSubjectId,
    emergencyBasisActiveId,
    emergencyBasisDeprecatedId,
    tag,
  };
}

export async function registerSubjectAsOwner(input: {
  subjectType: "PERSON" | "ORGANIZATION" | "SYSTEM" | "AUTOMATION_RULE" | "ANONYMOUS";
  personId?: string;
  organizationId?: string;
  automationRuleId?: string;
  systemKey?: string;
}): Promise<string> {
  const owner = raw(await ownerClient());
  const rows = await owner.$queryRawUnsafe<{ id: string }>(
    `SELECT security.fn_register_access_subject($1::security.actor_type_enum, $2::uuid, $3::uuid, $4::uuid, $5::varchar) AS id`,
    input.subjectType,
    input.personId ?? null,
    input.organizationId ?? null,
    input.automationRuleId ?? null,
    input.systemKey ?? null
  );
  return rows[0]!.id;
}

/** Removes everything a fixture created, in FK-safe order. Assignments are deleted here (not revoked) because this is teardown, not a domain operation. */
export async function dropAccessFixture(fixture: AccessFixture): Promise<void> {
  const owner = raw(await ownerClient());
  const subjectIds = [fixture.subjectAId, fixture.subjectBId, fixture.systemSubjectId];
  await owner.$executeRawUnsafe(
    `DELETE FROM security.access_role_assignments
      WHERE access_subject_id = ANY($1::uuid[]) OR granted_by_subject_id = ANY($1::uuid[]) OR revoked_by_subject_id = ANY($1::uuid[])`,
    subjectIds
  );
  await owner.$executeRawUnsafe(`DELETE FROM security.access_subjects WHERE id = ANY($1::uuid[])`, subjectIds);
  await owner.$executeRawUnsafe(
    `DELETE FROM governance.emergency_bases WHERE id = ANY($1::uuid[])`,
    [fixture.emergencyBasisActiveId, fixture.emergencyBasisDeprecatedId]
  );
  await owner.$executeRawUnsafe(`DELETE FROM institution.organizations WHERE id = ANY($1::uuid[])`, [
    fixture.orgAId,
    fixture.orgBId,
  ]);
  await owner.$executeRawUnsafe(`DELETE FROM identity.people WHERE id = ANY($1::uuid[])`, [
    fixture.personAId,
    fixture.personBId,
  ]);
}

export type Classification = "PUBLIC" | "OPERATIONAL" | "SENSITIVE" | "RESTRICTED" | "CRITICAL";

/** The five labels that actually exist in security.information_classification_enum. There is no INTERNAL label in the target schema, so none is invented in these suites. */
export const CLASSIFICATIONS: Classification[] = ["PUBLIC", "OPERATIONAL", "SENSITIVE", "RESTRICTED", "CRITICAL"];

export interface AskContext {
  actorId: string;
  accessSubjectId?: string;
  institutionId?: string;
  purpose?:
    | "GENERAL"
    | "OPERATIONAL_RESPONSE"
    | "AUDIT_REVIEW"
    | "SECURITY_REVIEW"
    | "ADMINISTRATION"
    | "EMERGENCY_ASSISTANCE";
  emergencyBasisId?: string;
  /** Set the legacy session role GUC anyway, to prove it changes nothing. */
  forgedActorRole?: string;
}

/**
 * Asks `security.fn_classification_allowed` AS THE RUNTIME PRINCIPAL (app_api),
 * inside a transaction carrying the given context. Every classification test
 * goes through here so no suite can accidentally answer the question as the
 * owner, where RLS and grants do not apply.
 */
export async function askClassificationAllowed(
  ctx: AskContext,
  classification: Classification
): Promise<boolean> {
  const runtime = await runtimeClient();
  const transactional = runtime as unknown as {
    $transaction: <T>(fn: (tx: RawSqlClient) => Promise<T>) => Promise<T>;
  };
  return transactional.$transaction(async (tx) => {
    await tx.$queryRawUnsafe(
      `SELECT set_config('argus.actor_id', $1, true),
              set_config('argus.access_subject_id', $2, true),
              set_config('argus.institution_id', $3, true),
              set_config('argus.purpose', $4, true),
              set_config('argus.emergency_basis_id', $5, true),
              set_config('argus.actor_role', $6, true)`,
      ctx.actorId,
      ctx.accessSubjectId ?? "",
      ctx.institutionId ?? "",
      ctx.purpose ?? "",
      ctx.emergencyBasisId ?? "",
      ctx.forgedActorRole ?? ""
    );
    const rows = await tx.$queryRawUnsafe<{ allowed: boolean }>(
      `SELECT security.fn_classification_allowed($1::uuid, $2::security.information_classification_enum) AS allowed`,
      ctx.actorId,
      classification
    );
    return Boolean(rows[0]!.allowed);
  });
}

/** Same, for the role-code predicate the migrated policies use. */
export async function askHasAccessRole(ctx: AskContext, codes: string[]): Promise<boolean> {
  const runtime = await runtimeClient();
  const transactional = runtime as unknown as {
    $transaction: <T>(fn: (tx: RawSqlClient) => Promise<T>) => Promise<T>;
  };
  return transactional.$transaction(async (tx) => {
    await tx.$queryRawUnsafe(
      `SELECT set_config('argus.actor_id', $1, true),
              set_config('argus.institution_id', $2, true),
              set_config('argus.purpose', $3, true),
              set_config('argus.emergency_basis_id', $4, true),
              set_config('argus.actor_role', $5, true)`,
      ctx.actorId,
      ctx.institutionId ?? "",
      ctx.purpose ?? "",
      ctx.emergencyBasisId ?? "",
      ctx.forgedActorRole ?? ""
    );
    const rows = await tx.$queryRawUnsafe<{ allowed: boolean }>(
      `SELECT security.fn_has_access_role($1::uuid, $2::text[]) AS allowed`,
      ctx.actorId,
      codes
    );
    return Boolean(rows[0]!.allowed);
  });
}

/** Roles seeded by 010_foundation/backfill.sql, with the ceiling each carries. */
export const SEEDED_ROLE_CEILINGS = {
  PUBLIC_VIEWER: "PUBLIC",
  OPERATIONAL_RESPONDER: "OPERATIONAL",
  SENSITIVE_HANDLER: "SENSITIVE",
  RESTRICTED_ANALYST: "RESTRICTED",
  AUDIT_READER: "RESTRICTED",
  OPERATIONAL: "CRITICAL",
  ADMIN: "CRITICAL",
  AUDIT: "CRITICAL",
  SECURITY: "CRITICAL",
  SYSTEM: "CRITICAL",
} as const;

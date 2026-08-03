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
 * tests/database-target/incidentZoneTestHelpers.ts
 *
 * Shared plumbing for the R31 suites — the persisted path
 *
 *   incident -> operational zone -> jurisdiction -> command scope
 *
 * Three DIFFERENT principals, for the same reason as
 * `accessRoleTestHelpers.ts`:
 *   * owner   (TARGET_DATABASE_URL)         — FIXTURE SETUP ONLY. It is the
 *     migration credential (superuser in the rehearsal), so nothing under test
 *     ever runs on it; asserting through it is what makes an RLS/grant claim
 *     unfalsifiable.
 *   * runtime (TARGET_RUNTIME_DATABASE_URL) — app_api. Everything that claims
 *     to be "the runtime" runs here.
 *   * admin   (TARGET_ADMIN_DATABASE_URL)   — access_admin. The ONLY principal
 *     that may confirm a COMMAND assignment.
 */
export const incidentZoneDockerShouldRun =
  process.env.ARGUS_WAVE3_INTEGRATION_TEST === "true" &&
  Boolean(process.env.TARGET_DATABASE_URL) &&
  Boolean(process.env.TARGET_RUNTIME_DATABASE_URL) &&
  Boolean(process.env.TARGET_ADMIN_DATABASE_URL);

const REPO_ROOT = join(__dirname, "..", "..");

export function readRepoFile(...segments: string[]): string {
  return readFileSync(join(REPO_ROOT, ...segments), "utf8");
}

export const WAVE_080 = ["prisma", "target-migrations", "080_geography"] as const;

export function raw(client: TargetPrismaClientLike): RawSqlClient {
  return client as unknown as RawSqlClient;
}

export const ownerClient = (): Promise<TargetPrismaClientLike> => getTargetPrismaClient();
export const runtimeClient = (): Promise<TargetPrismaClientLike> => getTargetRuntimePrismaClient();
export const adminClient = (): Promise<TargetPrismaClientLike> => getTargetAdminPrismaClient();

interface TransactionalClient {
  $transaction: <T>(fn: (tx: RawSqlClient) => Promise<T>) => Promise<T>;
}

/** Runs `fn` inside a transaction on `client`, with `argus.actor_id` bound — the binding every R31 helper answers against. */
export async function withActor<T>(
  client: TargetPrismaClientLike,
  actorId: string,
  fn: (tx: RawSqlClient) => Promise<T>,
  extra?: { institutionId?: string; purpose?: string; forgedActorRole?: string; declaredSubjectId?: string }
): Promise<T> {
  return (client as unknown as TransactionalClient).$transaction(async (tx) => {
    await tx.$queryRawUnsafe(
      `SELECT set_config('argus.actor_id', $1, true),
              set_config('argus.access_subject_id', $2, true),
              set_config('argus.institution_id', $3, true),
              set_config('argus.purpose', $4, true),
              set_config('argus.actor_role', $5, true)`,
      actorId,
      extra?.declaredSubjectId ?? "",
      extra?.institutionId ?? "",
      extra?.purpose ?? "",
      extra?.forgedActorRole ?? ""
    );
    return fn(tx);
  });
}

export interface IncidentZoneFixture {
  tag: string;
  /** Actor A: current membership in institution A, command role scoped to jurisdiction A. */
  personAId: string;
  /** Actor B: current membership in institution B, command role scoped to jurisdiction B. */
  personBId: string;
  subjectAId: string;
  subjectBId: string;
  orgAId: string;
  orgBId: string;
  membershipAId: string;
  membershipBId: string;
  areaKindId: string;
  areaAId: string;
  areaBId: string;
  jurisdictionAId: string;
  jurisdictionBId: string;
  /** Zone in jurisdiction A. */
  zoneAId: string;
  /** Zone in jurisdiction B. */
  zoneBId: string;
  /** Zone straddling A and B, related to BOTH jurisdictions. */
  zoneCrossId: string;
  /** Zone with NO jurisdiction assignment at all. */
  zoneOrphanId: string;
  incidentTypeId: string;
  /** Owns the zones (geo.operational_zones.incident_id is NOT NULL). */
  zoneOwnerIncidentId: string;
  /** Four incidents under test. */
  incidentPrimaryId: string;
  incidentAffectedId: string;
  incidentCommandId: string;
  incidentSpatialId: string;
  /** Command role of actor A on the COMMAND incident. */
  commandRoleAId: string;
  /** Command role of actor B on the COMMAND incident (institution/jurisdiction mismatch). */
  commandRoleBId: string;
  commandScopeAId: string;
  commandScopeBId: string;
  /** The ACTIVE COMMAND assignment on `incidentCommandId`. */
  commandAssignmentId: string;
  primaryAssignmentId: string;
  affectedAssignmentId: string;
  automationRuleUnauthorizedId: string;
  automationRuleAuthorizedId: string;
}

const KIND_CODE_PREFIX = "R31_TEST_";

/**
 * Builds the full mandated fixture through the OWNER client: 2 jurisdictions,
 * 4 operational zones, 2 institutions, 2 actors, a current membership and an
 * expired one, a valid command role and a mismatched one, and 4 incidents
 * (PRIMARY only / AFFECTED only / COMMAND in jurisdiction A / spatial).
 *
 * Every id is fresh per call, so suites running in parallel cannot collide on
 * the partial unique indexes.
 */
export async function createIncidentZoneFixture(tag: string): Promise<IncidentZoneFixture> {
  const owner = raw(await ownerClient());
  const f: IncidentZoneFixture = {
    tag,
    personAId: randomUUID(),
    personBId: randomUUID(),
    subjectAId: "",
    subjectBId: "",
    orgAId: randomUUID(),
    orgBId: randomUUID(),
    membershipAId: randomUUID(),
    membershipBId: randomUUID(),
    areaKindId: "",
    areaAId: randomUUID(),
    areaBId: randomUUID(),
    jurisdictionAId: randomUUID(),
    jurisdictionBId: randomUUID(),
    zoneAId: randomUUID(),
    zoneBId: randomUUID(),
    zoneCrossId: randomUUID(),
    zoneOrphanId: randomUUID(),
    incidentTypeId: randomUUID(),
    zoneOwnerIncidentId: randomUUID(),
    incidentPrimaryId: randomUUID(),
    incidentAffectedId: randomUUID(),
    incidentCommandId: randomUUID(),
    incidentSpatialId: randomUUID(),
    commandRoleAId: randomUUID(),
    commandRoleBId: randomUUID(),
    commandScopeAId: randomUUID(),
    commandScopeBId: randomUUID(),
    commandAssignmentId: randomUUID(),
    primaryAssignmentId: randomUUID(),
    affectedAssignmentId: randomUUID(),
    automationRuleUnauthorizedId: randomUUID(),
    automationRuleAuthorizedId: randomUUID(),
  };

  // Coordinates are pushed far away from every other suite's fixture so two
  // parallel runs cannot intersect each other's zones and turn a NO_MATCH
  // assertion into a MULTIPLE_MATCHES one.
  const lon = 100 + (hash(tag) % 60);
  const lat = 10 + (hash(tag + "y") % 40);

  await owner.$executeRawUnsafe(
    `INSERT INTO identity.people (id, legal_name) VALUES ($1::uuid, $3), ($2::uuid, $4)`,
    f.personAId,
    f.personBId,
    `${tag} Actor A`,
    `${tag} Actor B`
  );
  await owner.$executeRawUnsafe(
    `INSERT INTO institution.organizations (id, name, status)
     VALUES ($1::uuid, $3, 'ACTIVE'), ($2::uuid, $4, 'ACTIVE')`,
    f.orgAId,
    f.orgBId,
    `${tag} Institution A`,
    `${tag} Institution B`
  );
  await owner.$executeRawUnsafe(
    `INSERT INTO institution.institutional_memberships
       (id, person_id, organization_id, role_label, status, effective_from, effective_to)
     VALUES ($1::uuid, $3::uuid, $5::uuid, 'Coordinator', 'ACTIVE', now() - interval '2 days', NULL),
            ($2::uuid, $4::uuid, $6::uuid, 'Coordinator', 'ACTIVE', now() - interval '2 days', NULL)`,
    f.membershipAId,
    f.membershipBId,
    f.personAId,
    f.personBId,
    f.orgAId,
    f.orgBId
  );

  f.subjectAId = await registerSubject(owner, f.personAId);
  f.subjectBId = await registerSubject(owner, f.personBId);
  // Both actors carry a real, persisted OPERATIONAL grant, so every denial in
  // the suites is provably about JURISDICTION and not about missing clearance.
  await owner.$queryRawUnsafe(`SELECT security.fn_grant_access_role($1::uuid, 'OPERATIONAL')`, f.subjectAId);
  await owner.$queryRawUnsafe(`SELECT security.fn_grant_access_role($1::uuid, 'OPERATIONAL')`, f.subjectBId);

  // The code is UNIQUE and the kind is a catalog row, so it carries a random
  // suffix AND is torn down: a fixed per-tag code would collide with any
  // earlier run of the same suite that left the row behind.
  const kindId = randomUUID();
  f.areaKindId = kindId;
  await owner.$executeRawUnsafe(
    `INSERT INTO governance.administrative_area_kinds (id, code, name, hierarchy_level, status)
     VALUES ($1::uuid, $2, $3, 1, 'ACTIVE')`,
    kindId,
    `${KIND_CODE_PREFIX}${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`,
    `${tag} Kind`
  );
  await owner.$executeRawUnsafe(
    `INSERT INTO geo.administrative_areas (id, name, area_kind_id, boundary, version) VALUES
       ($1::uuid, $3, $5::uuid, ST_GeogFromText($6), 1),
       ($2::uuid, $4, $5::uuid, ST_GeogFromText($7), 1)`,
    f.areaAId,
    f.areaBId,
    `${tag} Area A`,
    `${tag} Area B`,
    kindId,
    multiPolygon(lon, lat, lon + 1, lat + 1),
    multiPolygon(lon + 1, lat, lon + 2, lat + 1)
  );
  await owner.$executeRawUnsafe(
    `INSERT INTO governance.jurisdictions
       (id, name, primary_administrative_area_id, declaring_organization_id, version, effective_from) VALUES
       ($1::uuid, $3, $5::uuid, $7::uuid, 1, now() - interval '10 days'),
       ($2::uuid, $4, $6::uuid, $8::uuid, 1, now() - interval '10 days')`,
    f.jurisdictionAId,
    f.jurisdictionBId,
    `${tag} Jurisdiction A`,
    `${tag} Jurisdiction B`,
    f.areaAId,
    f.areaBId,
    f.orgAId,
    f.orgBId
  );

  await owner.$executeRawUnsafe(
    `INSERT INTO governance.automation_rules (id, name, status, command_scope_authorized) VALUES
       ($1::uuid, $3, 'ACTIVE', false),
       ($2::uuid, $4, 'ACTIVE', true)`,
    f.automationRuleUnauthorizedId,
    f.automationRuleAuthorizedId,
    `${tag} Rule (not command-authorized)`,
    `${tag} Rule (command-authorized)`
  );

  const categoryId = randomUUID();
  await owner.$executeRawUnsafe(
    `INSERT INTO governance.incident_categories (id, code, name) VALUES ($1::uuid, $2, $3)`,
    categoryId,
    `R31_CAT_${randomUUID().slice(0, 8)}`,
    `${tag} Category`
  );
  await owner.$executeRawUnsafe(
    `INSERT INTO governance.incident_types (id, code, incident_category_id) VALUES ($1::uuid, $2, $3::uuid)`,
    f.incidentTypeId,
    `R31_TYPE_${randomUUID().slice(0, 8)}`,
    categoryId
  );
  await owner.$executeRawUnsafe(
    `INSERT INTO incident.incidents (id, incident_type_id, classification, title) VALUES
       ($1::uuid, $5::uuid, 'CRITICAL', $6), ($2::uuid, $5::uuid, 'CRITICAL', $7),
       ($3::uuid, $5::uuid, 'CRITICAL', $8), ($4::uuid, $5::uuid, 'CRITICAL', $9),
       ($10::uuid, $5::uuid, 'CRITICAL', $11)`,
    f.zoneOwnerIncidentId,
    f.incidentPrimaryId,
    f.incidentAffectedId,
    f.incidentCommandId,
    f.incidentTypeId,
    `${tag} Zone Owner`,
    `${tag} PRIMARY only`,
    `${tag} AFFECTED only`,
    `${tag} COMMAND in A`,
    f.incidentSpatialId,
    `${tag} Spatial`
  );

  await owner.$executeRawUnsafe(
    `INSERT INTO geo.operational_zones (id, incident_id, boundary, status) VALUES
       ($1::uuid, $5::uuid, ST_GeogFromText($6), 'ACTIVE'),
       ($2::uuid, $5::uuid, ST_GeogFromText($7), 'ACTIVE'),
       ($3::uuid, $5::uuid, ST_GeogFromText($8), 'ACTIVE'),
       ($4::uuid, $5::uuid, ST_GeogFromText($9), 'ACTIVE')`,
    f.zoneAId,
    f.zoneBId,
    f.zoneCrossId,
    f.zoneOrphanId,
    f.zoneOwnerIncidentId,
    polygon(lon + 0.1, lat + 0.1, lon + 0.9, lat + 0.9),
    polygon(lon + 1.1, lat + 0.1, lon + 1.9, lat + 0.9),
    polygon(lon + 0.8, lat + 0.2, lon + 1.2, lat + 0.8),
    polygon(lon + 5.1, lat + 5.1, lon + 5.9, lat + 5.9)
  );

  // zoneOrphan deliberately gets NO jurisdiction assignment.
  await owner.$executeRawUnsafe(
    `INSERT INTO geo.operational_zone_jurisdiction_assignments
       (id, operational_zone_id, jurisdiction_id, relation_kind, status, valid_from, provenance) VALUES
       (gen_random_uuid(), $1::uuid, $4::uuid, 'PRIMARY',     'ACTIVE', now() - interval '5 days', 'OFFICIAL_SOURCE'),
       (gen_random_uuid(), $2::uuid, $5::uuid, 'PRIMARY',     'ACTIVE', now() - interval '5 days', 'OFFICIAL_SOURCE'),
       (gen_random_uuid(), $3::uuid, $4::uuid, 'PRIMARY',     'ACTIVE', now() - interval '5 days', 'OFFICIAL_SOURCE'),
       (gen_random_uuid(), $3::uuid, $5::uuid, 'OVERLAPPING', 'ACTIVE', now() - interval '5 days', 'OFFICIAL_SOURCE')`,
    f.zoneAId,
    f.zoneBId,
    f.zoneCrossId,
    f.jurisdictionAId,
    f.jurisdictionBId
  );

  // A command structure on every incident, and a command role for actor A on
  // each of them — so a denial is never explainable by "no command role".
  const structures = [
    [randomUUID(), f.incidentPrimaryId],
    [randomUUID(), f.incidentAffectedId],
    [randomUUID(), f.incidentCommandId],
    [randomUUID(), f.incidentSpatialId],
  ] as const;
  for (const [structureId, incidentId] of structures) {
    await owner.$executeRawUnsafe(
      `INSERT INTO command.incident_command_structures (id, incident_id, status) VALUES ($1::uuid, $2::uuid, 'ACTIVE')`,
      structureId,
      incidentId
    );
    const roleId = incidentId === f.incidentCommandId ? f.commandRoleAId : randomUUID();
    await owner.$executeRawUnsafe(
      `INSERT INTO command.command_roles
         (id, incident_command_structure_id, actor_type, actor_id, institutional_membership_id, role_label)
       VALUES ($1::uuid, $2::uuid, 'PERSON', $3::uuid, $4::uuid, 'Incident Commander')`,
      roleId,
      structureId,
      f.personAId,
      f.membershipAId
    );
    await owner.$executeRawUnsafe(
      `INSERT INTO command.command_role_jurisdiction_scopes
         (id, command_role_id, jurisdiction_id, status, valid_from, provenance)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'ACTIVE', now() - interval '3 days', 'MANUAL')`,
      incidentId === f.incidentCommandId ? f.commandScopeAId : randomUUID(),
      roleId,
      f.jurisdictionAId
    );
    if (incidentId === f.incidentCommandId) {
      // Actor B: a real command role on the SAME incident, but institutionally
      // and jurisdictionally scoped to B.
      await owner.$executeRawUnsafe(
        `INSERT INTO command.command_roles
           (id, incident_command_structure_id, actor_type, actor_id, institutional_membership_id, role_label)
         VALUES ($1::uuid, $2::uuid, 'PERSON', $3::uuid, $4::uuid, 'Other-Jurisdiction Commander')`,
        f.commandRoleBId,
        structureId,
        f.personBId,
        f.membershipBId
      );
      await owner.$executeRawUnsafe(
        `INSERT INTO command.command_role_jurisdiction_scopes
           (id, command_role_id, jurisdiction_id, status, valid_from, provenance)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'ACTIVE', now() - interval '3 days', 'MANUAL')`,
        f.commandScopeBId,
        f.commandRoleBId,
        f.jurisdictionBId
      );
    }
  }

  // valid_from is explicitly in the past so an "expired" case can move
  // valid_until backwards without tripping ck_ioza_validity_window.
  await owner.$executeRawUnsafe(
    `INSERT INTO geo.incident_operational_zone_assignments
       (id, incident_id, operational_zone_id, assignment_kind, resolution_method, status,
        valid_from, confidence, review_status, correlation_id, provenance, assigned_by_subject_id) VALUES
       ($1::uuid, $4::uuid, $7::uuid, 'PRIMARY',  'MANUAL',               'ACTIVE', now() - interval '4 days', 'HIGH',      'REVIEWED_APPROVED', gen_random_uuid(), 'MANUAL', NULL),
       ($2::uuid, $5::uuid, $7::uuid, 'AFFECTED', 'SPATIAL_INTERSECTION', 'ACTIVE', now() - interval '4 days', 'MEDIUM',    'REQUIRES_REVIEW',   gen_random_uuid(), 'SPATIAL_RESOLVER', NULL),
       ($3::uuid, $6::uuid, $7::uuid, 'COMMAND',  'MANUAL',               'ACTIVE', now() - interval '4 days', 'CONFIRMED', 'REVIEWED_APPROVED', gen_random_uuid(), 'MANUAL', $8::uuid)`,
    f.primaryAssignmentId,
    f.affectedAssignmentId,
    f.commandAssignmentId,
    f.incidentPrimaryId,
    f.incidentAffectedId,
    f.incidentCommandId,
    f.zoneAId,
    f.subjectAId
  );

  return f;
}

async function registerSubject(owner: RawSqlClient, personId: string): Promise<string> {
  const rows = await owner.$queryRawUnsafe<{ id: string }>(
    `SELECT security.fn_register_access_subject('PERSON'::security.actor_type_enum, $1::uuid, NULL, NULL, NULL) AS id`,
    personId
  );
  return rows[0]!.id;
}

/** Removes everything the fixture created, in FK-safe order. Rows are DELETEd here because this is teardown, not a domain operation. */
export async function dropIncidentZoneFixture(f: IncidentZoneFixture): Promise<void> {
  const owner = raw(await ownerClient());
  const incidents = [
    f.zoneOwnerIncidentId,
    f.incidentPrimaryId,
    f.incidentAffectedId,
    f.incidentCommandId,
    f.incidentSpatialId,
  ];
  const zones = [f.zoneAId, f.zoneBId, f.zoneCrossId, f.zoneOrphanId];
  const subjects = [f.subjectAId, f.subjectBId];
  const jurisdictions = [f.jurisdictionAId, f.jurisdictionBId];

  await owner.$executeRawUnsafe(
    `DELETE FROM security.audit_logs WHERE incident_id = ANY($1::uuid[])`,
    incidents
  );
  // Supersession chains: a predecessor REFERENCES its successor, and the
  // self-FK is ON DELETE RESTRICT (RESTRICT is never deferrable, whatever the
  // constraint's DEFERRABLE clause says). Nulling the pointer instead would
  // violate ck_ioza_supersession_consistency, so predecessors are deleted
  // first, repeatedly, until no linked row is left.
  for (let pass = 0; pass < 5; pass += 1) {
    const deleted = await owner.$executeRawUnsafe(
      `DELETE FROM geo.incident_operational_zone_assignments
        WHERE incident_id = ANY($1::uuid[]) AND superseded_by_assignment_id IS NOT NULL`,
      incidents
    );
    if (!deleted) break;
  }
  await owner.$executeRawUnsafe(
    `DELETE FROM geo.incident_operational_zone_assignments WHERE incident_id = ANY($1::uuid[])`,
    incidents
  );
  await owner.$executeRawUnsafe(
    `DELETE FROM command.command_role_jurisdiction_scopes
      WHERE jurisdiction_id = ANY($1::uuid[])`,
    jurisdictions
  );
  await owner.$executeRawUnsafe(
    `DELETE FROM command.command_roles WHERE incident_command_structure_id IN
       (SELECT id FROM command.incident_command_structures WHERE incident_id = ANY($1::uuid[]))`,
    incidents
  );
  await owner.$executeRawUnsafe(
    `DELETE FROM command.incident_command_structures WHERE incident_id = ANY($1::uuid[])`,
    incidents
  );
  await owner.$executeRawUnsafe(
    `DELETE FROM geo.operational_zone_jurisdiction_assignments WHERE operational_zone_id = ANY($1::uuid[])`,
    zones
  );
  await owner.$executeRawUnsafe(`DELETE FROM incident.affected_area_versions WHERE incident_id = ANY($1::uuid[])`, incidents);
  await owner.$executeRawUnsafe(`DELETE FROM geo.operational_zones WHERE id = ANY($1::uuid[])`, zones);
  await owner.$executeRawUnsafe(`DELETE FROM incident.incident_transitions WHERE incident_id = ANY($1::uuid[])`, incidents);
  await owner.$executeRawUnsafe(`DELETE FROM incident.incident_promotions WHERE incident_id = ANY($1::uuid[])`, incidents);
  await owner.$executeRawUnsafe(`DELETE FROM incident.incidents WHERE id = ANY($1::uuid[])`, incidents);
  await owner.$executeRawUnsafe(`DELETE FROM governance.jurisdictions WHERE id = ANY($1::uuid[])`, jurisdictions);
  await owner.$executeRawUnsafe(`DELETE FROM geo.administrative_areas WHERE id = ANY($1::uuid[])`, [f.areaAId, f.areaBId]);
  await owner.$executeRawUnsafe(`DELETE FROM governance.administrative_area_kinds WHERE id = $1::uuid`, f.areaKindId);
  await owner.$executeRawUnsafe(
    `DELETE FROM security.access_role_assignments WHERE access_subject_id = ANY($1::uuid[])`,
    subjects
  );
  await owner.$executeRawUnsafe(`DELETE FROM security.access_subjects WHERE id = ANY($1::uuid[])`, subjects);
  await owner.$executeRawUnsafe(
    `DELETE FROM governance.automation_rules WHERE id = ANY($1::uuid[])`,
    [f.automationRuleUnauthorizedId, f.automationRuleAuthorizedId]
  );
  await owner.$executeRawUnsafe(
    `DELETE FROM institution.institutional_memberships WHERE id = ANY($1::uuid[])`,
    [f.membershipAId, f.membershipBId]
  );
  await owner.$executeRawUnsafe(`DELETE FROM institution.organizations WHERE id = ANY($1::uuid[])`, [f.orgAId, f.orgBId]);
  await owner.$executeRawUnsafe(`DELETE FROM identity.people WHERE id = ANY($1::uuid[])`, [f.personAId, f.personBId]);
}

/** Asks `security.fn_has_command_role` AS THE RUNTIME PRINCIPAL, in a session bound to `actorId`. */
export async function askHasCommandRole(
  actorId: string,
  incidentId: string,
  extra?: { forgedActorRole?: string; sessionActorId?: string }
): Promise<boolean> {
  const runtime = await runtimeClient();
  return withActor(
    runtime,
    extra?.sessionActorId ?? actorId,
    async (tx) => {
      const rows = await tx.$queryRawUnsafe<{ allowed: boolean }>(
        `SELECT security.fn_has_command_role($1::uuid, $2::uuid) AS allowed`,
        actorId,
        incidentId
      );
      return Boolean(rows[0]!.allowed);
    },
    { forgedActorRole: extra?.forgedActorRole }
  );
}

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) % 100000;
  }
  return h;
}

function polygon(x1: number, y1: number, x2: number, y2: number): string {
  return `POLYGON((${x1} ${y1}, ${x1} ${y2}, ${x2} ${y2}, ${x2} ${y1}, ${x1} ${y1}))`;
}

function multiPolygon(x1: number, y1: number, x2: number, y2: number): string {
  return `MULTIPOLYGON(((${x1} ${y1}, ${x1} ${y2}, ${x2} ${y2}, ${x2} ${y1}, ${x1} ${y1})))`;
}

export { polygon, multiPolygon };

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createIncidentZoneFixture,
  dropIncidentZoneFixture,
  incidentZoneDockerShouldRun,
  ownerClient,
  raw,
  runtimeClient,
  withActor,
  type IncidentZoneFixture,
} from "./incidentZoneTestHelpers";
import { assignIncidentOperationalZone } from "../../src/lib/database-target/repositories/incidentOperationalZoneRepository";
import { closeTargetPrincipalClients, closeTargetPrismaClient } from "../../src/lib/database-target/client/targetPrismaClient";

/**
 * tests/database-target/incident-zone-rls.test.ts
 *
 * RLS on the R31 relations, exercised over REAL connections as the real
 * runtime and admin principals — not `SET ROLE` inside an owner session.
 *
 * That distinction is the whole reason this file exists separately from the
 * SQL matrix: a `SET ROLE` test still runs on a superuser connection, so it
 * cannot prove which principal the application code actually connects as. Here
 * app_api connects with its own credentials, so "app_api cannot write this"
 * is a falsifiable claim.
 */
describe.skipIf(!incidentZoneDockerShouldRun)("R31 relation RLS under real principals", () => {
  let fixture: IncidentZoneFixture;

  beforeAll(async () => {
    fixture = await createIncidentZoneFixture("R31Rls");
  });

  afterAll(async () => {
    if (fixture) await dropIncidentZoneFixture(fixture);
    await closeTargetPrincipalClients();
    await closeTargetPrismaClient();
  });

  it("the runtime principal is NOT superuser, NOT BYPASSRLS, and does not own the relation", async () => {
    const runtime = raw(await runtimeClient());
    const rows = await runtime.$queryRawUnsafe<{
      current_user: string;
      is_super: boolean;
      is_bypass: boolean;
      owns: boolean;
    }>(
      `SELECT current_user,
              (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_super,
              (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS is_bypass,
              pg_get_userbyid(c.relowner) = current_user AS owns
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'geo' AND c.relname = 'incident_operational_zone_assignments'`
    );
    expect(rows[0]!.current_user).toBe("app_api");
    expect(rows[0]!.is_super).toBe(false);
    expect(rows[0]!.is_bypass).toBe(false);
    expect(rows[0]!.owns).toBe(false);
  });

  it("the runtime principal holds no CREATE on schema geo or command", async () => {
    const runtime = raw(await runtimeClient());
    const rows = await runtime.$queryRawUnsafe<{ geo_create: boolean; command_create: boolean }>(
      `SELECT has_schema_privilege(current_user, 'geo', 'CREATE') AS geo_create,
              has_schema_privilege(current_user, 'command', 'CREATE') AS command_create`
    );
    expect(rows[0]!.geo_create).toBe(false);
    expect(rows[0]!.command_create).toBe(false);
  });

  it("POSITIVE — app_api WITH the command role reads the incident's COMMAND assignment", async () => {
    const runtime = await runtimeClient();
    const rows = await withActor(runtime, fixture.personAId, (tx) =>
      tx.$queryRawUnsafe<{ id: string }>(
        `SELECT id FROM geo.incident_operational_zone_assignments WHERE incident_id = $1::uuid`,
        fixture.incidentCommandId
      )
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("POSITIVE — an actor with a governance clearance but no command scope may still READ the relation", async () => {
    // Deliberate, and worth stating: the SELECT policy admits either a command
    // role on the incident OR a persisted OPERATIONAL/ADMIN/AUDIT/SECURITY
    // grant. Reading which zones an incident touches is operational
    // information; COMMAND AUTHORITY is a separate question, answered only by
    // fn_has_command_role — which says false for this same actor (see
    // incident-command-jurisdiction-mismatch.test.ts).
    const runtime = await runtimeClient();
    const rows = await withActor(runtime, fixture.personBId, (tx) =>
      tx.$queryRawUnsafe<{ id: string }>(
        `SELECT id FROM geo.incident_operational_zone_assignments WHERE incident_id = $1::uuid`,
        fixture.incidentCommandId
      )
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("NEGATIVE — an actor with NEITHER a command role NOR any clearance reads nothing", async () => {
    const owner = raw(await ownerClient());
    const strangerId = randomUUID();
    await owner.$executeRawUnsafe(
      `INSERT INTO identity.people (id, legal_name) VALUES ($1::uuid, 'R31 Rls Stranger')`,
      strangerId
    );
    // A real, ACTIVE AccessSubject with NO role assignment: the denial is
    // provably about authorization, not about being unknown to the system.
    await owner.$queryRawUnsafe(
      `SELECT security.fn_register_access_subject('PERSON'::security.actor_type_enum, $1::uuid, NULL, NULL, NULL)`,
      strangerId
    );

    const runtime = await runtimeClient();
    const rows = await withActor(runtime, strangerId, (tx) =>
      tx.$queryRawUnsafe<{ id: string }>(
        `SELECT id FROM geo.incident_operational_zone_assignments WHERE incident_id = $1::uuid`,
        fixture.incidentCommandId
      )
    );
    expect(rows).toEqual([]);

    await owner.$executeRawUnsafe(`DELETE FROM security.access_subjects WHERE person_id = $1::uuid`, strangerId);
    await owner.$executeRawUnsafe(`DELETE FROM identity.people WHERE id = $1::uuid`, strangerId);
  });

  it("NEGATIVE — app_api with NO session context at all reads nothing", async () => {
    const runtime = raw(await runtimeClient());
    const rows = await runtime.$queryRawUnsafe<{ id: string }>(
      `SELECT id FROM geo.incident_operational_zone_assignments WHERE incident_id = $1::uuid`,
      fixture.incidentCommandId
    );
    expect(rows).toEqual([]);
  });

  it("NEGATIVE — app_api cannot INSERT into the relation at all", async () => {
    const runtime = await runtimeClient();
    await expect(
      withActor(runtime, fixture.personAId, (tx) =>
        tx.$queryRawUnsafe(
          `INSERT INTO geo.incident_operational_zone_assignments
             (incident_id, operational_zone_id, assignment_kind, resolution_method, status, provenance)
           VALUES ($1::uuid, $2::uuid, 'MONITORING', 'MANUAL', 'ACTIVE', 'MANUAL')`,
          fixture.incidentCommandId,
          fixture.zoneBId
        )
      )
    ).rejects.toThrow(/permission denied|42501/i);
  });

  it("NEGATIVE — app_api cannot UPDATE an assignment into COMMAND", async () => {
    const runtime = await runtimeClient();
    await expect(
      withActor(runtime, fixture.personAId, (tx) =>
        tx.$queryRawUnsafe(
          `UPDATE geo.incident_operational_zone_assignments SET assignment_kind = 'COMMAND' WHERE id = $1::uuid`,
          fixture.primaryAssignmentId
        )
      )
    ).rejects.toThrow(/permission denied|42501/i);
  });

  it("NEGATIVE — app_api cannot DELETE from the relation, so history cannot be erased", async () => {
    const runtime = await runtimeClient();
    await expect(
      withActor(runtime, fixture.personAId, (tx) =>
        tx.$queryRawUnsafe(
          `DELETE FROM geo.incident_operational_zone_assignments WHERE id = $1::uuid`,
          fixture.primaryAssignmentId
        )
      )
    ).rejects.toThrow(/permission denied|42501/i);
  });

  it("NEGATIVE — app_api cannot EXECUTE the COMMAND assignment function", async () => {
    const runtime = await runtimeClient();
    await expect(
      withActor(runtime, fixture.personAId, (tx) =>
        assignIncidentOperationalZone(tx, {
          incidentId: fixture.incidentSpatialId,
          operationalZoneId: fixture.zoneAId,
          assignmentKind: "COMMAND",
          resolutionMethod: "MANUAL",
          assignedBySubjectId: fixture.subjectAId,
          reasonCode: "SHOULD_FAIL",
          correlationId: randomUUID(),
        })
      )
    ).rejects.toThrow(/permission denied|42501/i);
  });

  it("POSITIVE — the ADMIN principal (access_admin) CAN confirm COMMAND, and is itself non-privileged", async () => {
    const adminRaw = raw(await adminClient());
    const identity = await adminRaw.$queryRawUnsafe<{ current_user: string; is_super: boolean; is_bypass: boolean }>(
      `SELECT current_user,
              (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_super,
              (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS is_bypass`
    );
    expect(identity[0]!.current_user).toBe("access_admin");
    expect(identity[0]!.is_super).toBe(false);
    expect(identity[0]!.is_bypass).toBe(false);

    const admin = await adminClient();
    const id = await withActor(admin, fixture.personAId, (tx) =>
      assignIncidentOperationalZone(tx, {
        incidentId: fixture.incidentSpatialId,
        operationalZoneId: fixture.zoneAId,
        assignmentKind: "COMMAND",
        resolutionMethod: "MANUAL",
        assignedBySubjectId: fixture.subjectAId,
        reasonCode: "HUMAN_COMMAND_CONFIRMATION",
        correlationId: randomUUID(),
      })
    );
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("NEGATIVE — no runtime role holds any write grant on the relation", async () => {
    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ grantee: string; privilege_type: string }>(
      // The table OWNER (the migration credential) necessarily holds these;
      // what must hold none of them is every RUNTIME role, which is what the
      // application actually connects as.
      `SELECT grantee, privilege_type FROM information_schema.role_table_grants
        WHERE table_schema = 'geo' AND table_name = 'incident_operational_zone_assignments'
          AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
          AND grantee IN ('app_api','ingest_worker','jobs_worker','audit_reader','readonly_inspector','access_admin','PUBLIC')`
    );
    expect(rows).toEqual([]);
  });

  it("the relation has RLS ENABLED and FORCED, with no USING (true) anywhere", async () => {
    const owner = raw(await ownerClient());
    const posture = await owner.$queryRawUnsafe<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT c.relrowsecurity, c.relforcerowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'geo' AND c.relname = 'incident_operational_zone_assignments'`
    );
    expect(posture[0]!.relrowsecurity).toBe(true);
    expect(posture[0]!.relforcerowsecurity).toBe(true);

    const permissive = await owner.$queryRawUnsafe<{ policyname: string }>(
      `SELECT policyname FROM pg_policies
        WHERE schemaname IN ('geo','command')
          AND tablename IN ('incident_operational_zone_assignments','operational_zone_jurisdiction_assignments','command_role_jurisdiction_scopes')
          AND (coalesce(qual,'') = 'true' OR coalesce(with_check,'') = 'true')`
    );
    expect(permissive).toEqual([]);
  });

  it("no RLS policy anywhere in the database evaluates a PostGIS predicate", async () => {
    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ policyname: string }>(
      `SELECT policyname FROM pg_policies
        WHERE coalesce(qual,'') ~* 'st_intersects|st_covers|st_within|st_contains|st_dwithin'
           OR coalesce(with_check,'') ~* 'st_intersects|st_covers|st_within|st_contains|st_dwithin'`
    );
    expect(rows).toEqual([]);
  });

  it("no RLS policy on the R31 relations reads argus.actor_role as an authority", async () => {
    const owner = raw(await ownerClient());
    const rows = await owner.$queryRawUnsafe<{ policyname: string }>(
      `SELECT policyname FROM pg_policies
        WHERE schemaname IN ('geo','command')
          AND (coalesce(qual,'') LIKE '%argus.actor_role%' OR coalesce(with_check,'') LIKE '%argus.actor_role%')`
    );
    expect(rows).toEqual([]);
  });
});

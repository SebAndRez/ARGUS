import { describe, expect, it } from "vitest";
import { shadowWriteIdentity, userToIdentityTarget, type LegacyUserRecord } from "../../src/lib/database-target/adapters/identity";
import { shadowWriteInstitution } from "../../src/lib/database-target/adapters/institution";
import { shadowWriteJurisdiction } from "../../src/lib/database-target/adapters/jurisdiction";
import {
  evidenceSourceToTarget,
  shadowWriteEvidence,
  type LegacyReportRecord,
} from "../../src/lib/database-target/adapters/evidence";
import {
  knowledgeIncidentToTarget,
  shadowWriteIncident,
  type LegacyKnowledgeIncidentRecord,
  type LegacyStatusMappingTable,
} from "../../src/lib/database-target/adapters/incident";
import { shadowWriteHelpRequest, type LegacyHelpRequestRecord } from "../../src/lib/database-target/adapters/help";
import { shadowWriteMission } from "../../src/lib/database-target/adapters/mission";
import {
  criticalPoiToTarget,
  shadowWriteResource,
  type LegacyCriticalPoiRecord,
  type PoiRouteClassifier,
} from "../../src/lib/database-target/adapters/resource";
import { shadowWriteAlert } from "../../src/lib/database-target/adapters/alert";
import { shadowWriteIce } from "../../src/lib/database-target/adapters/ice";
import { isPersisted } from "../../src/lib/database-target/adapters/types";

const DISABLED = { shadowWriteEnabled: false };
const ENABLED = { shadowWriteEnabled: true };

describe("identity adapter", () => {
  const user: LegacyUserRecord = {
    id: "user_1",
    name: "Jane Doe",
    publicAlias: "jane",
    governmentIdHash: null,
    authProvider: "local",
    accountStatus: "ACTIVE",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
  };

  it("returns NOT_ENABLED when the shadow-write flag is off", () => {
    const outcome = shadowWriteIdentity(user, DISABLED);
    expect(outcome.kind).toBe("NOT_ENABLED");
  });

  it("never assigns an institutional membership (D-01) — always UNASSIGNED", () => {
    const target = userToIdentityTarget(user);
    expect(target.person.institutionAssignmentStatus).toBe("UNASSIGNED");
  });

  it("persists with HIGH confidence for a recognized account status", () => {
    const outcome = shadowWriteIdentity(user, ENABLED);
    expect(isPersisted(outcome)).toBe(true);
    if (isPersisted(outcome)) {
      expect(outcome.migrationConfidence).toBe("HIGH");
      expect(outcome.legacyId).toBe("user_1");
    }
  });
});

describe("institution adapter (CREATE_EMPTY, D-01)", () => {
  it("returns NOT_ENABLED when the flag is off, even with a request", () => {
    const outcome = shadowWriteInstitution(
      { legalName: "Cruz Roja", registrationIdentifier: null, hasFormalAuthority: true, requestedByActorId: "actor_1" },
      DISABLED
    );
    expect(outcome.kind).toBe("NOT_ENABLED");
  });

  it("blocks with no legacy source when no request is supplied", () => {
    const outcome = shadowWriteInstitution(undefined, ENABLED);
    expect(outcome.kind).toBe("MIGRATION_BLOCKED");
    if (outcome.kind !== "PERSISTED") {
      expect(outcome.reason).toMatch(/D-01/);
    }
  });

  it("never fabricates a PERSISTED outcome even with a request (not yet wired to persistence)", () => {
    const outcome = shadowWriteInstitution(
      { legalName: "Cruz Roja", registrationIdentifier: null, hasFormalAuthority: true, requestedByActorId: "actor_1" },
      ENABLED
    );
    expect(outcome.kind).toBe("MIGRATION_BLOCKED");
  });
});

describe("jurisdiction adapter (no legacy source)", () => {
  it("blocks when primaryAdministrativeAreaId is missing (D-07 dependency)", () => {
    const outcome = shadowWriteJurisdiction(
      { name: "Región X", primaryAdministrativeAreaId: "", declaringOrganizationId: null, legalBasis: null },
      ENABLED
    );
    expect(outcome.kind).toBe("MIGRATION_BLOCKED");
  });

  it("returns NOT_ENABLED when the flag is off", () => {
    expect(shadowWriteJurisdiction(undefined, DISABLED).kind).toBe("NOT_ENABLED");
  });
});

describe("evidence adapter", () => {
  const report: LegacyReportRecord = {
    id: "report_1",
    userId: "user_1",
    title: "Incendio",
    description: "Se ve humo",
    latitude: -33.45,
    longitude: -70.66,
    status: "NEW",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };

  it("maps a citizen Report to a PRIMARY/CITIZEN observation (D-01)", () => {
    const target = evidenceSourceToTarget({ kind: "REPORT", record: report });
    expect(target.originType).toBe("PRIMARY");
    expect(target.authorType).toBe("CITIZEN");
    expect(target.legacySource).toBe("Report");
  });

  it("maps an ExternalEvent to a machine-authored observation (no authorType)", () => {
    const target = evidenceSourceToTarget({
      kind: "EXTERNAL_EVENT",
      record: { id: "ee_1", sourceId: "src_1", title: "Sismo", description: null, latitude: null, longitude: null, createdAt: new Date() },
    });
    expect(target.authorType).toBeNull();
    expect(target.location).toBeNull();
    expect(target.migrationConfidence).toBe("MEDIUM");
  });

  it("shadow write returns NOT_ENABLED when disabled", () => {
    expect(shadowWriteEvidence({ kind: "REPORT", record: report }, DISABLED).kind).toBe("NOT_ENABLED");
  });
});

describe("incident adapter (D-02 status split, never inline CASE WHEN)", () => {
  const record: LegacyKnowledgeIncidentRecord = {
    id: "ki_1",
    title: "Incendio forestal",
    summary: "Zona X",
    status: "active",
    verificationStatus: "confirmed",
    effectiveSeverity: "high",
    incidentTypeId: "type_1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };

  it("returns null (never guesses) when no approved mapping entry exists", () => {
    const emptyTable: LegacyStatusMappingTable = new Map();
    expect(knowledgeIncidentToTarget(record, emptyTable)).toBeNull();
  });

  it("shadow write reports REQUIRES_REVIEW, not a fabricated success, absent an approved mapping", () => {
    const emptyTable: LegacyStatusMappingTable = new Map();
    const outcome = shadowWriteIncident(record, emptyTable, ENABLED);
    expect(outcome.kind).toBe("REQUIRES_REVIEW");
  });

  it("persists using ONLY the injected mapping table — never an inline status check", () => {
    const table: LegacyStatusMappingTable = new Map([
      [
        "active|confirmed",
        {
          operationalStatus: "ACTIVE",
          verificationStatus: "CONFIRMED",
          preventiveStatus: "NONE",
          trend: "STABLE",
          structuralStatus: "INDEPENDENT",
        },
      ],
    ]);
    const outcome = shadowWriteIncident(record, table, ENABLED);
    expect(isPersisted(outcome)).toBe(true);
    if (isPersisted(outcome)) {
      expect(outcome.target.operationalStatus).toBe("ACTIVE");
      expect(outcome.target.verificationStatus).toBe("CONFIRMED");
    }
  });
});

describe("help-request adapter", () => {
  const record: LegacyHelpRequestRecord = {
    id: "hr_1",
    userId: "user_1",
    title: "Necesito agua",
    description: "Sin agua potable",
    latitude: -33.0,
    longitude: -70.0,
    status: "RECEIVED",
    createdAt: new Date(),
  };

  it("never persists closed_* fields via this adapter (SECURITY DEFINER-only per catalog)", () => {
    const outcome = shadowWriteHelpRequest(record, ENABLED);
    expect(isPersisted(outcome)).toBe(true);
    if (isPersisted(outcome)) {
      expect(outcome.target.closedByActorId).toBeNull();
      expect(outcome.target.closedAt).toBeNull();
    }
  });

  it("returns NOT_ENABLED when disabled", () => {
    expect(shadowWriteHelpRequest(record, DISABLED).kind).toBe("NOT_ENABLED");
  });
});

describe("mission adapter (CREATE_EMPTY)", () => {
  it("blocks without operationalNeedId even when enabled", () => {
    const outcome = shadowWriteMission(
      { operationalNeedId: "", objective: { missionKind: "RESCUE", successCriteria: ["safe"] } },
      ENABLED
    );
    expect(outcome.kind).toBe("MIGRATION_BLOCKED");
  });
});

describe("resource adapter (D-06 4-route split, never assumes route A)", () => {
  const record: LegacyCriticalPoiRecord = {
    id: "poi_1",
    name: "Refugio Central",
    category: "unclassified_weird_value",
    priority: "LOW",
    latitude: -33.4,
    longitude: -70.6,
    status: "active",
    createdAt: new Date(),
  };

  it("lands on route (D) — a recorded outcome, never a silent omission — when the classifier can't resolve", () => {
    const neverClassifies: PoiRouteClassifier = () => null;
    const target = criticalPoiToTarget(record, neverClassifies);
    expect(target.route).toBe("D");
    if (target.route === "D") {
      expect(target.queueEntry.migrationReviewStatus).toBe("REQUIRES_REVIEW");
    }
  });

  it("never defaults to route (A) absent an explicit classifier result", () => {
    const neverClassifies: PoiRouteClassifier = () => null;
    const target = criticalPoiToTarget(record, neverClassifies);
    expect(target.route).not.toBe("A");
  });

  it("shadow write for route (D) is PERSISTED-into-the-queue (a recorded outcome), not silently blocked", () => {
    const neverClassifies: PoiRouteClassifier = () => null;
    const outcome = shadowWriteResource(record, neverClassifies, ENABLED);
    expect(isPersisted(outcome)).toBe(true);
  });

  it("respects an explicit route (A) classification", () => {
    const classifyAsFacility: PoiRouteClassifier = () => "A";
    const target = criticalPoiToTarget(record, classifyAsFacility);
    expect(target.route).toBe("A");
    if (target.route === "A") {
      expect(target.resource.resourceType).toBe("FACILITY");
    }
  });
});

describe("alert adapter (CREATE_EMPTY)", () => {
  it("blocks without an explicit authorization request", () => {
    expect(shadowWriteAlert(undefined, ENABLED).kind).toBe("MIGRATION_BLOCKED");
  });

  it("returns NOT_ENABLED when disabled even with a request", () => {
    const outcome = shadowWriteAlert(
      { alertKind: "EMERGENCY", incidentId: null, audience: { scope: "REGIONAL" }, authorizedByActorId: "actor_1" },
      DISABLED
    );
    expect(outcome.kind).toBe("NOT_ENABLED");
  });
});

describe("ice adapter (CREATE_EMPTY, D-08)", () => {
  it("blocks without personId", () => {
    const outcome = shadowWriteIce({ personId: "" }, ENABLED);
    expect(outcome.kind).toBe("MIGRATION_BLOCKED");
  });

  it("returns NOT_ENABLED when disabled", () => {
    expect(shadowWriteIce({ personId: "person_1" }, DISABLED).kind).toBe("NOT_ENABLED");
  });
});

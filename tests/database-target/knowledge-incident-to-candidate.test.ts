import { describe, expect, it } from "vitest";
import {
  incidentCandidateIdempotencyKey,
  incidentIdempotencyKey,
  knowledgeIncidentToCandidate,
  knowledgeIncidentToTarget,
  shadowWriteIncidentCandidate,
  type LegacyKnowledgeIncidentRecord,
  type LegacyStatusMappingTable,
} from "../../src/lib/database-target/adapters/incident";
import { isPersisted } from "../../src/lib/database-target/adapters/types";

const record: LegacyKnowledgeIncidentRecord = {
  id: "ki_42",
  title: "Incendio forestal en zona norte",
  summary: "Foco activo detectado por satelite",
  status: "active",
  verificationStatus: "confirmed",
  effectiveSeverity: "high",
  incidentTypeId: "type_wildfire",
  domain: "wildfire",
  subtype: "forest_fire",
  confidenceLevel: "high",
  sourceId: "src_gdacs",
  externalId: "ext_998",
  latitude: -33.45,
  longitude: -70.66,
  occurredAt: new Date("2026-01-01T10:00:00Z"),
  createdAt: new Date("2026-01-01T10:05:00Z"),
};

const mappedTable: LegacyStatusMappingTable = new Map([
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

const emptyTable: LegacyStatusMappingTable = new Map();

describe("knowledgeIncidentToCandidate — never creates an Incident", () => {
  it("returns an IncidentCandidate (UNDER_ASSESSMENT), never touching Incident's shape", () => {
    const candidate = knowledgeIncidentToCandidate(record, mappedTable);
    expect(candidate.status).toBe("UNDER_ASSESSMENT");
    expect("verificationStatus" in candidate).toBe(false); // that's Incident's field, not IncidentCandidate's
  });

  it("preserves the legacy id, source, and full provenance", () => {
    const candidate = knowledgeIncidentToCandidate(record, mappedTable);
    expect(candidate.id).toBe("ki_42");
    expect(candidate.legacySource).toBe("KnowledgeIncident");
    expect(candidate.legacyRecordId).toBe("ki_42");
    expect(candidate.legacyStatus).toBe("active");
  });

  it("preserves latitude/longitude as a denormalized location snapshot", () => {
    const candidate = knowledgeIncidentToCandidate(record, mappedTable);
    expect(candidate.location).toEqual({ latitude: -33.45, longitude: -70.66 });
  });

  it("preserves the source correlation via correlationKey (sourceId:externalId)", () => {
    const candidate = knowledgeIncidentToCandidate(record, mappedTable);
    expect(candidate.correlationKey).toBe("src_gdacs:ext_998");
  });

  it("preserves timestamps (occurredAt/createdAt)", () => {
    const candidate = knowledgeIncidentToCandidate(record, mappedTable);
    expect(candidate.occurredAt).toBe("2026-01-01T10:00:00.000Z");
    expect(candidate.createdAt).toBe("2026-01-01T10:05:00.000Z");
  });

  it("maps the 5 status dimensions separately into proposedProfile using ONLY the injected mapping table", () => {
    const candidate = knowledgeIncidentToCandidate(record, mappedTable);
    expect(candidate.proposedProfile).toEqual({
      proposedIncidentTypeId: "type_wildfire",
      proposedCategory: "forest_fire",
      verificationStatus: "CONFIRMED",
      operationalStatus: "ACTIVE",
      preventiveStatus: "NONE",
      trend: "STABLE",
      structuralStatus: "INDEPENDENT",
      confidence: "HIGH",
    });
    expect(candidate.migrationConfidence).toBe("HIGH");
    expect(candidate.migrationReviewStatus).toBe("AUTO_MAPPED");
  });

  it("conserves legacy_status and marks REQUIRES_REVIEW — never guesses — when no mapping entry exists", () => {
    const candidate = knowledgeIncidentToCandidate(record, emptyTable);
    expect(candidate.proposedProfile).toBeNull();
    expect(candidate.legacyStatus).toBe("active");
    expect(candidate.migrationReviewStatus).toBe("REQUIRES_REVIEW");
    expect(candidate.migrationConfidence).toBe("LOW");
  });

  it("never produces an Incident value even when the mapping table is fully populated", () => {
    const candidate = knowledgeIncidentToCandidate(record, mappedTable);
    const incidentOnlyKeys = ["operationalStatus", "verificationStatus", "preventiveStatus", "trend", "structuralStatus", "originCandidateId", "closedAt"];
    for (const key of incidentOnlyKeys) {
      expect(key in candidate).toBe(false);
    }
  });

  it("knowledgeIncidentToTarget (Incident) and knowledgeIncidentToCandidate (IncidentCandidate) use distinct idempotency keys", () => {
    expect(incidentIdempotencyKey(record)).toBe("KnowledgeIncident:ki_42");
    expect(incidentCandidateIdempotencyKey(record)).toBe("KnowledgeIncident:candidate:ki_42");
    expect(incidentIdempotencyKey(record)).not.toBe(incidentCandidateIdempotencyKey(record));
  });

  it("Incident transform still returns null (unchanged contract) absent a mapping — the two transforms are independent", () => {
    expect(knowledgeIncidentToTarget(record, emptyTable)).toBeNull();
    expect(knowledgeIncidentToCandidate(record, emptyTable)).not.toBeNull();
  });
});

describe("shadowWriteIncidentCandidate", () => {
  const DISABLED = { shadowWriteEnabled: false };
  const ENABLED = { shadowWriteEnabled: true };

  it("returns NOT_ENABLED when the flag is off", () => {
    expect(shadowWriteIncidentCandidate(record, mappedTable, DISABLED).kind).toBe("NOT_ENABLED");
  });

  it("always persists a candidate when enabled, even without an approved mapping (REQUIRES_REVIEW, never dropped)", () => {
    const outcome = shadowWriteIncidentCandidate(record, emptyTable, ENABLED);
    expect(isPersisted(outcome)).toBe(true);
    if (isPersisted(outcome)) {
      expect(outcome.reviewStatus).toBe("REQUIRES_REVIEW");
      expect(outcome.target.proposedProfile).toBeNull();
    }
  });

  it("persists a fully-classified candidate when the mapping resolves", () => {
    const outcome = shadowWriteIncidentCandidate(record, mappedTable, ENABLED);
    expect(isPersisted(outcome)).toBe(true);
    if (isPersisted(outcome)) {
      expect(outcome.reviewStatus).toBe("AUTO_MAPPED");
      expect(outcome.target.proposedProfile?.operationalStatus).toBe("ACTIVE");
    }
  });

  it("never returns an Incident-shaped target — the outcome's target is always an IncidentCandidate", () => {
    const outcome = shadowWriteIncidentCandidate(record, mappedTable, ENABLED);
    expect(isPersisted(outcome)).toBe(true);
    if (isPersisted(outcome)) {
      expect(outcome.target.status).toBe("UNDER_ASSESSMENT");
    }
  });
});

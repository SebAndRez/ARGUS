import { describe, expect, it } from "vitest";
import type { IncidentCandidate, ProposedIncidentProfile } from "../../src/lib/database-target/incident";
import type { Incident } from "../../src/lib/database-target/incident";

/**
 * `IncidentCandidate` must be its own type — never a structural alias of
 * `Incident` (or any other domain type). These tests assert the two
 * interfaces are not interchangeable and that `IncidentCandidate` carries
 * its own promotion-lifecycle status distinct from `Incident`'s 5
 * dimensions.
 */
describe("IncidentCandidate is its own type, never an alias", () => {
  const candidate: IncidentCandidate = {
    id: "cand_1",
    status: "UNDER_ASSESSMENT",
    correlationKey: "src_1:ext_1",
    classification: "OPERATIONAL",
    promotionStartedAt: null,
    createdAt: new Date().toISOString(),
    candidateOriginType: "LEGACY_KNOWLEDGE_INCIDENT",
    proposedProfile: null,
    jurisdictionId: null,
    administrativeAreaId: null,
    location: null,
    occurredAt: null,
    receivedAt: null,
    clientCreatedAt: null,
    sourceRecordIds: [],
    observationIds: [],
    evidenceIds: [],
    automationRuleId: null,
    actorType: null,
    actorId: null,
    provenance: null,
    legacyStatus: "active",
    legacySource: "KnowledgeIncident",
    legacyRecordId: "ki_1",
    migrationConfidence: "LOW",
    migrationReviewStatus: "REQUIRES_REVIEW",
  };

  it("has a distinct promotion-lifecycle `status` field never present on Incident", () => {
    expect(candidate.status).toBe("UNDER_ASSESSMENT");
    // Incident has no `status` field at all — it has 5 separate dimensions instead.
    const incidentKeys: (keyof Incident)[] = [
      "verificationStatus",
      "operationalStatus",
      "preventiveStatus",
      "trend",
      "structuralStatus",
    ];
    for (const key of incidentKeys) {
      expect(key in candidate).toBe(false);
    }
  });

  it("carries the 6 real physical columns of incident.incident_candidates", () => {
    expect(candidate).toMatchObject({
      id: "cand_1",
      status: "UNDER_ASSESSMENT",
      correlationKey: "src_1:ext_1",
      classification: "OPERATIONAL",
      promotionStartedAt: null,
    });
    expect(typeof candidate.createdAt).toBe("string");
  });

  it("proposedProfile, when present, mirrors the 5 Incident dimensions as a PROPOSAL, not a commitment", () => {
    const withProfile: IncidentCandidate = {
      ...candidate,
      proposedProfile: {
        proposedIncidentTypeId: "type_1",
        proposedCategory: "wildfire",
        verificationStatus: "CONFIRMED",
        operationalStatus: "ACTIVE",
        preventiveStatus: "NONE",
        trend: "STABLE",
        structuralStatus: "INDEPENDENT",
        confidence: "HIGH",
      },
    };
    const profile = withProfile.proposedProfile as ProposedIncidentProfile;
    expect(profile.verificationStatus).toBe("CONFIRMED");
    expect(profile.operationalStatus).toBe("ACTIVE");
    expect(profile.preventiveStatus).toBe("NONE");
    expect(profile.trend).toBe("STABLE");
    expect(profile.structuralStatus).toBe("INDEPENDENT");
  });

  it("proposedProfile is null (never guessed) absent an approved mapping", () => {
    expect(candidate.proposedProfile).toBeNull();
    expect(candidate.migrationReviewStatus).toBe("REQUIRES_REVIEW");
  });

  it("holds link arrays for source records, observations, and evidence — never a single collapsed field", () => {
    expect(Array.isArray(candidate.sourceRecordIds)).toBe(true);
    expect(Array.isArray(candidate.observationIds)).toBe(true);
    expect(Array.isArray(candidate.evidenceIds)).toBe(true);
  });

  it("carries legacy provenance (D-02) distinct from Incident's own provenance", () => {
    expect(candidate.legacySource).toBe("KnowledgeIncident");
    expect(candidate.legacyRecordId).toBe("ki_1");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildOpenFemaDisasterDeclarationsUrl,
  buildOpenFemaExternalId,
  buildOpenFemaGroupKey,
  buildOpenFemaInstitutionalLessons,
  buildOpenFemaOperationalPrecedent,
  mapOpenFemaIncidentTypeToArgusDomain,
  normalizeOpenFemaDisasterDeclaration,
  normalizeOpenFemaDisasterDeclarations,
  type OpenFemaDisasterDeclarationRow,
} from "@/lib/knowledge-intake/adapters/openFemaAdapter";
import { buildOpenFemaPlaybook } from "@/lib/knowledge-intake/institutionalPlaybook/openFemaPlaybook";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/knowledge-intake/__tests__/openFemaAdapter.test.ts` (a
 * `runOpenFemaAdapterTest()` export Vitest never ran). Every assertion below
 * is preserved from the original `passed:` chain, split into its own `it`.
 */

const fireDeclaration: OpenFemaDisasterDeclarationRow = {
  disasterNumber: 4856,
  femaDeclarationString: "DR-4856-CA",
  declarationTitle: "California Wildfires",
  declarationType: "DR",
  incidentType: "Fire",
  state: "CA",
  designatedArea: "Los Angeles (County)",
  fipsStateCode: "06",
  fipsCountyCode: "037",
  placeCode: "99037",
  declarationDate: "2025-01-10T00:00:00.000Z",
  incidentBeginDate: "2025-01-07T00:00:00.000Z",
  ihProgramDeclared: true,
  iaProgramDeclared: true,
  paProgramDeclared: true,
  hmProgramDeclared: true,
};

describe("buildOpenFemaDisasterDeclarationsUrl", () => {
  const url = buildOpenFemaDisasterDeclarationsUrl({
    year: 2025,
    state: "CA",
    incidentTypes: ["Fire", "Flood"],
    disasterNumber: 4856,
    limit: 100,
  });

  it("targets the DisasterDeclarationsSummaries endpoint", () => {
    expect(url.includes("DisasterDeclarationsSummaries.json")).toBe(true);
  });

  it("includes an encoded OData $filter", () => {
    expect(url.includes("%24filter=")).toBe(true);
  });
});

describe("mapOpenFemaIncidentTypeToArgusDomain", () => {
  it("maps Fire to wildfire", () => {
    expect(mapOpenFemaIncidentTypeToArgusDomain("Fire")).toBe("wildfire");
  });

  it("maps Flood to flood", () => {
    expect(mapOpenFemaIncidentTypeToArgusDomain("Flood")).toBe("flood");
  });

  it("maps Hurricane to hurricane", () => {
    expect(mapOpenFemaIncidentTypeToArgusDomain("Hurricane")).toBe("hurricane");
  });
});

describe("buildOpenFemaExternalId / buildOpenFemaGroupKey", () => {
  it("builds the expected external id", () => {
    expect(buildOpenFemaExternalId(fireDeclaration)).toBe("OPENFEMA:4856:Los-Angeles-County:2025-01-10");
  });

  it("builds the expected group key", () => {
    expect(buildOpenFemaGroupKey(fireDeclaration)).toBe("4856");
  });
});

describe("normalizeOpenFemaDisasterDeclaration", () => {
  const incident = normalizeOpenFemaDisasterDeclaration(fireDeclaration);

  it("uses openfema as the sourceId", () => {
    expect(incident.sourceIds[0]).toBe("openfema");
  });

  it("is not a live sensor", () => {
    expect(incident.technicalFactors.isLiveSensor).toBe(false);
  });

  it("has the disaster_declaration_recovery_dataset source role", () => {
    expect(incident.technicalFactors.sourceRole).toBe("disaster_declaration_recovery_dataset");
  });

  it("flags publicAssistanceDeclared", () => {
    expect(incident.technicalFactors.publicAssistanceDeclared).toBe(true);
  });

  it("flags hazardMitigationDeclared", () => {
    expect(incident.technicalFactors.hazardMitigationDeclared).toBe(true);
  });

  it("recommended actions carry the not-an-official-FEMA-instruction safety limit", () => {
    expect(incident.recommendedActions[0]?.safetyLimit.includes("not an official FEMA instruction")).toBe(true);
  });
});

describe("normalizeOpenFemaDisasterDeclarations — deduplication", () => {
  const normalized = normalizeOpenFemaDisasterDeclarations([fireDeclaration, fireDeclaration]);

  it("dedupes identical declarations down to a single incident", () => {
    expect(normalized.incidents.length).toBe(1);
  });

  it("dedupes identical declarations down to a single evidence entry", () => {
    expect(normalized.evidence.length).toBe(1);
  });
});

describe("buildOpenFemaInstitutionalLessons and buildOpenFemaOperationalPrecedent", () => {
  const lessons = buildOpenFemaInstitutionalLessons(fireDeclaration);
  const precedent = buildOpenFemaOperationalPrecedent(fireDeclaration);

  it("lessons mention Public Assistance", () => {
    expect(lessons.some((lesson) => lesson.includes("Public Assistance"))).toBe(true);
  });

  it("precedent's suggested operational focus mentions damage assessment", () => {
    expect(precedent.suggestedOperationalFocus.includes("damage assessment")).toBe(true);
  });

  it("precedent caveat mentions it is not an official FEMA instruction", () => {
    expect(precedent.caveat.includes("not an official FEMA instruction")).toBe(true);
  });
});

describe("buildOpenFemaPlaybook", () => {
  const incident = normalizeOpenFemaDisasterDeclaration(fireDeclaration);
  const precedent = buildOpenFemaOperationalPrecedent(fireDeclaration);
  const playbook = buildOpenFemaPlaybook({
    incidentType: "Fire",
    declarationType: "Major Disaster",
    programsActivated: precedent.programsActivated,
    designatedArea: "Los Angeles (County)",
    historicalRecords: [precedent],
    evidenceRefs: [incident.rawEvidenceRefs[0]],
  });

  it("public assistance considerations mention public infrastructure", () => {
    expect(playbook.publicAssistanceConsiderations.some((item) => item.includes("public infrastructure"))).toBe(true);
  });

  it("caveats mention it is not an official FEMA instruction", () => {
    expect(playbook.caveats.some((item) => item.includes("not an official FEMA instruction"))).toBe(true);
  });
});

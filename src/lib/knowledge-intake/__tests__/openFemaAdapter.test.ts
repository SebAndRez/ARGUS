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

export function runOpenFemaAdapterTest() {
  const url = buildOpenFemaDisasterDeclarationsUrl({
    year: 2025,
    state: "CA",
    incidentTypes: ["Fire", "Flood"],
    disasterNumber: 4856,
    limit: 100,
  });
  const incident = normalizeOpenFemaDisasterDeclaration(fireDeclaration);
  const normalized = normalizeOpenFemaDisasterDeclarations([fireDeclaration, fireDeclaration]);
  const lessons = buildOpenFemaInstitutionalLessons(fireDeclaration);
  const precedent = buildOpenFemaOperationalPrecedent(fireDeclaration);
  const playbook = buildOpenFemaPlaybook({
    incidentType: "Fire",
    declarationType: "Major Disaster",
    programsActivated: precedent.programsActivated,
    designatedArea: "Los Angeles (County)",
    historicalRecords: [precedent],
    evidenceRefs: [incident.rawEvidenceRefs[0]],
  });

  return {
    passed:
      url.includes("DisasterDeclarationsSummaries.json") &&
      url.includes("%24filter=") &&
      mapOpenFemaIncidentTypeToArgusDomain("Fire") === "wildfire" &&
      mapOpenFemaIncidentTypeToArgusDomain("Flood") === "flood" &&
      mapOpenFemaIncidentTypeToArgusDomain("Hurricane") === "hurricane" &&
      buildOpenFemaExternalId(fireDeclaration) === "OPENFEMA:4856:Los-Angeles-County:2025-01-10" &&
      buildOpenFemaGroupKey(fireDeclaration) === "4856" &&
      incident.sourceIds[0] === "openfema" &&
      incident.technicalFactors.isLiveSensor === false &&
      incident.technicalFactors.sourceRole === "disaster_declaration_recovery_dataset" &&
      incident.technicalFactors.publicAssistanceDeclared === true &&
      incident.technicalFactors.hazardMitigationDeclared === true &&
      incident.recommendedActions[0]?.safetyLimit.includes("not an official FEMA instruction") &&
      normalized.incidents.length === 1 &&
      normalized.evidence.length === 1 &&
      lessons.some((lesson) => lesson.includes("Public Assistance")) &&
      precedent.suggestedOperationalFocus.includes("damage assessment") &&
      precedent.caveat.includes("not an official FEMA instruction") &&
      playbook.publicAssistanceConsiderations.some((item) => item.includes("public infrastructure")) &&
      playbook.caveats.some((item) => item.includes("not an official FEMA instruction")),
    incident,
    normalized,
    precedent,
    playbook,
  };
}

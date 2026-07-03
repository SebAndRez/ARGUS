import type { OpenFemaOperationalPrecedent } from "@/lib/knowledge-intake/adapters/openFemaAdapter";

export type OpenFemaPlaybookInput = {
  incidentType?: string;
  declarationType?: string;
  programsActivated?: string[];
  designatedArea?: string;
  historicalRecords?: OpenFemaOperationalPrecedent[];
  evidenceRefs?: string[];
};

export type OpenFemaPlaybookOutput = {
  suggestedOperationalFocus: string[];
  likelyCoordinationNeeds: string[];
  recoveryConsiderations: string[];
  mitigationConsiderations: string[];
  householdAssistanceConsiderations: string[];
  publicAssistanceConsiderations: string[];
  caveats: string[];
  evidenceRefs: string[];
};

const OFFICIAL_CAVEAT = "ARGUS recommendation based on FEMA precedent; not an official FEMA instruction.";
const AUTHORITY_CAVEAT = "Requires validation with the competent local authority before operational use.";

function hasProgram(programs: string[] = [], token: string) {
  return programs.some((program) => program.toLowerCase().includes(token));
}

export function buildOpenFemaPlaybook(input: OpenFemaPlaybookInput): OpenFemaPlaybookOutput {
  const programs = input.programsActivated ?? [];
  const incidentType = input.incidentType?.toLowerCase() ?? "";
  const recordFocus = input.historicalRecords?.flatMap((record) => record.suggestedOperationalFocus) ?? [];
  const publicAssistance = hasProgram(programs, "public assistance") || hasProgram(recordFocus, "public assistance");
  const householdAssistance = hasProgram(programs, "individual") || hasProgram(programs, "household") || hasProgram(recordFocus, "household");
  const mitigation = hasProgram(programs, "mitigation") || hasProgram(recordFocus, "mitigation");

  return {
    suggestedOperationalFocus: Array.from(new Set([
      "damage assessment",
      "area designation review",
      "local authority coordination",
      publicAssistance ? "public assistance coordination" : undefined,
      householdAssistance ? "household assistance screening" : undefined,
      mitigation ? "hazard mitigation planning" : undefined,
      incidentType.includes("fire") ? "public communications for fire recovery" : undefined,
      incidentType.includes("flood") || incidentType.includes("storm") || incidentType.includes("hurricane") ? "debris removal and emergency protective measures review" : undefined,
    ].filter((item): item is string => Boolean(item)))),
    likelyCoordinationNeeds: [
      "county/municipal coordination",
      "state emergency management coordination",
      "documentation and evidence preservation",
      input.designatedArea ? `designated area context: ${input.designatedArea}` : "designated area validation",
    ],
    recoveryConsiderations: [
      "repair/replacement/restoration context for public assets where applicable",
      "continuity of public services",
      "recovery communications grounded in verified authority updates",
    ],
    mitigationConsiderations: mitigation
      ? ["long-term mitigation planning", "repetitive-risk review", "future risk reduction project screening"]
      : ["mitigation may be relevant only if supported by authoritative program records."],
    householdAssistanceConsiderations: householdAssistance
      ? ["household impact screening", "shelter/recovery support context", "individual assistance eligibility must be verified by official channels"]
      : ["do not infer household assistance eligibility without an official program record."],
    publicAssistanceConsiderations: publicAssistance
      ? ["public infrastructure recovery context", "emergency protective measures review", "debris removal and public services restoration context"]
      : ["do not infer public assistance authorization without an official program record."],
    caveats: [OFFICIAL_CAVEAT, AUTHORITY_CAVEAT, "Do not promise federal assistance or represent ARGUS as FEMA."],
    evidenceRefs: input.evidenceRefs ?? [],
  };
}

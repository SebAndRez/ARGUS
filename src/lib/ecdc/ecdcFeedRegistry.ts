export const ecdcFeedRegistry = [
  {
    id: "ecdc-cdtr",
    label: "Communicable Disease Threats Report",
    url: "https://www.ecdc.europa.eu/en/taxonomy/term/1505/feed",
    feedType: "cdtr",
    scope: "EU/EEA public health threats",
    defaultEnabled: true,
    incidentCreationDefault: false,
    evidenceType: "ecdc_communicable_disease_threats_report",
    maxItems: 20,
    caveats: ["Weekly report may cover multiple threats; evidence by default, not direct incident creation."],
  },
  {
    id: "ecdc-epidemiological-updates",
    label: "Epidemiological Updates",
    url: "https://www.ecdc.europa.eu/en/taxonomy/term/1310/feed",
    feedType: "epidemiological_update",
    scope: "EU/EEA and relevant global public health updates",
    defaultEnabled: true,
    incidentCreationDefault: true,
    evidenceType: "ecdc_epidemiological_update",
    maxItems: 20,
    caveats: ["Creates incidents only when disease and country/region are clear."],
  },
  {
    id: "ecdc-risk-assessments",
    label: "Risk Assessments",
    url: "https://www.ecdc.europa.eu/en/taxonomy/term/1295/feed",
    feedType: "risk_assessment",
    scope: "EU/EEA risk assessment reports",
    defaultEnabled: true,
    incidentCreationDefault: true,
    evidenceType: "ecdc_risk_assessment",
    maxItems: 20,
    caveats: ["Risk assessment text is context, not ARGUS travel or quarantine restriction."],
  },
  {
    id: "ecdc-data",
    label: "Data",
    url: "https://www.ecdc.europa.eu/en/taxonomy/term/1382/feed",
    feedType: "data",
    scope: "Aggregate surveillance data references",
    defaultEnabled: false,
    incidentCreationDefault: false,
    evidenceType: "ecdc_surveillance_data_reference",
    maxItems: 20,
    caveats: ["Surveillance data feed references are context only in phase 1."],
  },
] as const;

export function getEcdcFeed(id: string) {
  return ecdcFeedRegistry.find((feed) => feed.id === id);
}

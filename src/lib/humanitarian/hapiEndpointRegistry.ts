export const HAPI_INDICATORS = [
  "baseline_population",
  "humanitarian_needs",
  "idps",
  "refugees",
  "returnees",
  "operational_presence",
  "food_security",
  "funding",
  "rainfall",
  "national_risk",
] as const;

export type HapiIndicator = typeof HAPI_INDICATORS[number];

export const hapiEndpointRegistry: Record<HapiIndicator, {
  path: string;
  enabledByDefault: boolean;
  cacheTtlHours: number;
  caveats: string[];
}> = {
  baseline_population: {
    path: "/population-social/baseline-population",
    enabledByDefault: true,
    cacheTtlHours: 24,
    caveats: ["Baseline population is not a live census."],
  },
  humanitarian_needs: {
    path: "/coordination-context/people-in-need",
    enabledByDefault: true,
    cacheTtlHours: 24,
    caveats: ["Do not sum PIN sectors as unique people."],
  },
  idps: {
    path: "/population-social/idps",
    enabledByDefault: true,
    cacheTtlHours: 24,
    caveats: ["Displacement figures are dataset and reference-period dependent."],
  },
  refugees: {
    path: "/population-social/refugees",
    enabledByDefault: true,
    cacheTtlHours: 24,
    caveats: ["Persons of concern figures are not live movement tracking."],
  },
  returnees: {
    path: "/population-social/returnees",
    enabledByDefault: true,
    cacheTtlHours: 24,
    caveats: ["Returnee figures are dataset and reference-period dependent."],
  },
  operational_presence: {
    path: "/coordination-context/operational-presence",
    enabledByDefault: true,
    cacheTtlHours: 12,
    caveats: ["Operational presence does not mean guaranteed real-time availability."],
  },
  food_security: {
    path: "/food-security-nutrition-poverty/food-security",
    enabledByDefault: true,
    cacheTtlHours: 24,
    caveats: ["IPC/CH coverage and p-codes vary by dataset."],
  },
  funding: {
    path: "/coordination-context/funding",
    enabledByDefault: false,
    cacheTtlHours: 24,
    caveats: ["Funding context does not imply locally available resources."],
  },
  rainfall: {
    path: "/climate/rainfall",
    enabledByDefault: false,
    cacheTtlHours: 12,
    caveats: ["Rainfall anomaly boundaries and periods must be reviewed."],
  },
  national_risk: {
    path: "/coordination-context/national-risk",
    enabledByDefault: false,
    cacheTtlHours: 24,
    caveats: ["National risk is broad context, not an incident alert."],
  },
};

export type VolcanoActivityType =
  | "new_unrest"
  | "continuing_unrest"
  | "new_eruptive_activity"
  | "continuing_eruptive_activity"
  | "activity_update"
  | "unknown";

export type VolcanoBaselineContext = {
  sourceId: "smithsonian-gvp";
  sourceName: string;
  volcanoNumber?: string;
  vnum?: string;
  volcanoName?: string;
  synonyms: string[];
  country?: string;
  region?: string;
  subregion?: string;
  latitude?: number;
  longitude?: number;
  elevation?: number;
  volcanoType?: string;
  tectonicSetting?: string;
  lastKnownEruption?: string;
  activityStatus?: string;
  rockTypes: string[];
  features: string[];
  dataVersion?: string;
  citation: string;
  sourceUrl?: string;
  confidence: number;
  limitations: string[];
  evidenceRefs: string[];
};

export type EruptionHistoryContext = {
  sourceId: "smithsonian-gvp";
  sourceName: string;
  volcanoNumber?: string;
  vnum?: string;
  volcanoName?: string;
  eruptionId?: string;
  startDate?: string;
  endDate?: string;
  startYear?: number;
  endYear?: number;
  certainty?: string;
  vei?: number;
  eruptionType?: string;
  evidenceMethod?: string;
  deposits?: string;
  fatalities?: number;
  damage?: string;
  tsunamiGenerated?: boolean;
  sourceReferences: string[];
  dataVersion?: string;
  citation: string;
  confidence: number;
  limitations: string[];
  evidenceRefs: string[];
};

export type VolcanicActivityReportContext = {
  sourceId: "smithsonian-gvp";
  sourceName: string;
  reportType: "DVAR" | "WVAR";
  reportDate?: string;
  weekStart?: string;
  weekEnd?: string;
  volcanoNumber?: string;
  vnum?: string;
  volcanoName?: string;
  country?: string;
  region?: string;
  activityType: VolcanoActivityType;
  eruptionStartDate?: string;
  reportSummary?: string;
  observedPhenomena: string[];
  ashPlume?: string;
  lavaFlow?: string;
  explosions?: string;
  seismicity?: string;
  thermalActivity?: string;
  gasEmission?: string;
  lahar?: string;
  aviationColorCode?: string;
  alertLevel?: string;
  sourceObservatory?: string;
  preliminary: true;
  requiresLocalAuthorityReview: true;
  sourceUrl?: string;
  confidence: number;
  limitations: string[];
  evidenceRefs: string[];
};

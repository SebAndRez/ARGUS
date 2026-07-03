export type ArgusHazardDomain =
  | "natural_disaster"
  | "earthquake"
  | "tsunami"
  | "volcano"
  | "flood"
  | "storm"
  | "hurricane"
  | "tornado"
  | "landslide"
  | "avalanche"
  | "drought"
  | "weather_alert"
  | "weather_context"
  | "hydrology"
  | "water_conditions"
  | "river_level"
  | "streamflow"
  | "flood_context"
  | "drought_context"
  | "nav_water_context"
  | "fenix_flood_context"
  | "aura_flood_context"
  | "forecast_context"
  | "heatwave"
  | "coldwave"
  | "winter_storm"
  | "wildfire_weather"
  | "marine_weather"
  | "wildfire"
  | "urban_fire"
  | "industrial_fire"
  | "transport_accident"
  | "road_accident"
  | "rail_accident"
  | "aviation_accident"
  | "aviation_hazard"
  | "maritime_accident"
  | "pipeline_accident"
  | "chemical_accident"
  | "industrial_accident"
  | "explosion"
  | "mining_accident"
  | "dam_failure"
  | "bridge_collapse"
  | "building_collapse"
  | "power_grid_failure"
  | "telecom_failure"
  | "water_system_failure"
  | "nuclear_radiological"
  | "biological_hazard"
  | "public_health"
  | "mass_gathering_incident"
  | "civil_unrest"
  | "conflict_zone"
  | "humanitarian_crisis"
  | "environmental_hazard"
  | "nav_context"
  | "aura_context"
  | "fenix_context"
  | "ashfall"
  | "extreme_weather"
  | "unknown";

export type ArgusHazardSubtype = string;

export type ArgusKnowledgeInputType =
  | "api_rest"
  | "rss_atom"
  | "csv"
  | "json"
  | "geojson"
  | "xml"
  | "html"
  | "pdf"
  | "docx"
  | "txt_markdown"
  | "xlsx"
  | "kml_kmz"
  | "shapefile_planned"
  | "citizen_report"
  | "manual_admin"
  | "url"
  | "document_folder"
  | "downloaded_dataset"
  | "scanned_document_planned"
  | "image_map_planned";

export type ArgusKnowledgeIngestionMode =
  | "automatic"
  | "manual"
  | "scheduled"
  | "adminUpload"
  | "userReport"
  | "bulkImport";

export type ArgusKnowledgeProcessingStatus =
  | "received"
  | "queued"
  | "parsing"
  | "normalized"
  | "needsReview"
  | "failed"
  | "published";

export type ArgusKnowledgeSourceStatus =
  | "active"
  | "active_contextual"
  | "active_historical"
  | "active_institutional"
  | "planned"
  | "manual"
  | "disabled"
  | "requiresReview"
  | "requiresConfiguration"
  | "requiresApiKey"
  | "stub";

export type ArgusKnowledgeSourceKind =
  | "live"
  | "near_real_time"
  | "historical"
  | "doctrinal"
  | "technical"
  | "scientific"
  | "local_chile"
  | "citizen"
  | "manual"
  | "contextual"
  | "future_admin";

export type ArgusKnowledgeLicenseType =
  | "openAccess"
  | "publicDomain"
  | "nonCommercial"
  | "nonCommercialFree"
  | "requiresAttribution"
  | "restricted"
  | "unknown"
  | "manualReviewRequired";

export type ArgusIncidentSeverity = "low" | "medium" | "high" | "critical" | "unknown";

export type ArgusKnowledgeCoverage = {
  countries?: string[];
  regions?: string[];
  global?: boolean;
  notes?: string;
};

export type ArgusSourceReliabilityScore = {
  authorityScore: number;
  freshnessScore: number;
  technicalDepthScore: number;
  historicalAccuracyScore: number;
  geospatialPrecisionScore: number;
  licenseClarityScore: number;
  updateCadenceScore: number;
  biasRiskScore: number;
  finalScore: number;
  label: "official_priority" | "trusted_secondary" | "needs_validation" | "context_only" | "not_operational";
};

export type ArgusEvidenceConfidenceScore = {
  sourceReliability: number;
  corroborationCount: number;
  geolocationPrecision: number;
  timestampPrecision: number;
  documentQuality: number;
  extractionConfidence: number;
  conflictWithOtherSources: number;
  finalConfidence: number;
  label: "high" | "medium" | "low" | "not_operational";
};

export type ArgusKnowledgeSource = {
  id: string;
  name: string;
  description: string;
  status: ArgusKnowledgeSourceStatus;
  sourceKinds: ArgusKnowledgeSourceKind[];
  domains: ArgusHazardDomain[];
  inputTypes: ArgusKnowledgeInputType[];
  accessMethod: "api" | "feed" | "download" | "manual" | "document" | "dataset" | "planned";
  baseUrl?: string;
  coverage: ArgusKnowledgeCoverage;
  reliabilityScore: ArgusSourceReliabilityScore;
  licenseType: ArgusKnowledgeLicenseType;
  licenseNotes: string;
  updateCadence?: string;
  integrationNotes: string;
  tags: string[];
};

export type ArgusKnowledgeInputEnvelope = {
  id: string;
  inputType: ArgusKnowledgeInputType;
  sourceId?: string;
  sourceName?: string;
  sourceUrl?: string;
  fileName?: string;
  fileMimeType?: string;
  uploadedBy?: string;
  ingestionMode: ArgusKnowledgeIngestionMode;
  rawContentRef?: string;
  rawText?: string;
  rawMetadata?: Record<string, unknown>;
  language?: string;
  country?: string;
  coverage?: ArgusKnowledgeCoverage;
  licenseNotes?: string;
  receivedAt: string;
  processingStatus: ArgusKnowledgeProcessingStatus;
  errorLog?: ArgusKnowledgeProcessingError[];
  tags: string[];
};

export type ArgusKnowledgeIngestionRun = {
  id: string;
  sourceId: string;
  startedAt: string;
  completedAt?: string;
  status: ArgusKnowledgeProcessingStatus;
  inputCount: number;
  normalizedCount: number;
  reviewCount: number;
  errors: ArgusKnowledgeProcessingError[];
};

export type ArgusKnowledgeRawDocument = {
  id: string;
  envelopeId: string;
  sourceId?: string;
  contentRef?: string;
  rawText?: string;
  rawMetadata?: Record<string, unknown>;
  sha256?: string;
  receivedAt: string;
};

export type ArgusKnowledgeParsedDocument = {
  id: string;
  rawDocumentId: string;
  title?: string;
  text: string;
  chunks: string[];
  language?: string;
  extractedAt: string;
  extractionConfidence: number;
  needsOcr: boolean;
  metadata: Record<string, unknown>;
};

export type ArgusKnowledgeEvidenceItem = {
  id: string;
  incidentId?: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url?: string;
  quote?: string;
  summary: string;
  confidenceScore: ArgusEvidenceConfidenceScore;
  locationConfidence: number;
  timestampConfidence: number;
  extractedAt: string;
  conflicts?: string[];
};

export type ArgusCasualties = {
  fatalities?: number;
  deaths?: number;
  injured?: number;
  injuries?: number;
  missing?: number;
  displaced?: number;
  unknownText?: string;
};

export type ArgusIncidentImpact = {
  peopleAffected?: number;
  homesAffected?: number;
  infrastructureAffected?: string[];
  economicLossText?: string;
  environmentalImpact?: string;
  propertyDamage?: number;
  cropDamage?: number;
};

export type ArgusIncidentTechnicalFactors = {
  speedKmh?: number;
  impactType?: string;
  vehicleType?: string;
  collisionObject?: string;
  fireBehavior?: string;
  fuelType?: string;
  flameSpread?: string;
  smokeRisk?: string;
  radiationDose?: string;
  isotope?: string;
  chemicalAgent?: string;
  toxicityClass?: string;
  explosionType?: string;
  weatherConditions?: string;
  windDirection?: string;
  windSpeed?: string;
  slope?: string;
  vegetationType?: string;
  buildingType?: string;
  structuralFailureMode?: string;
  infrastructureAffected?: string;
  evacuationComplexity?: string;
  exposedPopulation?: number;
  hospitalLoadRisk?: string;
  roadClosureRisk?: string;
  routeDisruptionRisk?: string;
  magnitude?: number;
  depthKm?: number;
  burnedAreaHa?: number;
  waveHeightM?: number;
  place?: string;
  tsunamiFlag?: boolean;
  brightness?: number;
  satellite?: string;
  instrument?: string;
  frp?: number;
  firmsConfidence?: string | number;
  gdacsEventType?: string;
  gdacsEventId?: string;
  gdacsEpisodeId?: string;
  gdacsAlertLevel?: "green" | "orange" | "red" | "unknown";
  gdacsSeverity?: string;
  eonetStatus?: "open" | "closed" | "unknown";
  eonetCategories?: string[];
  eonetSources?: string[];
  eonetClosedAt?: string;
  nwsEvent?: string;
  nwsSeverity?: string;
  nwsUrgency?: string;
  nwsCertainty?: string;
  nwsMessageType?: string;
  nwsCategory?: string;
  nwsResponse?: string;
  nwsAreaDesc?: string;
  nwsZones?: string[];
  onsetAt?: string;
  effectiveAt?: string;
  expiresAt?: string;
  endsAt?: string;
  senderName?: string;
  headline?: string;
  instruction?: string;
  weatherOffice?: string;
  coverageNote?: string;
  volcanoName?: string;
  volcanoNumber?: string;
  volcanoCode?: string;
  observatory?: string;
  alertLevel?: VolcanoAlertLevel | string;
  previousAlertLevel?: VolcanoAlertLevel | string;
  aviationColorCode?: VolcanoAviationColorCode | string;
  previousAviationColorCode?: VolcanoAviationColorCode | string;
  nvewsThreat?: string | number;
  noticeId?: string;
  noticeType?: string;
  noticeSynopsis?: string;
  ashfallRisk?: string;
  aviationRisk?: string;
  lastNoticeAt?: string;
  sourceCoverageNote?: string;
  magnitudeValue?: number;
  magnitudeUnit?: string;
  magnitudeDescription?: string;
  vulnerability?: string | number;
  priorityHint?: "P0" | "P1" | "P2" | "P3" | "P4";
  medicalContext?: string[];
  routingContext?: string[];
  fenixScenarioContext?: string[];
  episodeId?: string;
  eventType?: string;
  magnitudeType?: string;
  tornadoScale?: string;
  floodCause?: string;
  beginLocation?: string;
  endLocation?: string;
  beginRange?: string | number;
  beginAzimuth?: string;
  endRange?: string | number;
  endAzimuth?: string;
  beginLat?: number;
  beginLon?: number;
  endLat?: number;
  endLon?: number;
  originalReportSource?: string;
  dataQualityFlags?: string[];
  historicalDataset?: boolean;
  notLiveSource?: boolean;
  sourceRole?: string;
  sourceUrl?: string;
  historicalPriority?: "P0" | "P1" | "P2" | "P3" | "P4";
  geospatialConfidence?: number;
  rawDamageProperty?: string;
  rawDamageCrops?: string;
  disasterNumber?: string | number;
  femaDeclarationString?: string;
  declarationType?: string;
  incidentType?: string;
  declaredAt?: string;
  incidentBeginDate?: string;
  incidentEndDate?: string;
  disasterCloseoutDate?: string;
  designatedArea?: string;
  fipsStateCode?: string | number;
  fipsCountyCode?: string | number;
  placeCode?: string | number;
  individualHouseholdsProgramDeclared?: boolean;
  individualAssistanceDeclared?: boolean;
  publicAssistanceDeclared?: boolean;
  hazardMitigationDeclared?: boolean;
  isDeclaration?: boolean;
  isLiveSensor?: boolean;
  institutionalDataset?: boolean;
  groupKey?: string;
  operationalPrecedent?: Record<string, unknown>;
  institutionalLessons?: string[];
};

export type VolcanoAlertLevel = "NORMAL" | "ADVISORY" | "WATCH" | "WARNING" | "UNASSIGNED" | "UNKNOWN";

export type VolcanoAviationColorCode = "GREEN" | "YELLOW" | "ORANGE" | "RED" | "UNASSIGNED" | "UNKNOWN";

export type VolcanoAlertSource = {
  sourceId: string;
  sourceName: string;
  authorityScope: string;
  coverageNote: string;
};

export type VolcanoAlertRecord = {
  volcanoName?: string;
  volcanoNumber?: string;
  volcanoCode?: string;
  observatory?: string;
  alertLevel?: VolcanoAlertLevel | string;
  aviationColorCode?: VolcanoAviationColorCode | string;
  latitude?: number;
  longitude?: number;
  updatedAt?: string;
  raw?: Record<string, unknown>;
};

export type VolcanoNoticeEvidence = {
  noticeId?: string;
  volcanoCode?: string;
  volcanoName?: string;
  observatory?: string;
  noticeType?: string;
  synopsis?: string;
  url?: string;
  sentUtc?: string;
  raw?: Record<string, unknown>;
};

export type WeatherSeverity = "Extreme" | "Severe" | "Moderate" | "Minor" | "Unknown";

export type WeatherUrgency = "Immediate" | "Expected" | "Future" | "Past" | "Unknown";

export type WeatherCertainty = "Observed" | "Likely" | "Possible" | "Unlikely" | "Unknown";

export type WeatherAlertSource = {
  sourceId: string;
  sourceName: string;
  authorityScope: string;
  coverageNote: string;
  licenseNotes: string;
};

export type WeatherAlertRecord = {
  externalId: string;
  event: string;
  severity?: WeatherSeverity | string;
  urgency?: WeatherUrgency | string;
  certainty?: WeatherCertainty | string;
  areaDesc?: string;
  onsetAt?: string;
  effectiveAt?: string;
  expiresAt?: string;
  endsAt?: string;
  latitude?: number;
  longitude?: number;
  geometry?: Record<string, unknown>;
  sourceUrl?: string;
  raw?: Record<string, unknown>;
};

export type WeatherForecastContext = {
  sourceId: string;
  point: { latitude: number; longitude: number };
  office?: string;
  gridX?: number;
  gridY?: number;
  periods?: unknown[];
  raw?: Record<string, unknown>;
};

export type WeatherObservationContext = {
  sourceId: string;
  stationId?: string;
  observedAt?: string;
  latitude?: number;
  longitude?: number;
  raw?: Record<string, unknown>;
};

export type ArgusLessonLearned = {
  id: string;
  title: string;
  domain: ArgusHazardDomain;
  sourceIncidentId: string;
  sourceName: string;
  summary: string;
  whatFailed: string[];
  whatWorked: string[];
  earlyWarningSignals: string[];
  recommendedPreventiveActions: string[];
  recommendedResponseActions: string[];
  applicableToChile: boolean;
  confidenceScore: number;
  tags: string[];
};

export type ArgusOperationalRecommendation = {
  id: string;
  audience: "citizen" | "institutional" | "medical" | "routing" | "simulation";
  priority: "low" | "medium" | "high" | "critical";
  text: string;
  rationale: string;
  confidenceScore: number;
  safetyLimit: string;
  requiresHumanValidation: boolean;
};

export type ArgusIncidentKnowledge = {
  id: string;
  title: string;
  summary: string;
  domain: ArgusHazardDomain;
  subtype?: ArgusHazardSubtype;
  severity: ArgusIncidentSeverity;
  confidenceScore: number;
  actionabilityScore: number;
  sourceReliabilityScore: number;
  evidenceCount: number;
  sourceIds: string[];
  sourceNames: string[];
  occurredAt?: string;
  detectedAt?: string;
  country?: string;
  region?: string;
  locality?: string;
  latitude?: number;
  longitude?: number;
  geometry?: Record<string, unknown>;
  casualties?: ArgusCasualties;
  impact?: ArgusIncidentImpact;
  technicalFactors: ArgusIncidentTechnicalFactors;
  causes: string[];
  contributingFactors: string[];
  responseActions: string[];
  lessonsLearned: ArgusLessonLearned[];
  recommendedActions: ArgusOperationalRecommendation[];
  relatedHistoricalEvents: string[];
  similarIncidentIds: string[];
  tags: string[];
  language?: string;
  rawEvidenceRefs: string[];
  createdAt: string;
  updatedAt: string;
};

export type ArgusKnowledgeEmbeddingRecord = {
  id: string;
  ownerType: "incident" | "lesson" | "document" | "evidence";
  ownerId: string;
  text: string;
  vectorRef?: string;
  provider?: string;
  createdAt: string;
};

export type ArgusKnowledgeProcessingError = {
  id: string;
  stage: string;
  message: string;
  severity: "info" | "warning" | "error";
  recoverable: boolean;
  createdAt: string;
};

export type ArgusKnowledgeAdminReview = {
  id: string;
  itemType: "source" | "document" | "incident" | "evidence" | "lesson";
  itemId: string;
  status: "pending" | "approved" | "rejected" | "needs_more_data";
  reviewerId?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
};

export type ArgusKnowledgeImportTemplate = {
  id: string;
  name: string;
  inputType: ArgusKnowledgeInputType;
  requiredFields: string[];
  optionalFields: string[];
  example: Record<string, unknown>;
};

export type ArgusOperationalReasoningResult = {
  severity: ArgusIncidentSeverity;
  secondaryRisks: string[];
  escalationProbability: number;
  exposedPopulationEstimate?: number;
  nearbyCriticalInfrastructure: string[];
  affectedRoutes: string[];
  citizenRecommendation: ArgusOperationalRecommendation;
  institutionalRecommendation: ArgusOperationalRecommendation;
  informationNeeds: string[];
  confidenceScore: number;
  limits: string[];
};

export type ArgusIncidentSimilarityResult = {
  incident: ArgusIncidentKnowledge;
  similarityScore: number;
  matchedFactors: string[];
  warningText: string;
};

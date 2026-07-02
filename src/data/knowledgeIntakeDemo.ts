import type {
  ArgusHazardDomain,
  ArgusIncidentKnowledge,
  ArgusIncidentSeverity,
  ArgusKnowledgeEvidenceItem,
  ArgusLessonLearned,
  ArgusOperationalRecommendation,
} from "@/types/knowledgeIntake";

const now = "2026-07-02T00:00:00.000Z";

function lesson(input: {
  id: string;
  domain: ArgusHazardDomain;
  incidentId: string;
  title: string;
  summary: string;
  tags: string[];
}): ArgusLessonLearned {
  return {
    id: input.id,
    title: input.title,
    domain: input.domain,
    sourceIncidentId: input.incidentId,
    sourceName: "ARGUS demo knowledge",
    summary: input.summary,
    whatFailed: ["Coordinacion inicial limitada", "Informacion territorial incompleta"],
    whatWorked: ["Senalizacion temprana", "Mensajes breves y consistentes"],
    earlyWarningSignals: ["Aumento de reportes", "Interrupcion de rutas", "Condiciones ambientales agravantes"],
    recommendedPreventiveActions: ["Mantener fuentes oficiales revisadas", "Preparar rutas alternativas"],
    recommendedResponseActions: ["Confirmar evidencia", "Priorizar seguridad humana", "Coordinar con autoridad competente"],
    applicableToChile: true,
    confidenceScore: 74,
    tags: input.tags,
  };
}

function recommendation(
  id: string,
  text: string,
  priority: ArgusOperationalRecommendation["priority"] = "medium"
): ArgusOperationalRecommendation {
  return {
    id,
    audience: "institutional",
    priority,
    text,
    rationale: "Derivado de incidente demo y reglas conservadoras ARGUS.",
    confidenceScore: priority === "critical" ? 72 : 66,
    safetyLimit: "Informativo. Requiere validacion humana y fuente oficial antes de accion critica.",
    requiresHumanValidation: true,
  };
}

function incident(input: {
  id: string;
  title: string;
  domain: ArgusHazardDomain;
  subtype: string;
  severity: ArgusIncidentSeverity;
  country: string;
  region: string;
  locality: string;
  latitude: number;
  longitude: number;
  technicalFactors: ArgusIncidentKnowledge["technicalFactors"];
  tags: string[];
  sourceId: string;
  sourceName: string;
  summary: string;
}): ArgusIncidentKnowledge {
  const learned = lesson({
    id: `lesson-${input.id}`,
    domain: input.domain,
    incidentId: input.id,
    title: `Leccion reutilizable: ${input.subtype}`,
    summary: "La respuesta mejora cuando ARGUS cruza evidencia, rutas y contexto historico antes de recomendar.",
    tags: input.tags,
  });
  return {
    id: input.id,
    title: input.title,
    summary: input.summary,
    domain: input.domain,
    subtype: input.subtype,
    severity: input.severity,
    confidenceScore: 72,
    actionabilityScore: 64,
    sourceReliabilityScore: 70,
    evidenceCount: 1,
    sourceIds: [input.sourceId],
    sourceNames: [input.sourceName],
    occurredAt: "2024-01-01T12:00:00.000Z",
    detectedAt: now,
    country: input.country,
    region: input.region,
    locality: input.locality,
    latitude: input.latitude,
    longitude: input.longitude,
    geometry: { type: "Point", coordinates: [input.longitude, input.latitude] },
    casualties: { unknownText: "Demo; no usar como cifra real." },
    impact: {
      peopleAffected: input.technicalFactors.exposedPopulation,
      infrastructureAffected: input.technicalFactors.infrastructureAffected
        ? [input.technicalFactors.infrastructureAffected]
        : undefined,
    },
    technicalFactors: input.technicalFactors,
    causes: ["Causa principal demo pendiente de validacion"],
    contributingFactors: ["Condiciones locales", "Capacidad de respuesta variable"],
    responseActions: ["Verificar fuente", "Cruzar con mapa operacional", "Registrar lecciones"],
    lessonsLearned: [learned],
    recommendedActions: [
      recommendation(`rec-${input.id}`, "Revisar evidencia, rutas y poblacion expuesta antes de escalar.", input.severity === "critical" ? "critical" : "medium"),
    ],
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: input.tags,
    language: "es",
    rawEvidenceRefs: [`evidence-${input.id}`],
    createdAt: now,
    updatedAt: now,
  };
}

export const demoKnowledgeIncidents: ArgusIncidentKnowledge[] = [
  incident({
    id: "ki-road-low-speed",
    title: "Accidente vial urbano a baja velocidad",
    domain: "road_accident",
    subtype: "low_speed_collision",
    severity: "low",
    country: "CL",
    region: "Metropolitana",
    locality: "Santiago",
    latitude: -33.4489,
    longitude: -70.6693,
    sourceId: "conaset_chile",
    sourceName: "CONASET Chile demo",
    summary: "Colision urbana de baja velocidad usada para analizar triage vial y despeje rapido.",
    technicalFactors: { speedKmh: 25, impactType: "lateral", vehicleType: "light_vehicle", roadClosureRisk: "low" },
    tags: ["road", "urban", "low-speed"],
  }),
  incident({
    id: "ki-road-60kmh",
    title: "Accidente vial grave a 60 km/h",
    domain: "road_accident",
    subtype: "high_energy_collision",
    severity: "high",
    country: "CL",
    region: "Valparaiso",
    locality: "Quilpue",
    latitude: -33.0472,
    longitude: -71.4425,
    sourceId: "nhtsa_fars_crss",
    sourceName: "NHTSA FARS / CRSS demo",
    summary: "Choque de energia moderada-alta con riesgo de lesion multiple y bloqueo vial.",
    technicalFactors: { speedKmh: 60, impactType: "frontal", vehicleType: "light_vehicle", hospitalLoadRisk: "medium", roadClosureRisk: "high" },
    tags: ["road", "trauma", "60kmh"],
  }),
  incident({
    id: "ki-fixed-object-crash",
    title: "Choque contra objeto fijo",
    domain: "road_accident",
    subtype: "fixed_object_collision",
    severity: "high",
    country: "CL",
    region: "Biobio",
    locality: "Concepcion",
    latitude: -36.8201,
    longitude: -73.0444,
    sourceId: "iihs",
    sourceName: "IIHS demo",
    summary: "Impacto contra poste o barrera con riesgo de atrapamiento y energia focalizada.",
    technicalFactors: { speedKmh: 50, collisionObject: "post", impactType: "fixed_object", vehicleType: "light_vehicle" },
    tags: ["road", "fixed-object"],
  }),
  incident({
    id: "ki-residential-fire",
    title: "Incendio estructural residencial",
    domain: "urban_fire",
    subtype: "residential_structure_fire",
    severity: "high",
    country: "CL",
    region: "Metropolitana",
    locality: "Nunoa",
    latitude: -33.4569,
    longitude: -70.5933,
    sourceId: "nist_fire",
    sourceName: "NIST Fire Research demo",
    summary: "Incendio residencial con humo interior y evacuacion compleja.",
    technicalFactors: { buildingType: "residential", fireBehavior: "interior_flashover_risk", smokeRisk: "high", evacuationComplexity: "medium" },
    tags: ["fire", "residential", "smoke"],
  }),
  incident({
    id: "ki-wui-fire",
    title: "Incendio forestal de interfaz urbano-forestal",
    domain: "wildfire",
    subtype: "wui_fire",
    severity: "critical",
    country: "CL",
    region: "Valparaiso",
    locality: "Vina del Mar",
    latitude: -33.0245,
    longitude: -71.5518,
    sourceId: "nasa_firms",
    sourceName: "NASA FIRMS demo",
    summary: "Foco termico y viento generan riesgo de propagacion hacia zona poblada.",
    technicalFactors: { vegetationType: "matorral", windDirection: "SW", windSpeed: "28 km/h", flameSpread: "fast", exposedPopulation: 12000 },
    tags: ["wildfire", "wui", "evacuation"],
  }),
  incident({
    id: "ki-coastal-quake-tsunami",
    title: "Terremoto costero con posible tsunami",
    domain: "tsunami",
    subtype: "earthquake_tsunami_risk",
    severity: "critical",
    country: "CL",
    region: "Maule",
    locality: "Constitucion",
    latitude: -35.333,
    longitude: -72.416,
    sourceId: "usgs_earthquake",
    sourceName: "USGS demo",
    summary: "Sismo costero usado para activar comparacion historica y rutas a zona segura.",
    technicalFactors: { magnitude: 8.2, depthKm: 24, waveHeightM: 3, evacuationComplexity: "high", exposedPopulation: 18000 },
    tags: ["earthquake", "tsunami", "coastal"],
  }),
  incident({
    id: "ki-volcanic-eruption",
    title: "Erupcion volcanica",
    domain: "volcano",
    subtype: "ashfall_lahar",
    severity: "high",
    country: "CL",
    region: "Los Lagos",
    locality: "Puerto Varas",
    latitude: -41.326,
    longitude: -72.614,
    sourceId: "sernageomin",
    sourceName: "SERNAGEOMIN demo",
    summary: "Evento volcanico demo con ceniza, lahares y rutas expuestas.",
    technicalFactors: { weatherConditions: "windy", windDirection: "E", infrastructureAffected: "rural roads", routeDisruptionRisk: "high" },
    tags: ["volcano", "ash", "lahar"],
  }),
  incident({
    id: "ki-chemical-industrial",
    title: "Accidente quimico industrial",
    domain: "chemical_accident",
    subtype: "toxic_release",
    severity: "critical",
    country: "CL",
    region: "Biobio",
    locality: "Talcahuano",
    latitude: -36.7248,
    longitude: -73.1167,
    sourceId: "csb",
    sourceName: "CSB demo",
    summary: "Liberacion de agente quimico con pluma estimada y riesgo respiratorio.",
    technicalFactors: { chemicalAgent: "chlorine", toxicityClass: "acute_inhalation", windDirection: "N", windSpeed: "18 km/h", exposedPopulation: 5000 },
    tags: ["chemical", "industrial", "plume"],
  }),
  incident({
    id: "ki-industrial-explosion",
    title: "Explosion industrial",
    domain: "explosion",
    subtype: "industrial_blast",
    severity: "critical",
    country: "CL",
    region: "Antofagasta",
    locality: "Mejillones",
    latitude: -23.1,
    longitude: -70.45,
    sourceId: "emars",
    sourceName: "eMARS demo",
    summary: "Explosion en instalacion industrial con riesgo secundario de incendio.",
    technicalFactors: { explosionType: "vapor_cloud", infrastructureAffected: "industrial plant", hospitalLoadRisk: "high" },
    tags: ["explosion", "industrial"],
  }),
  incident({
    id: "ki-radiological-event",
    title: "Evento radiologico",
    domain: "nuclear_radiological",
    subtype: "lost_source_exposure",
    severity: "high",
    country: "CL",
    region: "Metropolitana",
    locality: "Santiago",
    latitude: -33.45,
    longitude: -70.66,
    sourceId: "iaea_ines",
    sourceName: "IAEA INES demo",
    summary: "Exposicion radiologica demo con necesidad de aislamiento y medicion.",
    technicalFactors: { isotope: "Cs-137", radiationDose: "unknown", infrastructureAffected: "industrial warehouse" },
    tags: ["radiological", "public-health"],
  }),
  incident({
    id: "ki-infrastructure-collapse",
    title: "Colapso de infraestructura",
    domain: "bridge_collapse",
    subtype: "bridge_failure",
    severity: "high",
    country: "CL",
    region: "Araucania",
    locality: "Temuco",
    latitude: -38.7359,
    longitude: -72.5904,
    sourceId: "nist_ncstar",
    sourceName: "NIST NCSTAR demo",
    summary: "Colapso estructural que interrumpe movilidad y acceso de emergencia.",
    technicalFactors: { structuralFailureMode: "progressive_collapse", infrastructureAffected: "bridge", routeDisruptionRisk: "critical" },
    tags: ["infrastructure", "bridge", "routing"],
  }),
  incident({
    id: "ki-urban-flood",
    title: "Inundacion urbana",
    domain: "flood",
    subtype: "urban_pluvial_flood",
    severity: "medium",
    country: "CL",
    region: "Metropolitana",
    locality: "Santiago",
    latitude: -33.44,
    longitude: -70.68,
    sourceId: "noaa_storm_events",
    sourceName: "NOAA Storm Events demo",
    summary: "Inundacion urbana por lluvia intensa con pasos bajo nivel anegados.",
    technicalFactors: { weatherConditions: "heavy rain", infrastructureAffected: "underpasses", roadClosureRisk: "medium", exposedPopulation: 8000 },
    tags: ["flood", "urban", "weather"],
  }),
];

export const demoKnowledgeEvidence: ArgusKnowledgeEvidenceItem[] = demoKnowledgeIncidents.map((incident) => ({
  id: `evidence-${incident.id}`,
  incidentId: incident.id,
  sourceId: incident.sourceIds[0] ?? "argus_demo",
  sourceName: incident.sourceNames[0] ?? "ARGUS demo",
  title: `Evidence for ${incident.title}`,
  summary: incident.summary,
  confidenceScore: {
    sourceReliability: incident.sourceReliabilityScore,
    corroborationCount: 1,
    geolocationPrecision: typeof incident.latitude === "number" && typeof incident.longitude === "number" ? 80 : 30,
    timestampPrecision: 60,
    documentQuality: 65,
    extractionConfidence: incident.confidenceScore,
    conflictWithOtherSources: 0,
    finalConfidence: incident.confidenceScore,
    label: incident.confidenceScore >= 75 ? "high" : "medium",
  },
  locationConfidence: typeof incident.latitude === "number" && typeof incident.longitude === "number" ? 80 : 20,
  timestampConfidence: 60,
  extractedAt: now,
}));

export const demoKnowledgeLessons: ArgusLessonLearned[] = demoKnowledgeIncidents.flatMap(
  (incident) => incident.lessonsLearned
);

import type { ArgusIncidentKnowledge } from "@/types/knowledgeIntake";

/**
 * Fixtures QA de ARGUS Global Watch (`/api/vigia/run?seed=true`).
 * Cubren los escenarios de aceptación del motor sin llamar APIs externas:
 * incendio forestal en España (EFFIS), focos FIRMS agrupables, inundación
 * internacional (GDACS), terremoto USGS y crisis humanitaria (ReliefWeb).
 * La alerta roja SENAPRED y la tormenta DMC se cubren con
 * `chileAlertsSeed`, que el motor promueve por su pipeline propio.
 *
 * Fechas relativas al momento de la corrida para que el ciclo de vida los
 * trate como eventos vivos.
 */

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function baseRecommended(id: string, text: string, priority: "medium" | "high" | "critical") {
  return [
    {
      id: `rec-${id}`,
      audience: "institutional" as const,
      priority,
      text,
      rationale: "Fixture QA de Global Watch.",
      confidenceScore: 80,
      safetyLimit: "Dato de prueba; no usar para decisiones reales.",
      requiresHumanValidation: true,
    },
  ];
}

/** Foco térmico FIRMS individual — el motor los agrupa con el clusterer real. */
function firmsFocus(index: number, latitude: number, longitude: number, frp: number): ArgusIncidentKnowledge {
  const id = `firms-seed-focus-${index}`;
  return {
    id,
    title: `Foco térmico VIIRS #${index}`,
    summary: "Detección térmica satelital de prueba (fixture QA).",
    domain: "wildfire",
    subtype: "thermal_anomaly",
    severity: "medium",
    confidenceScore: 60,
    actionabilityScore: 50,
    sourceReliabilityScore: 80,
    evidenceCount: 1,
    sourceIds: ["nasa_firms"],
    sourceNames: ["NASA FIRMS"],
    occurredAt: hoursAgo(3),
    detectedAt: hoursAgo(2),
    country: "Chile",
    latitude,
    longitude,
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    technicalFactors: { frp, satellite: "VIIRS_SNPP_NRT" } as unknown as ArgusIncidentKnowledge["technicalFactors"],
    causes: ["Anomalía térmica satelital"],
    contributingFactors: [],
    responseActions: [],
    lessonsLearned: [],
    recommendedActions: baseRecommended(id, "Verificar con autoridad local de incendios.", "medium"),
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: ["nasa-firms", "seed"],
    language: "es",
    rawEvidenceRefs: ["https://firms.modaps.eosdis.nasa.gov/map/"],
    createdAt: hoursAgo(3),
    updatedAt: hoursAgo(2),
  };
}

export const globalWatchSeedIncidents: ArgusIncidentKnowledge[] = [
  // 1. Incendio forestal relevante en España vía Copernicus EFFIS ⇒ WILDFIRE high en el mapa.
  {
    id: "effis-seed-es-caceres",
    title: "Incendio forestal en Cáceres, Extremadura, España (~2.400 ha)",
    summary:
      "Copernicus EFFIS reporta un área quemada de aproximadamente 2.400 hectáreas en la provincia de Cáceres, Extremadura. Frente activo con avance hacia zonas de interfaz urbano-forestal. Evacuación preventiva de dos aldeas ordenada por Protección Civil.",
    domain: "wildfire",
    subtype: "forest_fire",
    severity: "high",
    confidenceScore: 85,
    actionabilityScore: 80,
    sourceReliabilityScore: 90,
    evidenceCount: 1,
    sourceIds: ["copernicus_effis"],
    sourceNames: ["Copernicus EFFIS"],
    occurredAt: hoursAgo(18),
    detectedAt: hoursAgo(1),
    country: "España",
    region: "Extremadura",
    locality: "Cáceres",
    latitude: 39.62,
    longitude: -6.09,
    geometry: { type: "Point", coordinates: [-6.09, 39.62] },
    impact: { environmentalImpact: "Área quemada estimada: 2.400 ha." },
    technicalFactors: { areaHa: 2400, country: "España", province: "Cáceres" } as unknown as ArgusIncidentKnowledge["technicalFactors"],
    causes: ["Incendio de vegetación detectado por Copernicus EFFIS"],
    contributingFactors: ["Ola de calor", "Viento moderado"],
    responseActions: ["UME desplegada", "Evacuación preventiva de aldeas"],
    lessonsLearned: [],
    recommendedActions: baseRecommended("effis-seed-es-caceres", "Revisar perímetro EFFIS y confirmar evacuaciones con Protección Civil España.", "high"),
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: ["copernicus-effis", "wildfire", "europe", "seed"],
    language: "es",
    rawEvidenceRefs: ["https://forest-fire.emergency.copernicus.eu/"],
    createdAt: hoursAgo(18),
    updatedAt: hoursAgo(1),
  },

  // 2. Cinco focos FIRMS en la misma celda ⇒ el clusterer debe producir UN incidente.
  firmsFocus(1, -33.05, -71.42, 120),
  firmsFocus(2, -33.07, -71.45, 210),
  firmsFocus(3, -33.09, -71.4, 95),
  firmsFocus(4, -33.06, -71.47, 310),
  firmsFocus(5, -33.08, -71.44, 180),

  // 3. Inundación internacional vía GDACS ⇒ FLOOD critical (víctimas + desplazados).
  {
    id: "gdacs-seed-flood-bd",
    title: "Inundaciones severas en Sylhet, Bangladesh",
    summary:
      "GDACS alerta naranja por inundaciones monzónicas en la división de Sylhet, Bangladesh. Al menos 14 víctimas fatales reportadas y más de 90.000 personas desplazadas. Infraestructura de agua potable afectada en tres distritos.",
    domain: "flood",
    subtype: "flood",
    severity: "high",
    confidenceScore: 88,
    actionabilityScore: 85,
    sourceReliabilityScore: 92,
    evidenceCount: 1,
    sourceIds: ["gdacs"],
    sourceNames: ["GDACS"],
    occurredAt: hoursAgo(30),
    detectedAt: hoursAgo(2),
    country: "Bangladesh",
    region: "Sylhet",
    latitude: 24.9,
    longitude: 91.87,
    geometry: { type: "Point", coordinates: [91.87, 24.9] },
    casualties: { fatalities: 14 } as ArgusIncidentKnowledge["casualties"],
    technicalFactors: { alertLevel: "orange", eventType: "FL" } as unknown as ArgusIncidentKnowledge["technicalFactors"],
    causes: ["Lluvias monzónicas extremas"],
    contributingFactors: ["Desborde de ríos"],
    responseActions: ["Centros de evacuación habilitados"],
    lessonsLearned: [],
    recommendedActions: baseRecommended("gdacs-seed-flood-bd", "Monitorear crecidas y coordinar con OCHA/autoridad local.", "critical"),
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: ["gdacs", "flood", "seed"],
    language: "es",
    rawEvidenceRefs: ["https://www.gdacs.org/"],
    createdAt: hoursAgo(30),
    updatedAt: hoursAgo(2),
  },

  // 6. Terremoto USGS M7.1 con bandera de tsunami ⇒ EARTHQUAKE critical.
  {
    id: "usgs-seed-eq-pe",
    title: "M 7.1 - costa central de Perú",
    summary:
      "USGS reporta terremoto de magnitud 7.1 frente a la costa central de Perú, profundidad 28 km. Bandera de tsunami activa; evaluación de impacto costero en curso.",
    domain: "earthquake",
    subtype: "major_shallow_earthquake",
    severity: "critical",
    confidenceScore: 92,
    actionabilityScore: 88,
    sourceReliabilityScore: 94,
    evidenceCount: 1,
    sourceIds: ["usgs_earthquake"],
    sourceNames: ["USGS Earthquake Hazards"],
    occurredAt: hoursAgo(4),
    detectedAt: hoursAgo(4),
    country: "Perú",
    locality: "Costa central de Perú",
    latitude: -12.3,
    longitude: -77.6,
    geometry: { type: "Point", coordinates: [-77.6, -12.3, 28] },
    technicalFactors: { magnitude: 7.1, depthKm: 28, tsunamiFlag: true } as unknown as ArgusIncidentKnowledge["technicalFactors"],
    causes: ["Terremoto tectónico reportado por USGS"],
    contributingFactors: ["Bandera de tsunami USGS presente"],
    responseActions: ["Revisar autoridades sísmicas y de tsunami oficiales"],
    lessonsLearned: [],
    recommendedActions: baseRecommended("usgs-seed-eq-pe", "Validar impacto local y exposición costera con autoridades oficiales.", "critical"),
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: ["usgs", "earthquake", "tsunami-flag", "seed"],
    language: "es",
    rawEvidenceRefs: ["https://earthquake.usgs.gov/"],
    createdAt: hoursAgo(4),
    updatedAt: hoursAgo(4),
  },

  // 7. Crisis humanitaria vía ReliefWeb ⇒ HUMANITARIAN_CRISIS con evacuación ⇒ critical.
  {
    id: "reliefweb-seed-crisis-sd",
    title: "Crisis humanitaria por desplazamiento masivo en Darfur, Sudán",
    summary:
      "ReliefWeb/OCHA reporta desplazamiento masivo de más de 200.000 personas en Darfur del Norte, con evacuación de campamentos y acceso humanitario restringido. Necesidades críticas de agua, alimentos y atención médica.",
    domain: "humanitarian_crisis",
    subtype: "humanitarian_crisis",
    severity: "high",
    confidenceScore: 80,
    actionabilityScore: 75,
    sourceReliabilityScore: 82,
    evidenceCount: 1,
    sourceIds: ["reliefweb"],
    sourceNames: ["ReliefWeb"],
    occurredAt: hoursAgo(48),
    detectedAt: hoursAgo(6),
    country: "Sudán",
    region: "Darfur del Norte",
    latitude: 13.63,
    longitude: 25.35,
    geometry: { type: "Point", coordinates: [25.35, 13.63] },
    technicalFactors: { reportType: "situation_report" } as unknown as ArgusIncidentKnowledge["technicalFactors"],
    causes: ["Conflicto y desplazamiento masivo"],
    contributingFactors: ["Acceso humanitario restringido"],
    responseActions: ["Coordinación OCHA en curso"],
    lessonsLearned: [],
    recommendedActions: baseRecommended("reliefweb-seed-crisis-sd", "Seguir reportes de situación OCHA y corredores humanitarios.", "critical"),
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: ["reliefweb", "humanitarian", "seed"],
    language: "es",
    rawEvidenceRefs: ["https://reliefweb.int/"],
    createdAt: hoursAgo(48),
    updatedAt: hoursAgo(6),
  },

  // Noticia confiable con impacto humano ⇒ candidato "No confirmado".
  {
    id: "news-seed-storm-ph",
    title: "Prensa reporta decenas de viviendas destruidas por tormenta en Mindanao",
    summary:
      "Medios locales confiables reportan viviendas destruidas y familias evacuadas tras tormenta severa en Mindanao, Filipinas. Sin confirmación oficial de PAGASA/NDRRMC todavía.",
    domain: "storm",
    subtype: "severe_weather",
    severity: "high",
    confidenceScore: 62,
    actionabilityScore: 55,
    sourceReliabilityScore: 60,
    evidenceCount: 1,
    sourceIds: ["news_evidence"],
    sourceNames: ["NewsEvidence"],
    occurredAt: hoursAgo(10),
    detectedAt: hoursAgo(5),
    country: "Filipinas",
    region: "Mindanao",
    latitude: 7.19,
    longitude: 125.45,
    geometry: { type: "Point", coordinates: [125.45, 7.19] },
    technicalFactors: { mediaCount: 3 } as unknown as ArgusIncidentKnowledge["technicalFactors"],
    causes: ["Tormenta severa reportada por prensa"],
    contributingFactors: [],
    responseActions: [],
    lessonsLearned: [],
    recommendedActions: baseRecommended("news-seed-storm-ph", "Buscar confirmación oficial PAGASA/NDRRMC antes de escalar.", "high"),
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: ["news", "seed"],
    language: "es",
    rawEvidenceRefs: ["https://reliefweb.int/updates"],
    createdAt: hoursAgo(10),
    updatedAt: hoursAgo(5),
  },
];

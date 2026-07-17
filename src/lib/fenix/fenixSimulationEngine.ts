import {
  demoFenixPopulation,
  demoFenixRoutes,
  demoFenixScenarios,
  demoFenixShelters,
} from "@/data/fenixDemo";
import { buildRouteMetadata } from "@/lib/routes/officialRouteRegistry";
import {
  aggregateConnectedUsersByArea,
  aggregateReportsByArea,
  buildFenixEvidenceStack,
} from "@/lib/fenix/fenixDataFusion";
import {
  buildFenixDataQuality,
  buildFenixSourceAttributions,
} from "@/lib/fenix/fenixSourceAttribution";
import { buildGeoContextSummary } from "@/lib/fenix/fenixGeoContextEngine";
import {
  buildPopulationDisclaimer,
  classifyExposureLevel,
} from "@/lib/fenix/populationExposureEstimator";
import {
  buildRouteImpactSummary,
  estimateRouteRisk,
  suggestRoutesForReview,
} from "@/lib/fenix/routeImpactAnalyzer";
import type {
  FenixActionItem,
  FenixActionPlan,
  FenixEvacuationRoute,
  FenixInstitutionalAccessLevel,
  FenixRouteCollapsePrediction,
  FenixShelter,
  FenixSimulationResult as LegacyFenixSimulationResult,
  FenixVehicleType,
} from "@/types/fenix";
import type {
  FenixAffectedZone,
  FenixCrisisCourse,
  FenixGeoJsonCircle,
  FenixGrowthDirection,
  FenixPredictionFrame,
  FenixRecommendedAction,
  FenixRouteImpact,
  FenixSimulationInput,
  FenixSimulationResult,
} from "@/types/fenixSimulation";

const emergencyVehicles: FenixVehicleType[] = [
  "ambulance",
  "firetruck",
  "police",
  "military",
];

const directionBearingDeg: Record<FenixGrowthDirection, number> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
};

function projectCoordinate(
  origin: [number, number],
  bearingDeg: number,
  distanceKm: number
): [number, number] {
  if (distanceKm <= 0) return origin;
  const earthRadiusKm = 6371;
  const angularDistance = distanceKm / earthRadiusKm;
  const bearing = (bearingDeg * Math.PI) / 180;
  const lat1 = (origin[0] * Math.PI) / 180;
  const lon1 = (origin[1] * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return [
    Number(((lat2 * 180) / Math.PI).toFixed(5)),
    Number((((lon2 * 180) / Math.PI + 540) % 360 - 180).toFixed(5)),
  ];
}

function routeScore(route: FenixEvacuationRoute) {
  const statusPenalty =
    route.status === "blocked"
      ? 1000
      : route.status === "critical"
        ? 80
        : route.status === "congested"
          ? 35
          : route.status === "emergency_only"
            ? 20
            : 0;
  const saturation = route.currentFlowPerHour / Math.max(1, route.capacityPerHour);
  return route.estimatedMinutes + route.exposureScore + statusPenalty + saturation * 30;
}

function buildCollapsePredictions(
  routes: FenixEvacuationRoute[]
): FenixRouteCollapsePrediction[] {
  return routes.map((route) => {
    const saturation = route.currentFlowPerHour / Math.max(1, route.capacityPerHour);
    const collapseRisk =
      route.status === "blocked"
        ? 1
        : Math.min(0.98, saturation * 0.55 + route.exposureScore / 180);
    return {
      routeId: route.id,
      routeName: route.name,
      status: route.status,
      collapseRisk,
      estimatedMinutesToSaturation:
        collapseRisk >= 0.7 ? Math.max(10, Math.round((1 - Math.min(0.95, saturation)) * 90)) : undefined,
      reason:
        route.status === "blocked"
          ? "Ruta bloqueada en escenario demo."
          : collapseRisk >= 0.7
            ? "Flujo alto, capacidad limitada o exposición elevada."
            : "Ruta estable bajo monitoreo.",
    };
  });
}

function buildActionPlan(
  scenarioId: string,
  predictions: FenixRouteCollapsePrediction[],
  shelters: typeof demoFenixShelters
): FenixActionPlan {
  const items: FenixActionItem[] = [];
  const criticalPrediction = predictions.find((prediction) => prediction.collapseRisk >= 0.7);
  if (criticalPrediction) {
    items.push({
      id: `fenix-action-route-${criticalPrediction.routeId}`,
      priority: "critical",
      title: "Revisar ruta critica",
      description: `Evaluar desvio o gestion de flujo para ${criticalPrediction.routeName}.`,
      reason: criticalPrediction.reason,
      relatedEntityId: criticalPrediction.routeId,
      expectedImpact: "Apoyar coordinacion para reducir exposicion y saturacion operacional.",
      suggestedStatus: "requires_review",
    });
  }

  const nearCapacityShelter = shelters.find((shelter) => shelter.status === "near_capacity");
  if (nearCapacityShelter) {
    items.push({
      id: `fenix-action-shelter-${nearCapacityShelter.id}`,
      priority: "high",
      title: "Preparar refugio alternativo",
      description: `${nearCapacityShelter.name} esta cerca de capacidad en el demo.`,
      reason: "Apoyar decision humana para evitar saturacion de refugio principal.",
      relatedEntityId: nearCapacityShelter.id,
      expectedImpact: "Distribuir llegada de personas evacuadas.",
      suggestedStatus: "requires_review",
    });
  }

  items.push({
    id: `fenix-action-public-${scenarioId}`,
    priority: "medium",
    title: "Preparar mensaje publico",
    description: "Redactar mensaje simple para poblacion civil sujeto a fuente oficial.",
    reason: "La vista publica debe evitar sobrecarga y no reemplazar autoridad.",
    expectedImpact: "Mejorar claridad y reducir exposicion innecesaria.",
    suggestedStatus: "monitor",
  });

  return {
    id: `fenix-plan-${scenarioId}`,
    scenarioId,
    generatedAt: new Date().toISOString(),
    items,
  };
}

export function buildInitialCrisisArea(input: FenixSimulationInput): FenixAffectedZone {
  return {
    id: "fenix-zone-t0",
    timeLabel: "T+0",
    radiusKm: input.initialRadiusKm,
    center: [input.initialLocation.latitude, input.initialLocation.longitude],
    exposureLevel: input.initialSeverity,
    isEstimated: true,
  };
}

export function projectCrisisGrowth(input: FenixSimulationInput) {
  const growthKm = input.growth.speedKmh * (input.simulationMinutes / 60);
  const bearing = directionBearingDeg[input.growth.direction] ?? 0;
  const projectedCenter = projectCoordinate(
    [input.initialLocation.latitude, input.initialLocation.longitude],
    bearing,
    growthKm
  );
  return {
    direction: input.growth.direction,
    growthKm,
    projectedCenter,
    centerOffset: [
      Number((projectedCenter[0] - input.initialLocation.latitude).toFixed(5)),
      Number((projectedCenter[1] - input.initialLocation.longitude).toFixed(5)),
    ] as [number, number],
  };
}

export function estimateAffectedZones(input: FenixSimulationInput): FenixAffectedZone[] {
  const milestones = [15, 30, 60, 180, 360, 720, 1440].filter(
    (minutes) => minutes <= input.simulationMinutes
  );
  const bearing = directionBearingDeg[input.growth.direction] ?? 0;
  const origin: [number, number] = [
    input.initialLocation.latitude,
    input.initialLocation.longitude,
  ];
  return [0, ...milestones].map((minutes, index) => {
    const hours = minutes / 60;
    const growth = input.growth.speedKmh * hours;
    const radius = input.initialRadiusKm + growth * 0.35;
    return {
      id: `fenix-zone-${minutes}`,
      timeLabel: minutes === 0 ? "T+0" : `T+${minutes} min`,
      radiusKm: Number(radius.toFixed(1)),
      center: projectCoordinate(origin, bearing, growth),
      exposureLevel:
        index >= 4 || input.initialSeverity === "critical"
          ? "critical"
          : index >= 2
            ? "high"
            : input.initialSeverity,
      isEstimated: true,
    };
  });
}

function buildProjectedZonesGeoJson(zones: FenixAffectedZone[]): FenixGeoJsonCircle[] {
  return zones.map((zone) => ({
    type: "Feature",
    properties: {
      id: zone.id,
      timeLabel: zone.timeLabel,
      radiusKm: zone.radiusKm,
      exposureLevel: zone.exposureLevel,
      isEstimated: zone.isEstimated,
    },
    geometry: {
      type: "Point",
      coordinates: [zone.center[1], zone.center[0]],
    },
  }));
}

function buildPredictionFrames(params: {
  affectedZones: FenixAffectedZone[];
  input: FenixSimulationInput;
  totalExposedPopulation: number;
  routeImpacts: FenixRouteImpact[];
  relatedReports: number;
  confidence: number;
}): FenixPredictionFrame[] {
  const { affectedZones, input, totalExposedPopulation, routeImpacts, relatedReports, confidence } = params;
  const middleIndex = Math.max(1, Math.floor((affectedZones.length - 1) / 2));
  const selectedZones = [
    affectedZones[0],
    affectedZones[middleIndex],
    affectedZones[affectedZones.length - 1],
  ].filter(Boolean);
  const titles = [
    "Fase 1 - Impacto inicial",
    "Fase 2 - Proyeccion media",
    "Fase 3 - Proyeccion extendida",
  ] as const;
  const labels = [
    "avance inicial estimado",
    "avance medio estimado",
    "avance extendido/final estimado",
  ] as const;
  const origin: [number, number] = [
    input.initialLocation.latitude,
    input.initialLocation.longitude,
  ];

  return selectedZones.slice(0, 3).map((zone, index) => ({
    id: `fenix-frame-${index + 1}-${zone.timeLabel.replace(/\s+/g, "-").toLowerCase()}`,
    phaseIndex: (index + 1) as 1 | 2 | 3,
    title: titles[index],
    label: labels[index],
    summary:
      index === 0
        ? "Situacion inicial sobre la coordenada ingresada."
        : index === 1
          ? "Proyeccion intermedia segun velocidad y direccion declaradas."
          : "Proyeccion extendida para revisar alcance operativo preliminar.",
    timeLabel: zone.timeLabel,
    radiusKm: zone.radiusKm,
    center: zone.center,
    origin,
    direction: input.growth.direction,
    populationExposure: totalExposedPopulation,
    routeImpacts: routeImpacts.filter((route) => route.status !== "open").length,
    relatedReports,
    confidence,
    uncertainty: input.uncertainty,
    severity: zone.exposureLevel,
    isDemo: true,
  }));
}

export function estimateRouteImpacts(
  routes: FenixEvacuationRoute[],
  zones: FenixAffectedZone[]
): FenixRouteImpact[] {
  const metadata = buildRouteMetadata({ isDemo: true });
  return routes.map((route) => ({
    routeId: route.id,
    routeName: route.name,
    status:
      route.status === "blocked"
        ? "blocked"
        : route.status === "critical"
          ? "compromised"
          : route.status === "congested"
            ? "degraded"
            : "open",
    impact: `${route.name}: estimación ARGUS sobre ${zones.length} zonas. Verificar con autoridad.`,
    alternative: route.status === "blocked" ? "Buscar ruta sugerida preliminar alternativa." : undefined,
    metadata,
  }));
}

export function estimateConnectedUsersExposure(
  usersAggregate: ReturnType<typeof aggregateConnectedUsersByArea>,
  zones: FenixAffectedZone[]
) {
  return {
    ...usersAggregate,
    areaLabel: zones[zones.length - 1]?.timeLabel ?? usersAggregate.areaLabel,
  };
}

export function estimateReportDensity(_reports: unknown[], zones: FenixAffectedZone[]) {
  return aggregateReportsByArea(zones);
}

export function estimateShelterPressure(shelters: FenixShelter[]) {
  return shelters.map((shelter) => {
    const hasCapacityData = typeof shelter.capacity === "number" && typeof shelter.currentOccupancy === "number" && shelter.capacity > 0;
    const ratio = hasCapacityData ? shelter.currentOccupancy! / shelter.capacity! : null;
    return {
      id: shelter.id,
      name: shelter.name,
      pressure:
        ratio === null
          ? ("unknown" as const)
          : ratio > 0.9
            ? ("critical" as const)
            : ratio > 0.75
              ? ("high" as const)
              : ratio > 0.45
                ? ("medium" as const)
                : ("low" as const),
    };
  });
}

/**
 * Puntaje de preferencia de un refugio candidato (menor = mas recomendable),
 * usado tanto para el ranking de `recommendedShelter` como por cualquier
 * consumidor futuro que necesite comparar refugios reales entre si. Pondera
 * ocupacion, estado de ruta, vigencia y confianza del dato — no solo la
 * razon de ocupacion (spec ARGUS v1.0.3.4 §14). Datos demo (sin
 * routeStatus/confidence/isStale) se comportan igual que antes: la
 * ocupacion sigue siendo el unico factor real cuando el resto es unknown.
 */
export function scoreShelterCandidate(shelter: FenixShelter): number {
  let score =
    typeof shelter.capacity === "number" && typeof shelter.currentOccupancy === "number" && shelter.capacity > 0
      ? (shelter.currentOccupancy / shelter.capacity) * 100
      : 50;

  if (shelter.routeStatus === "blocked") score += 1000;
  else if (shelter.routeStatus === "congested") score += 25;
  else if (shelter.routeStatus === undefined || shelter.routeStatus === "unknown") score += 10;

  if (shelter.isStale) score += 30;

  const confidence = shelter.confidence ?? 60;
  score += (100 - confidence) * 0.3;

  return score;
}

export function buildPublicGuidance(result: Pick<FenixSimulationResult, "isDemo" | "uncertainty">) {
  return [
    "Mantengase atento a fuentes oficiales y evite acercarse al area afectada.",
    "Ruta sugerida preliminar: verificar con autoridad antes de desplazarse.",
    result.isDemo
      ? "Resultado demo/preview: no reemplaza instrucciones oficiales."
      : "Resultado operativo: sujeto a validacion humana.",
  ];
}

export function buildInstitutionalActionPlan(result: Pick<FenixSimulationResult, "routeImpacts">): FenixRecommendedAction[] {
  return [
    {
      id: "fenix-action-verify-authority",
      audience: "institutional",
      priority: "critical",
      text: "Verificar estado de rutas con autoridad competente antes de emitir instrucciones.",
      safetyLimit: "No declarar evacuacion oficial desde ARGUS sin mandato institucional.",
    },
    {
      id: "fenix-action-monitor-reports",
      audience: "institutional",
      priority: "high",
      text: `Revisar ${result.routeImpacts.length} impactos de ruta estimados y reportes ciudadanos agregados.`,
      safetyLimit: "No exponer usuarios individuales ni datos sensibles.",
    },
  ];
}

export function calculateFenixConfidence(result: Pick<FenixSimulationResult, "isDemo" | "uncertainty">) {
  const base = result.isDemo ? 62 : 78;
  const penalty = result.uncertainty === "high" ? 18 : result.uncertainty === "medium" ? 8 : 0;
  return Math.max(25, base - penalty);
}

function buildSimulationInput(input: {
  scenarioId?: string;
  vehicleType?: FenixVehicleType;
  accessLevel?: FenixInstitutionalAccessLevel;
} & Partial<FenixSimulationInput>): FenixSimulationInput {
  const scenario =
    demoFenixScenarios.find((item) => item.id === input.scenarioId) ??
    demoFenixScenarios[0];
  return {
    scenarioId: scenario.id,
    crisisType: input.crisisType ?? scenario.hazardType,
    initialLocation: input.initialLocation ?? {
      latitude: scenario.center[0],
      longitude: scenario.center[1],
      commune: scenario.regionName,
      region: scenario.regionName,
    },
    initialRadiusKm: input.initialRadiusKm ?? scenario.radiusKm,
    growth: input.growth ?? { direction: "NE", speedKmh: 2.5 },
    simulationMinutes: input.simulationMinutes ?? 60,
    exposedPopulationEstimate: input.exposedPopulationEstimate,
    mobility: input.mobility ?? input.vehicleType ?? "car",
    mode: input.mode ?? input.accessLevel ?? "public",
    initialSeverity: input.initialSeverity ?? "high",
    uncertainty: input.uncertainty ?? "medium",
    sources: input.sources ?? {
      citizenReports: true,
      connectedUsersAggregate: true,
      officialOrOpenRoutes: true,
      shelters: true,
      medicalPoints: true,
      existingIncidents: true,
      weather: true,
    },
  };
}

export function runFenixSimulation(input: {
  scenarioId?: string;
  vehicleType?: FenixVehicleType;
  accessLevel?: FenixInstitutionalAccessLevel;
} & Partial<FenixSimulationInput>): LegacyFenixSimulationResult & FenixSimulationResult {
  const normalizedInput = buildSimulationInput(input);
  const scenario =
    demoFenixScenarios.find((item) => item.id === normalizedInput.scenarioId) ??
    demoFenixScenarios[0];
  const vehicleType =
    normalizedInput.mobility === "mixed" || normalizedInput.mobility === "light_vehicle" || normalizedInput.mobility === "logistics_truck"
      ? "car"
      : normalizedInput.mobility;
  const accessLevel = normalizedInput.mode;
  const routes = demoFenixRoutes.filter((route) => route.scenarioId === scenario.id);
  const shelters = demoFenixShelters.filter((shelter) => shelter.scenarioId === scenario.id);
  const population = demoFenixPopulation.filter(
    (item) => item.scenarioId === scenario.id
  );

  const usableRoutes = routes.filter((route) => {
    if (route.status === "blocked") return false;
    if (route.status === "emergency_only" && !emergencyVehicles.includes(vehicleType)) {
      return accessLevel === "institutional" && emergencyVehicles.includes(vehicleType);
    }
    return route.allowedVehicles.includes(vehicleType);
  });
  const recommendedPublicRoute =
    usableRoutes.sort((left, right) => routeScore(left) - routeScore(right))[0] ??
    routes.find((route) => route.status !== "blocked");
  const recommendedShelter = shelters
    .filter((shelter) => shelter.status === "available" || shelter.status === "near_capacity")
    // "reference" (existe pero sin evidencia operacional confirmada, p.ej.
    // solo Codigo Azul) nunca se recomienda como destino — spec ARGUS
    // v1.0.3.5 §23. Ausente en datos demo (siempre undefined ahi), sin
    // efecto sobre el comportamiento existente.
    .filter((shelter) => shelter.fenixRecommendationTier !== "reference")
    .sort((left, right) => scoreShelterCandidate(left) - scoreShelterCandidate(right))[0];
  const predictions = buildCollapsePredictions(routes);
  const actionPlan = buildActionPlan(scenario.id, predictions, shelters);
  const totalExposedPopulation = normalizedInput.exposedPopulationEstimate ??
    population.reduce((sum, item) => sum + item.estimatedPopulation, 0);
  const affectedZones = estimateAffectedZones(normalizedInput);
  const projectedZonesGeoJson = buildProjectedZonesGeoJson(affectedZones);
  const routeImpacts = estimateRouteImpacts(routes, affectedZones);
  const geoContext = buildGeoContextSummary(normalizedInput);
  const sourcesUsed = buildFenixSourceAttributions(normalizedInput);
  const dataQuality = buildFenixDataQuality(normalizedInput, sourcesUsed.length);
  const connectedUsersAggregate = estimateConnectedUsersExposure(
    aggregateConnectedUsersByArea(affectedZones),
    affectedZones
  );
  const reportDensity = estimateReportDensity([], affectedZones);
  const shelterPressure = estimateShelterPressure(shelters);
  const medicalPoints = shelters
    .filter((shelter) => shelter.medicalSupport)
    .map((shelter) => ({
      id: shelter.id,
      name: shelter.name,
      distanceKm: Number(Math.max(0.8, (shelter.currentOccupancy ?? 0) / 1000).toFixed(1)),
      isDemo: true,
    }));
  const isDemo = true;
  const baseForConfidence = { isDemo, uncertainty: normalizedInput.uncertainty };
  const institutionalActionPlan = buildInstitutionalActionPlan({ routeImpacts });
  const confidence = calculateFenixConfidence(baseForConfidence);
  const disclaimers = [
    "Estimación ARGUS: no reemplaza autoridad ni servicios oficiales.",
    "Rutas oficiales no integradas todavía; fallback demo etiquetado.",
    "Usuarios conectados se muestran sólo como agregados.",
    buildPopulationDisclaimer(),
  ];
  const predictionFrames = buildPredictionFrames({
    affectedZones,
    input: normalizedInput,
    totalExposedPopulation,
    routeImpacts,
    relatedReports: reportDensity.relatedReports,
    confidence,
  });
  const riskBreakdown = [
    {
      id: "risk-population",
      label: "Población expuesta",
      level: classifyExposureLevel(totalExposedPopulation),
      detail: buildPopulationDisclaimer(),
    },
    {
      id: "risk-routes",
      label: "Rutas/calles",
      level: routeImpacts.some((route) => estimateRouteRisk(route) === "critical") ? "critical" : "high",
      detail: buildRouteImpactSummary(routeImpacts),
    },
    {
      id: "risk-reports",
      label: "Reportes ciudadanos",
      level: reportDensity.densityLabel,
      detail: "Conteo agregado demo; no expone identidad individual.",
    },
  ];
  const course: FenixCrisisCourse = {
    initialCrisis: `${scenario.name} en ${scenario.regionName}`,
    expectedGrowth: `Crecimiento ${normalizedInput.growth.direction} a ${normalizedInput.growth.speedKmh} km/h durante ${normalizedInput.simulationMinutes} min.`,
    affectedZones,
    routeImpacts,
    populationExposure: {
      estimatedPeople: totalExposedPopulation,
      vulnerableEstimate: population.reduce(
        (sum, item) => sum + (item.vulnerablePopulationEstimate ?? 0),
        0
      ),
      exposureLevel: normalizedInput.initialSeverity,
      note: "Estimación agregada; no identifica personas.",
    },
    connectedUsersAggregate,
    reportDensity,
    shelters: shelterPressure,
    medicalPoints,
    recommendedActions: [
      ...institutionalActionPlan,
      {
        id: "fenix-action-public-guidance",
        audience: "public",
        priority: "medium",
        text: "Revise fuentes oficiales y prepare salida solo si la autoridad lo indica.",
        safetyLimit: "No emitir evacuacion oficial desde simulacion demo.",
      },
    ],
    confidence,
    uncertainty: normalizedInput.uncertainty,
    limitations: [...disclaimers, ...buildFenixEvidenceStack(affectedZones).signals],
  };

  const simulationResult: FenixSimulationResult = {
    simulationId: `fenix-${scenario.id}-${Date.now()}`,
    input: normalizedInput,
    generatedAt: new Date().toISOString(),
    course,
    affectedZones,
    routeImpacts,
    connectedUsersAggregate,
    reportDensity,
    shelters: shelterPressure,
    medicalPoints,
    confidence,
    uncertainty: normalizedInput.uncertainty,
    publicGuidance: buildPublicGuidance(baseForConfidence),
    institutionalActionPlan,
    geoContext,
    nearbySettlements: geoContext.nearbySettlements,
    predictionFrames,
    riskBreakdown,
    actionPlanResponse: {
      routeReview: suggestRoutesForReview(routeImpacts),
    },
    mapCenter: [
      normalizedInput.initialLocation.latitude,
      normalizedInput.initialLocation.longitude,
    ],
    initialRadiusKm: normalizedInput.initialRadiusKm,
    projectedZonesGeoJson,
    sourcesUsed,
    dataQuality,
    disclaimers,
    isDemo,
  };

  return {
    ...simulationResult,
    scenarioId: scenario.id,
    accessLevel,
    hazardType: scenario.hazardType,
    totalExposedPopulation,
    estimatedEvacuationTimeMinutes: Math.max(
      15,
      Math.round((recommendedPublicRoute?.estimatedMinutes ?? 30) * 1.35)
    ),
    recommendedPublicRoute,
    recommendedShelter,
    criticalRoutes: routes.filter((route) => route.status === "critical"),
    blockedRoutes: routes.filter((route) => route.status === "blocked"),
    collapsePredictions: predictions,
    shelterAnalysis: shelters,
    actionPlan,
    confidenceScore: confidence,
    publicInstruction: scenario.publicInstruction,
    summary:
      accessLevel === "institutional"
        ? "Simulacion demo institucional con rutas criticas, refugios y plan de apoyo a decision."
        : "Vista publica demo con ruta/refugio recomendado e instruccion simple.",
  };
}

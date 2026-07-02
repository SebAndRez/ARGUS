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
import type {
  FenixActionItem,
  FenixActionPlan,
  FenixEvacuationRoute,
  FenixInstitutionalAccessLevel,
  FenixRouteCollapsePrediction,
  FenixSimulationResult as LegacyFenixSimulationResult,
  FenixVehicleType,
} from "@/types/fenix";
import type {
  FenixAffectedZone,
  FenixCrisisCourse,
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

const directionOffset: Record<string, [number, number]> = {
  N: [0.08, 0],
  NE: [0.06, 0.06],
  E: [0, 0.08],
  SE: [-0.06, 0.06],
  S: [-0.08, 0],
  SW: [-0.06, -0.06],
  W: [0, -0.08],
  NW: [0.06, -0.06],
};

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
      title: "Descomprimir ruta crítica",
      description: `Revisar desvío o gestión de flujo para ${criticalPrediction.routeName}.`,
      reason: criticalPrediction.reason,
      relatedEntityId: criticalPrediction.routeId,
      expectedImpact: "Reducir exposición y saturación operacional.",
      suggestedStatus: "requires_review",
    });
  }

  const nearCapacityShelter = shelters.find((shelter) => shelter.status === "near_capacity");
  if (nearCapacityShelter) {
    items.push({
      id: `fenix-action-shelter-${nearCapacityShelter.id}`,
      priority: "high",
      title: "Abrir refugio alternativo",
      description: `${nearCapacityShelter.name} está cerca de capacidad en el demo.`,
      reason: "Evitar saturación de refugio principal.",
      relatedEntityId: nearCapacityShelter.id,
      expectedImpact: "Distribuir llegada de personas evacuadas.",
      suggestedStatus: "activate_now",
    });
  }

  items.push({
    id: `fenix-action-public-${scenarioId}`,
    priority: "medium",
    title: "Actualizar instrucción pública",
    description: "Preparar mensaje simple para población civil según fuente oficial.",
    reason: "La vista pública debe evitar sobrecarga y no reemplazar autoridad.",
    expectedImpact: "Mejorar claridad y reducir exposición innecesaria.",
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
  const offset = directionOffset[input.growth.direction] ?? directionOffset.N;
  const growthKm = input.growth.speedKmh * (input.simulationMinutes / 60);
  return {
    direction: input.growth.direction,
    growthKm,
    centerOffset: [offset[0] * growthKm, offset[1] * growthKm] as [number, number],
  };
}

export function estimateAffectedZones(input: FenixSimulationInput): FenixAffectedZone[] {
  const milestones = [15, 30, 60, 180, 360, 720, 1440].filter(
    (minutes) => minutes <= input.simulationMinutes
  );
  const offset = directionOffset[input.growth.direction] ?? directionOffset.N;
  return [0, ...milestones].map((minutes, index) => {
    const hours = minutes / 60;
    const growth = input.growth.speedKmh * hours;
    const radius = input.initialRadiusKm + growth * 0.35;
    return {
      id: `fenix-zone-${minutes}`,
      timeLabel: minutes === 0 ? "T+0" : `T+${minutes} min`,
      radiusKm: Number(radius.toFixed(1)),
      center: [
        Number((input.initialLocation.latitude + offset[0] * growth).toFixed(4)),
        Number((input.initialLocation.longitude + offset[1] * growth).toFixed(4)),
      ],
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
    areaLabel: zones.at(-1)?.timeLabel ?? usersAggregate.areaLabel,
  };
}

export function estimateReportDensity(_reports: unknown[], zones: FenixAffectedZone[]) {
  return aggregateReportsByArea(zones);
}

export function estimateShelterPressure(shelters: typeof demoFenixShelters) {
  return shelters.map((shelter) => {
    const ratio = shelter.currentOccupancy / Math.max(1, shelter.capacity);
    return {
      id: shelter.id,
      name: shelter.name,
      pressure: ratio > 0.9 ? "critical" as const : ratio > 0.75 ? "high" as const : ratio > 0.45 ? "medium" as const : "low" as const,
    };
  });
}

export function buildPublicGuidance(result: Pick<FenixSimulationResult, "isDemo" | "uncertainty">) {
  return [
    "Manténgase atento a fuentes oficiales y evite acercarse al área afectada.",
    "Ruta sugerida preliminar: verificar con autoridad antes de desplazarse.",
    result.isDemo
      ? "Resultado demo/preview: no reemplaza instrucciones oficiales."
      : "Resultado operativo: sujeto a validación humana.",
  ];
}

export function buildInstitutionalActionPlan(result: Pick<FenixSimulationResult, "routeImpacts">): FenixRecommendedAction[] {
  return [
    {
      id: "fenix-action-verify-authority",
      audience: "institutional",
      priority: "critical",
      text: "Confirmar estado de rutas con autoridad competente antes de emitir instrucciones.",
      safetyLimit: "No declarar evacuación oficial desde ARGUS sin mandato institucional.",
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
    .sort((left, right) => left.currentOccupancy / left.capacity - right.currentOccupancy / right.capacity)[0];
  const predictions = buildCollapsePredictions(routes);
  const actionPlan = buildActionPlan(scenario.id, predictions, shelters);
  const totalExposedPopulation = normalizedInput.exposedPopulationEstimate ??
    population.reduce((sum, item) => sum + item.estimatedPopulation, 0);
  const affectedZones = estimateAffectedZones(normalizedInput);
  const routeImpacts = estimateRouteImpacts(routes, affectedZones);
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
      distanceKm: Number(Math.max(0.8, shelter.currentOccupancy / 1000).toFixed(1)),
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
        text: "Revise fuentes oficiales y prepare salida sólo si la autoridad lo indica.",
        safetyLimit: "No emitir evacuación oficial desde simulación demo.",
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
        ? "Simulación demo institucional con rutas críticas, refugios y plan de acción."
        : "Vista pública demo con ruta/refugio recomendado e instrucción simple.",
  };
}

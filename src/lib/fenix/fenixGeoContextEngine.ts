import { demoFenixRoutes, demoFenixShelters } from "@/data/fenixDemo";
import { demoSettlements } from "@/data/demoSettlements";
import { demoMedicalPoints } from "@/data/medicalPoints";
import type { FenixSimulationInput, FenixAffectedZone } from "@/types/fenixSimulation";

export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const earthRadiusKm = 6371;
  const dLat = (b.latitude - a.latitude) * Math.PI / 180;
  const dLon = (b.longitude - a.longitude) * Math.PI / 180;
  const lat1 = a.latitude * Math.PI / 180;
  const lat2 = b.latitude * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function analyzeCoordinates(input: FenixSimulationInput) {
  const lat = input.initialLocation.latitude;
  const lng = input.initialLocation.longitude;
  const urbanHint = Math.abs(lat + 33.45) < 0.8 && Math.abs(lng + 70.66) < 1;
  return {
    latitude: lat,
    longitude: lng,
    hemisphere: lat < 0 ? "sur" : "norte",
    context: urbanHint ? "urbano/metropolitano demo" : "mixto/rural demo",
    confidence: urbanHint ? 68 : 52,
    isDemo: true,
  };
}

export function findNearbySettlements(input: FenixSimulationInput) {
  const origin = { latitude: input.initialLocation.latitude, longitude: input.initialLocation.longitude };
  return demoSettlements
    .map((settlement) => ({
      ...settlement,
      distanceKm: Number(distanceKm(origin, settlement).toFixed(1)),
    }))
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, 5);
}

export function estimatePopulationExposure(zones: FenixAffectedZone[], settlements = demoSettlements) {
  const maxRadius = zones.at(-1)?.radiusKm ?? 5;
  const nearby = settlements.filter((settlement) => settlement.population && maxRadius >= 3).slice(0, 3);
  const estimatedPeople = nearby.reduce((sum, settlement) => sum + Math.round(settlement.population * 0.04), 0);
  return {
    estimatedPeople: Math.max(estimatedPeople, Math.round(Math.PI * maxRadius * maxRadius * 650)),
    settlements: nearby,
    disclaimer: "Estimación preliminar. Falta conexión con censo/fuente oficial.",
    isDemo: true,
  };
}

export function findNearbyRoutes(input: FenixSimulationInput) {
  const scenarioRoutes = demoFenixRoutes.filter((route) => route.scenarioId === input.scenarioId);
  return scenarioRoutes.slice(0, 5).map((route) => ({
    id: route.id,
    name: route.name,
    status: route.status,
    sourceType: "DEMO",
    isDemo: true,
  }));
}

export function findNearbyMedicalPoints() {
  return demoMedicalPoints.slice(0, 4).map((point) => ({ ...point, isDemo: true }));
}

export function findNearbyShelters(input: FenixSimulationInput) {
  return demoFenixShelters
    .filter((shelter) => shelter.scenarioId === input.scenarioId)
    .slice(0, 4)
    .map((shelter) => ({ ...shelter, isDemo: true }));
}

export function findNearbyReports(input: FenixSimulationInput) {
  return {
    approximateCount: Math.max(3, Math.round(input.initialRadiusKm * 1.8)),
    isDemo: true,
    note: "Reportes agregados demo; no expone usuarios individuales.",
  };
}

export function classifyTerrainOrUrbanContext(input: FenixSimulationInput) {
  const settlements = findNearbySettlements(input);
  return settlements[0]?.distanceKm < 20 ? "urbano/periurbano demo" : "rural/mixto demo";
}

export function buildGeoContextSummary(input: FenixSimulationInput) {
  const coordinateAnalysis = analyzeCoordinates(input);
  const nearbySettlements = findNearbySettlements(input);
  return {
    coordinateAnalysis,
    nearbySettlements,
    terrainContext: classifyTerrainOrUrbanContext(input),
    nearbyRoutes: findNearbyRoutes(input),
    nearbyShelters: findNearbyShelters(input),
    nearbyMedicalPoints: findNearbyMedicalPoints(),
    nearbyReportsAggregate: findNearbyReports(input),
    summary: `Entorno ${coordinateAnalysis.context}; localidad cercana: ${nearbySettlements[0]?.name ?? "sin referencia demo"}.`,
    confidence: coordinateAnalysis.confidence,
    isDemo: true,
  };
}


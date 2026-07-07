import type { HermesGeoPoint, HermesRiskZone, HermesRoute } from "@/modules/hermes/types";
import { calculateHermesRoutes } from "@/modules/hermes/hermesRouting";
import type { RiskProjection } from "@/types/weatherRisk";
import type { ConflictCoordinates, ConflictZone } from "@/types/conflictZone";
import type { MedicalPoint } from "@/types/medical";

/**
 * Calculo de distancia/ETA y rutas demo para AURA (SOS Medico rapido y
 * dashboard completo). No inventa un motor de navegacion real: la distancia
 * y el ETA se estiman con velocidad promedio por modo de transporte, y la
 * "ruta segura" reutiliza el motor HERMES (`calculateHermesRoutes`) ya
 * existente para decidir el trazado en funcion de riesgo, sin sobreescribir
 * la distancia/ETA mostrada (los numeros demo de HERMES no reflejan la
 * distancia real entre origen y destino).
 */

export type AuraTransportMode = "walking" | "bike" | "vehicle" | "emergency_vehicle";

export const AURA_TRANSPORT_SPEEDS_KMH: Record<AuraTransportMode, number> = {
  walking: 5,
  bike: 15,
  vehicle: 35,
  emergency_vehicle: 45,
};

export const AURA_TRANSPORT_LABELS: Record<AuraTransportMode, string> = {
  walking: "A pie",
  bike: "Bicicleta",
  vehicle: "Vehiculo",
  emergency_vehicle: "Vehiculo de emergencia",
};

const transportToHermesMobility: Record<AuraTransportMode, HermesRoute["mobilityMode"]> = {
  walking: "walking",
  bike: "bicycle",
  vehicle: "car",
  emergency_vehicle: "ambulance",
};

export function haversineDistanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const radiusKm = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function estimateEtaMinutes(distanceKm: number, mode: AuraTransportMode): number {
  const speedKmh = AURA_TRANSPORT_SPEEDS_KMH[mode];
  return Math.max(1, Math.round((distanceKm / speedKmh) * 60));
}

export function getEtaByTransportMode(distanceKm: number): Record<AuraTransportMode, number> {
  return {
    walking: estimateEtaMinutes(distanceKm, "walking"),
    bike: estimateEtaMinutes(distanceKm, "bike"),
    vehicle: estimateEtaMinutes(distanceKm, "vehicle"),
    emergency_vehicle: estimateEtaMinutes(distanceKm, "emergency_vehicle"),
  };
}

/**
 * Orden del SOS Medico rapido: primero puntos con capacidad de urgencia,
 * luego menor ETA aproximado (haversine + velocidad promedio en vehiculo),
 * luego menor distancia, y por ultimo mayor cantidad de capacidades medicas.
 * Es un orden aproximado para la lista; la ruta real solo se calcula para el
 * punto que el usuario selecciona.
 */
export function rankMedicalPointsForSos(points: MedicalPoint[]): MedicalPoint[] {
  return [...points].sort((a, b) => {
    const aUrgent = a.capabilities.includes("Urgencia") ? 1 : 0;
    const bUrgent = b.capabilities.includes("Urgencia") ? 1 : 0;
    if (aUrgent !== bUrgent) return bUrgent - aUrgent;

    const aEta = estimateEtaMinutes(a.distanceKm ?? 0, "vehicle");
    const bEta = estimateEtaMinutes(b.distanceKm ?? 0, "vehicle");
    if (aEta !== bEta) return aEta - bEta;

    const aDist = a.distanceKm ?? Infinity;
    const bDist = b.distanceKm ?? Infinity;
    if (aDist !== bDist) return aDist - bDist;

    return b.capabilities.length - a.capabilities.length;
  });
}

/** Primer punto util (no cerrado) del ranking, para marcar "RECOMENDADO". */
export function pickRecommendedMedicalPointId(rankedPoints: MedicalPoint[]): string | null {
  const best = rankedPoints.find((point) => point.availabilityStatus !== "closed") ?? rankedPoints[0];
  return best?.id ?? null;
}

export type AuraMedicalRouteKind = "direct" | "safe";

export type AuraMedicalRoute = {
  kind: AuraMedicalRouteKind;
  coordinates: Array<[number, number]>;
  distanceKm: number;
  isEstimated: boolean;
  status?: HermesRoute["status"];
  warnings?: string[];
  explanation: string;
};

/** Linea recta demo entre origen y destino, marcada explicitamente como estimada. */
export function buildAuraDirectRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): AuraMedicalRoute {
  return {
    kind: "direct",
    coordinates: [
      [origin.lat, origin.lng],
      [destination.lat, destination.lng],
    ],
    distanceKm: haversineDistanceKm(origin, destination),
    isEstimated: true,
    explanation: "Ruta directa estimada (linea recta demo). No reemplaza navegacion GPS real.",
  };
}

function toHermesRiskZonesFromProjections(projections: RiskProjection[]): HermesRiskZone[] {
  return projections.map((projection) => ({
    id: projection.id,
    center: { lat: projection.originLatitude, lng: projection.originLongitude },
    radiusMeters: projection.radiusMeters,
    riskLevel: projection.severity,
    category: projection.kind,
    confidence: projection.confidence >= 80 ? "high" : projection.confidence >= 50 ? "medium" : "low",
    recommendedModules: ["TALOS"],
  }));
}

function approximateConflictZoneCenter(coordinates: ConflictCoordinates): HermesGeoPoint | null {
  if (!Array.isArray(coordinates)) {
    return { lat: (coordinates.north + coordinates.south) / 2, lng: (coordinates.east + coordinates.west) / 2 };
  }
  if (typeof coordinates[0] === "number") {
    const [lat, lng] = coordinates as [number, number];
    return { lat, lng };
  }
  const pairs = coordinates as Array<[number, number]>;
  if (pairs.length === 0) return null;
  const sum = pairs.reduce((acc, [lat, lng]) => ({ lat: acc.lat + lat, lng: acc.lng + lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / pairs.length, lng: sum.lng / pairs.length };
}

function toHermesRiskZonesFromConflictZones(zones: ConflictZone[]): HermesRiskZone[] {
  const result: HermesRiskZone[] = [];
  for (const zone of zones) {
    const center = approximateConflictZoneCenter(zone.coordinates);
    if (!center) continue;
    result.push({
      id: zone.id,
      center,
      radiusMeters: 3000,
      riskLevel: zone.riskLevel,
      category: zone.zoneType,
      confidence: zone.confidence,
      recommendedModules: ["TALOS"],
    });
  }
  return result;
}

/**
 * Ruta "mas segura": reutiliza el motor HERMES (que a su vez reutiliza
 * `argusRoutingEngine`) para elegir un trazado considerando zonas de riesgo
 * TALOS y zonas de conflicto/desastre activas en el mapa. La distancia/ETA
 * mostrada al usuario sigue calculandose con haversine + velocidad promedio;
 * solo se usa la geometria y el estado (available/caution/high_risk/blocked)
 * de HERMES.
 */
export async function buildAuraSafeRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  mode: AuraTransportMode,
  hazardSources: { riskProjections?: RiskProjection[]; conflictZones?: ConflictZone[] } = {}
): Promise<AuraMedicalRoute> {
  const riskZones = [
    ...toHermesRiskZonesFromProjections(hazardSources.riskProjections ?? []),
    ...toHermesRiskZonesFromConflictZones(hazardSources.conflictZones ?? []),
  ];

  if (riskZones.length === 0) {
    return {
      ...buildAuraDirectRoute(origin, destination),
      kind: "safe",
      explanation: "Sin datos de riesgo activos cerca de la ruta; se muestra la ruta directa.",
    };
  }

  try {
    const routes = await calculateHermesRoutes({
      origin: { lat: origin.lat, lng: origin.lng, isApproximate: true },
      destination: { lat: destination.lat, lng: destination.lng },
      mobilityMode: transportToHermesMobility[mode],
      purpose: "safe_navigation",
      riskZones,
    });
    const best = routes[0];
    if (!best) throw new Error("HERMES no devolvio rutas");

    return {
      kind: "safe",
      coordinates: best.geometry.map((point) => [point.lat, point.lng]),
      distanceKm: haversineDistanceKm(origin, destination),
      isEstimated: true,
      status: best.status,
      warnings: best.warnings.map((warning) => warning.message),
      explanation:
        best.explanation ||
        "Ruta calculada por HERMES considerando zonas de riesgo activas. Distancia y ETA estimados con velocidad promedio.",
    };
  } catch {
    return {
      ...buildAuraDirectRoute(origin, destination),
      kind: "safe",
      explanation: "No se pudo calcular la ruta segura con HERMES; se muestra la ruta directa.",
    };
  }
}

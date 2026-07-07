import { calculateOsrmRoutes } from "@/lib/routing/providers/osrmProvider";
import { calculateMapboxRoutes } from "@/lib/routing/providers/mapboxProvider";
import { calculateGraphhopperRoutes } from "@/lib/routing/providers/graphhopperProvider";
import { calculateValhallaRoutes } from "@/lib/routing/providers/valhallaProvider";
import { calculateGoogleRoutes } from "@/lib/routing/providers/googleDirectionsProvider";
import { buildRouteSafetyLabel, scoreRouteRisk, type RouteHazardPoint } from "@/lib/routing/routeSafety";

/**
 * Servicio de routing real por calles para ARGUS: base de navegacion tipo
 * Waze/Google Maps reutilizable por AURA, Fenix, Atlas, evacuacion y
 * cualquier modulo futuro. El proveedor se elige por variable de entorno
 * (`NEXT_PUBLIC_ROUTING_PROVIDER`, por defecto "osrm") — nunca hardcodeado en
 * un componente. Si el proveedor real falla, se cae a una linea recta
 * (haversine) marcada explicitamente como `isDemo: true`; el llamador debe
 * mostrar esa condicion, nunca tratarla como ruta real.
 */

export type RoutingMode = "walking" | "bike" | "vehicle" | "emergency_vehicle";

export const ROUTING_MODE_LABELS: Record<RoutingMode, string> = {
  walking: "A pie",
  bike: "Bicicleta",
  vehicle: "Vehiculo",
  emergency_vehicle: "Vehiculo de emergencia",
};

export type GeoPoint = { lat: number; lng: number };

export type RouteLabel = "fastest" | "shortest" | "safest" | "alternative";

export const ROUTE_LABEL_TITLES: Record<RouteLabel, string> = {
  fastest: "Mas rapida",
  shortest: "Mas corta",
  safest: "Mas segura",
  alternative: "Alternativa",
};

export type RouteInstruction = {
  text: string;
  distanceMeters: number;
  location: GeoPoint;
};

export type RoutePreferences = {
  /** Incidentes/zonas de riesgo activas a evitar para la ruta "mas segura". */
  hazards?: RouteHazardPoint[];
  wantAlternatives?: boolean;
};

export type RoutingRequest = {
  origin: GeoPoint;
  destination: GeoPoint;
  mode: RoutingMode;
};

export type CalculateRoutesRequest = RoutingRequest & {
  preferences?: RoutePreferences;
};

export type RouteResult = {
  /** Identificador estable de la ruta dentro del conjunto devuelto por calculateRoutes. */
  id?: string;
  /** Clasificacion de la ruta cuando viene de calculateRoutes (fastest/shortest/safest/alternative). */
  label?: RouteLabel;
  /** Titulo legible para tarjetas de ruta ("Mas rapida", "Mas segura", ...). */
  title?: string;
  /** Coordenadas [lat, lng] del trazado, en orden origen -> destino. */
  geometry: Array<[number, number]>;
  distanceKm: number;
  durationMin: number;
  provider: string;
  isDemo: boolean;
  mode: RoutingMode;
  instructions?: RouteInstruction[];
  riskScore?: number;
  avoidedIncidents?: number;
  warnings?: string[];
  routeSafetyLabel?: string;
};

const AVERAGE_SPEED_KMH: Record<RoutingMode, number> = {
  walking: 5,
  bike: 15,
  vehicle: 35,
  emergency_vehicle: 45,
};

function haversineDistanceKm(a: GeoPoint, b: GeoPoint): number {
  const radiusKm = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

function buildFallbackRoute({ origin, destination, mode }: RoutingRequest): RouteResult {
  const distanceKm = haversineDistanceKm(origin, destination);
  return {
    id: "fallback-straight-line",
    label: "fastest",
    title: "Ruta estimada (demo)",
    geometry: [
      [origin.lat, origin.lng],
      [destination.lat, destination.lng],
    ],
    distanceKm,
    durationMin: Math.max(1, Math.round((distanceKm / AVERAGE_SPEED_KMH[mode]) * 60)),
    provider: "fallback_straight_line",
    isDemo: true,
    mode,
  };
}

type RoutingProvider = (request: RoutingRequest & { alternatives?: boolean }) => Promise<RouteResult[]>;

const providers: Record<string, RoutingProvider> = {
  osrm: calculateOsrmRoutes,
  mapbox: calculateMapboxRoutes,
  graphhopper: calculateGraphhopperRoutes,
  valhalla: calculateValhallaRoutes,
  google: calculateGoogleRoutes,
};

function resolveProvider(): RoutingProvider {
  const configured = process.env.NEXT_PUBLIC_ROUTING_PROVIDER || "osrm";
  return providers[configured] ?? providers.osrm;
}

/** Firma redondeada de la geometria para deduplicar rutas identicas entre proveedores. */
function geometrySignature(geometry: Array<[number, number]>): string {
  const sampleEvery = Math.max(1, Math.floor(geometry.length / 12));
  return geometry
    .filter((_, index) => index % sampleEvery === 0)
    .map(([lat, lng]) => `${lat.toFixed(3)},${lng.toFixed(3)}`)
    .join("|");
}

function labelAndScoreRoutes(candidates: RouteResult[], preferences?: RoutePreferences): RouteResult[] {
  const unique = new Map<string, RouteResult>();
  for (const candidate of candidates) {
    const signature = geometrySignature(candidate.geometry);
    if (!unique.has(signature)) unique.set(signature, candidate);
  }
  const routes = [...unique.values()];

  const hazards = preferences?.hazards ?? [];
  const scored = routes.map((route) => {
    const { riskScore, warnings } = scoreRouteRisk(route.geometry, hazards);
    return { route, riskScore, warnings };
  });

  const usedIndexes = new Set<number>();
  const pick = (compare: (a: (typeof scored)[number], b: (typeof scored)[number]) => number) => {
    let bestIndex = -1;
    for (let i = 0; i < scored.length; i++) {
      if (usedIndexes.has(i)) continue;
      if (bestIndex === -1 || compare(scored[i], scored[bestIndex]) < 0) bestIndex = i;
    }
    return bestIndex;
  };

  const results: RouteResult[] = [];

  const fastestIndex = pick((a, b) => a.route.durationMin - b.route.durationMin);
  if (fastestIndex !== -1) {
    usedIndexes.add(fastestIndex);
    results.push({ ...scored[fastestIndex].route, label: "fastest", title: ROUTE_LABEL_TITLES.fastest });
  }

  if (routes.length > 1) {
    const shortestIndex = pick((a, b) => a.route.distanceKm - b.route.distanceKm);
    if (shortestIndex !== -1) {
      usedIndexes.add(shortestIndex);
      results.push({ ...scored[shortestIndex].route, label: "shortest", title: ROUTE_LABEL_TITLES.shortest });
    }
  }

  if (hazards.length > 0) {
    // Elegir la de menor riesgo entre TODAS (puede repetir una ya elegida si es la unica opcion).
    let bestRiskIndex = 0;
    for (let i = 1; i < scored.length; i++) {
      if (scored[i].riskScore < scored[bestRiskIndex].riskScore) bestRiskIndex = i;
    }
    const safest = scored[bestRiskIndex];
    const fastestForCompare = results.find((r) => r.label === "fastest") ?? routes[0];
    const avoidedIncidents = scoreRouteRisk(fastestForCompare.geometry, hazards).nearHazardIds.filter(
      (id) => !scoreRouteRisk(safest.route.geometry, hazards).nearHazardIds.includes(id)
    ).length;
    results.push({
      ...safest.route,
      label: "safest",
      title: ROUTE_LABEL_TITLES.safest,
      riskScore: safest.riskScore,
      warnings: safest.warnings,
      avoidedIncidents,
      routeSafetyLabel: buildRouteSafetyLabel(avoidedIncidents, safest.route.durationMin, fastestForCompare.durationMin),
    });
    usedIndexes.add(bestRiskIndex);
  }

  let remaining: number;
  let alternativeCount = 0;
  while ((remaining = pick((a, b) => a.route.durationMin - b.route.durationMin)) !== -1 && results.length < 4) {
    usedIndexes.add(remaining);
    alternativeCount += 1;
    results.push({
      ...scored[remaining].route,
      label: "alternative",
      title: alternativeCount > 1 ? `${ROUTE_LABEL_TITLES.alternative} ${alternativeCount}` : ROUTE_LABEL_TITLES.alternative,
    });
  }

  return results.map((route, index) => ({ ...route, id: `${route.label}-${route.provider}-${index}` }));
}

export async function calculateRoutes(request: CalculateRoutesRequest): Promise<RouteResult[]> {
  const provider = resolveProvider();
  const wantAlternatives = request.preferences?.wantAlternatives ?? true;
  try {
    const raw = await provider({ ...request, alternatives: wantAlternatives });
    if (!raw || raw.length === 0) throw new Error("El proveedor de rutas no devolvio resultados.");
    return labelAndScoreRoutes(raw, request.preferences);
  } catch {
    return [buildFallbackRoute(request)];
  }
}

export async function calculateRoute(request: RoutingRequest): Promise<RouteResult> {
  const [best] = await calculateRoutes({ ...request, preferences: { wantAlternatives: false } });
  return best;
}

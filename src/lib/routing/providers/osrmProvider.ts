import type { RouteInstruction, RouteResult, RoutingMode, RoutingRequest } from "@/lib/routing/routingService";

/**
 * Adaptador OSRM (Open Source Routing Machine). Usa el servidor demo publico
 * por defecto (`router.project-osrm.org`, sin API key) y permite apuntar a un
 * servidor propio via `NEXT_PUBLIC_OSRM_BASE_URL`. Devuelve geometria real
 * por calles — no debe usarse como fallback de linea recta.
 */

const DEFAULT_OSRM_BASE_URL = "https://router.project-osrm.org";

const modeToOsrmProfile: Record<RoutingMode, string> = {
  walking: "foot",
  bike: "bike",
  vehicle: "car",
  emergency_vehicle: "car",
};

/**
 * OSRM no tiene perfil de ambulancia: se aproxima al perfil "car" y se aplica
 * un factor de reduccion de tiempo (paso de semaforos/prioridad de via) sobre
 * la duracion devuelta, dejando la geometria intacta.
 */
const modeDurationFactor: Record<RoutingMode, number> = {
  walking: 1,
  bike: 1,
  vehicle: 1,
  emergency_vehicle: 0.8,
};

type OsrmManeuver = {
  type: string;
  modifier?: string;
  location: [number, number];
};

type OsrmStep = {
  distance: number;
  duration: number;
  name: string;
  maneuver: OsrmManeuver;
};

type OsrmLeg = { steps?: OsrmStep[] };

type OsrmRouteResponse = {
  code: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry: { coordinates: Array<[number, number]> };
    legs?: OsrmLeg[];
  }>;
};

const maneuverTypeLabel: Record<string, string> = {
  depart: "Salir por",
  arrive: "Llegar a",
  turn: "Girar en",
  merge: "Incorporarse en",
  roundabout: "Tomar la rotonda en",
  "roundabout turn": "En la rotonda, girar en",
  fork: "Tomar el desvio en",
  "end of road": "Continuar en",
  continue: "Continuar por",
  "new name": "Continuar por",
};

const modifierLabel: Record<string, string> = {
  left: "izquierda",
  right: "derecha",
  "slight left": "leve a la izquierda",
  "slight right": "leve a la derecha",
  "sharp left": "cerrada a la izquierda",
  "sharp right": "cerrada a la derecha",
  straight: "de frente",
  uturn: "en U",
};

function describeStep(step: OsrmStep): string {
  const action = maneuverTypeLabel[step.maneuver.type] ?? "Continuar por";
  const modifier = step.maneuver.modifier ? modifierLabel[step.maneuver.modifier] : undefined;
  const streetName = step.name || "la via actual";
  if (step.maneuver.type === "arrive") return `Llegar a destino (${streetName})`;
  if (modifier && (step.maneuver.type === "turn" || step.maneuver.type === "roundabout turn")) {
    return `${action} ${modifier} hacia ${streetName}`;
  }
  return `${action} ${streetName}`;
}

function toInstructions(legs: OsrmLeg[] | undefined): RouteInstruction[] {
  if (!legs) return [];
  const steps = legs.flatMap((leg) => leg.steps ?? []);
  return steps.map((step) => ({
    text: describeStep(step),
    distanceMeters: Math.round(step.distance),
    location: { lat: step.maneuver.location[1], lng: step.maneuver.location[0] },
  }));
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function calculateOsrmRoutes(
  request: RoutingRequest & { alternatives?: boolean }
): Promise<RouteResult[]> {
  const { origin, destination, mode, alternatives = true } = request;
  const baseUrl = process.env.NEXT_PUBLIC_OSRM_BASE_URL || DEFAULT_OSRM_BASE_URL;
  const profile = modeToOsrmProfile[mode];
  const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = `${baseUrl}/route/v1/${profile}/${coordinates}?overview=full&geometries=geojson&steps=true&alternatives=${alternatives}`;

  const response = await fetchWithTimeout(url, 8000);
  if (!response.ok) {
    throw new Error(`OSRM respondio con estado ${response.status}`);
  }

  const data: OsrmRouteResponse = await response.json();
  if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
    throw new Error("OSRM no encontro una ruta por calles entre origen y destino.");
  }

  return data.routes.map((route) => ({
    geometry: route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
    distanceKm: route.distance / 1000,
    durationMin: Math.max(1, Math.round((route.duration / 60) * modeDurationFactor[mode])),
    provider: "osrm",
    isDemo: false,
    mode,
    instructions: toInstructions(route.legs),
  }));
}

/** Compatibilidad con el flujo existente (SOS Medico rapido): primera ruta OSRM. */
export async function calculateOsrmRoute(request: RoutingRequest): Promise<RouteResult> {
  const routes = await calculateOsrmRoutes({ ...request, alternatives: false });
  return routes[0];
}

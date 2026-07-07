import { calculateOsrmRoute } from "@/lib/routing/providers/osrmProvider";

/**
 * Servicio de routing real por calles para ARGUS (SOS Medico y otros accesos
 * rapidos). El proveedor se elige por variable de entorno
 * (`NEXT_PUBLIC_ROUTING_PROVIDER`, por defecto "osrm") — nunca hardcodeado en
 * un componente. Si el proveedor real falla, se cae a una linea recta
 * (haversine) marcada explicitamente como `isDemo: true`; el llamador debe
 * mostrar esa condicion, nunca tratarla como ruta real.
 */

export type RoutingMode = "walking" | "bike" | "vehicle" | "emergency_vehicle";

export type GeoPoint = { lat: number; lng: number };

export type RoutingRequest = {
  origin: GeoPoint;
  destination: GeoPoint;
  mode: RoutingMode;
};

export type RouteResult = {
  /** Coordenadas [lat, lng] del trazado, en orden origen -> destino. */
  geometry: Array<[number, number]>;
  distanceKm: number;
  durationMin: number;
  provider: string;
  isDemo: boolean;
  mode: RoutingMode;
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

type RoutingProvider = (request: RoutingRequest) => Promise<RouteResult>;

const providers: Record<string, RoutingProvider> = {
  osrm: calculateOsrmRoute,
};

function resolveProvider(): RoutingProvider {
  const configured = process.env.NEXT_PUBLIC_ROUTING_PROVIDER || "osrm";
  return providers[configured] ?? providers.osrm;
}

export async function calculateRoute(request: RoutingRequest): Promise<RouteResult> {
  const provider = resolveProvider();
  try {
    return await provider(request);
  } catch {
    return buildFallbackRoute(request);
  }
}

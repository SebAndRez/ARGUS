import { NextRequest, NextResponse } from "next/server";
import { decodePolyline } from "@/lib/routing/polyline";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";
import { safeOutboundFetch, SsrfGuardError } from "@/lib/security/ssrfGuard";

/**
 * Proxy server-side para Google Directions API. La API key se mantiene en
 * `GOOGLE_DIRECTIONS_API_KEY` (server-only, sin prefijo NEXT_PUBLIC) porque
 * Google Directions REST no admite llamadas CORS directas desde el navegador
 * con la key expuesta.
 *
 * Ruta pública por diseño (ruteo peatonal/vehicular/evacuación disponible
 * sin cuenta, ver `routingService.ts`), pero endurecida (Bloque 8 §9):
 * `origin`/`destination` se validan estrictamente como `lat,lng` (el único
 * formato que el frontend envía — ver `googleDirectionsProvider.ts`), la
 * URL saliente se construye con `URL`/`URLSearchParams` en vez de
 * concatenación manual, el host de Google es fijo y se valida además con el
 * guard SSRF central, y la ruta lleva rate limiting (`routing_directions_public`)
 * porque cada llamada gasta cupo real de `GOOGLE_DIRECTIONS_API_KEY`.
 */

const GOOGLE_DIRECTIONS_HOST = "maps.googleapis.com";
const GOOGLE_DIRECTIONS_ORIGIN = `https://${GOOGLE_DIRECTIONS_HOST}/maps/api/directions/json`;

const modeToGoogleTravelMode: Record<string, string> = {
  walking: "walking",
  bike: "bicycling",
  vehicle: "driving",
  emergency_vehicle: "driving",
};

const LATLNG_PATTERN = /^(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/;

class RoutingInputError extends Error {}

/** Acepta únicamente `"lat,lng"` (formato que el frontend siempre envía) y valida rango. */
function parseLatLngParam(value: string | null, label: string): { lat: number; lng: number } {
  if (!value || value.length > 64) {
    throw new RoutingInputError(`${label} es requerido y debe tener el formato lat,lng.`);
  }
  const match = LATLNG_PATTERN.exec(value.trim());
  if (!match) {
    throw new RoutingInputError(`${label} debe tener el formato lat,lng (p. ej. -33.45,-70.65).`);
  }
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new RoutingInputError(`${label}: latitud fuera de rango (-90..90).`);
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new RoutingInputError(`${label}: longitud fuera de rango (-180..180).`);
  }
  return { lat, lng };
}

function parseTravelMode(value: string | null): string {
  const mode = value ?? "vehicle";
  const travelMode = modeToGoogleTravelMode[mode];
  if (!travelMode) {
    throw new RoutingInputError(
      `mode invalido. Valores permitidos: ${Object.keys(modeToGoogleTravelMode).join(", ")}.`
    );
  }
  return travelMode;
}

type GoogleStep = {
  distance: { value: number };
  html_instructions: string;
  start_location: { lat: number; lng: number };
};

type GoogleLeg = { steps: GoogleStep[]; distance: { value: number }; duration: { value: number } };

type GoogleDirectionsResponse = {
  status: string;
  error_message?: string;
  routes: Array<{
    legs: GoogleLeg[];
    overview_polyline: { points: string };
  }>;
};

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.GOOGLE_DIRECTIONS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Google Directions no configurado (falta GOOGLE_DIRECTIONS_API_KEY)." }, { status: 503 });
  }

  const rateLimitOutcome = await enforceRateLimit({ policy: "routing_directions_public", request });
  const rateLimitedResponse = rateLimitResponseForOutcome(rateLimitOutcome);
  if (rateLimitedResponse) return rateLimitedResponse;

  const { searchParams } = new URL(request.url);

  let origin: { lat: number; lng: number };
  let destination: { lat: number; lng: number };
  let travelMode: string;
  try {
    origin = parseLatLngParam(searchParams.get("origin"), "origin");
    destination = parseLatLngParam(searchParams.get("destination"), "destination");
    travelMode = parseTravelMode(searchParams.get("mode"));
  } catch (error) {
    if (error instanceof RoutingInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
  const alternatives = searchParams.get("alternatives") !== "false";

  // Construido con URL/URLSearchParams — nunca concatenación manual de
  // parámetros de usuario dentro de la cadena de la URL saliente. El host
  // es una constante fija (GOOGLE_DIRECTIONS_ORIGIN); origin/destination ya
  // están validados como números en rango, no como texto libre.
  const outboundUrl = new URL(GOOGLE_DIRECTIONS_ORIGIN);
  outboundUrl.searchParams.set("origin", `${origin.lat},${origin.lng}`);
  outboundUrl.searchParams.set("destination", `${destination.lat},${destination.lng}`);
  outboundUrl.searchParams.set("mode", travelMode);
  outboundUrl.searchParams.set("alternatives", String(alternatives));
  outboundUrl.searchParams.set("key", apiKey);

  try {
    // safeOutboundFetch valida esquema/credenciales/host (incl. resolución
    // DNS) antes de cada intento y aplica timeout — defensa en profundidad
    // aunque el host ya sea una constante fija, nunca dato de cliente.
    const response = await safeOutboundFetch(outboundUrl.toString(), {}, { allowedProtocols: ["https:"] });
    const data: GoogleDirectionsResponse = await response.json();

    if (data.status !== "OK" || !data.routes?.length) {
      return NextResponse.json(
        { error: data.error_message || `Google Directions: ${data.status}` },
        { status: 502 }
      );
    }

    const routes = data.routes.map((route) => {
      const geometry = decodePolyline(route.overview_polyline.points, 5);
      const distanceMeters = route.legs.reduce((sum, leg) => sum + leg.distance.value, 0);
      const durationSeconds = route.legs.reduce((sum, leg) => sum + leg.duration.value, 0);
      const instructions = route.legs.flatMap((leg) =>
        leg.steps.map((step) => ({
          text: stripHtml(step.html_instructions),
          distanceMeters: step.distance.value,
          location: { lat: step.start_location.lat, lng: step.start_location.lng },
        }))
      );
      return { geometry, distanceMeters, durationSeconds, instructions };
    });

    return NextResponse.json({ routes });
  } catch (error) {
    if (error instanceof SsrfGuardError) {
      // No debería ocurrir nunca contra un host fijo — si ocurre, es una
      // señal de configuración incorrecta, no del cliente. Nunca se expone
      // el detalle interno del guard al llamador.
      return NextResponse.json({ error: "Google Directions no disponible." }, { status: 502 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo consultar Google Directions." },
      { status: 502 }
    );
  }
}

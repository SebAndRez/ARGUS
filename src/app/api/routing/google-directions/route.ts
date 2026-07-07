import { NextRequest, NextResponse } from "next/server";
import { decodePolyline } from "@/lib/routing/polyline";

/**
 * Proxy server-side para Google Directions API. La API key se mantiene en
 * `GOOGLE_DIRECTIONS_API_KEY` (server-only, sin prefijo NEXT_PUBLIC) porque
 * Google Directions REST no admite llamadas CORS directas desde el navegador
 * con la key expuesta.
 */

const modeToGoogleTravelMode: Record<string, string> = {
  walking: "walking",
  bike: "bicycling",
  vehicle: "driving",
  emergency_vehicle: "driving",
};

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

  const { searchParams } = new URL(request.url);
  const origin = searchParams.get("origin");
  const destination = searchParams.get("destination");
  const mode = searchParams.get("mode") ?? "vehicle";
  const alternatives = searchParams.get("alternatives") !== "false";

  if (!origin || !destination) {
    return NextResponse.json({ error: "Faltan parametros origin/destination." }, { status: 400 });
  }

  const travelMode = modeToGoogleTravelMode[mode] ?? "driving";
  const url =
    `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}` +
    `&mode=${travelMode}&alternatives=${alternatives}&key=${apiKey}`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo consultar Google Directions." },
      { status: 502 }
    );
  }
}

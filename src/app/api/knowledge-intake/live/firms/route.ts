import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";
import { fetchFirmsActiveFires } from "@/lib/knowledge-intake/adapters/firmsAdapter";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // ARGUS Prompt 9/10 (SEC-1): esta lectura en vivo no tenia auth NI rate
  // limit por defecto (solo `?persist=true` pasaba por requireOperator).
  // No se exige sesion: consumidores anonimos legitimos (ej. /app, NASA
  // EONET) dependen de esta lectura publica. Solo se acota el abuso/costo.
  const rateLimitOutcome = await enforceRateLimit({ policy: "knowledge_intake_live_read", request });
  const rateLimited = rateLimitResponseForOutcome(rateLimitOutcome);
  if (rateLimited) return rateLimited;
  try {
    const days = Number(request.nextUrl.searchParams.get("days") ?? "1");
    const result = await fetchFirmsActiveFires({
      bbox: request.nextUrl.searchParams.get("bbox") ?? undefined,
      source: request.nextUrl.searchParams.get("source") ?? undefined,
      days: Number.isFinite(days) ? days : 1,
    });
    return NextResponse.json(result, { status: result.status === "requiresApiKey" ? 503 : 200 });
  } catch (error) {
    return NextResponse.json(
      {
        adapterId: "firmsAdapter",
        sourceId: "nasa_firms",
        status: "error",
        error: error instanceof Error ? error.message : "NASA FIRMS ingestion failed",
      },
      { status: 502 }
    );
  }
}

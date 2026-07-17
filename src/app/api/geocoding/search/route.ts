import { NextRequest, NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/geocoding/nominatimServerClient";

/**
 * Proxy server-side de geocodificacion. Nominatim (OpenStreetMap) exige un
 * `User-Agent` identificable y penaliza uso intensivo desde el navegador; se
 * consulta desde el servidor para cumplir su politica de uso y para poder
 * cambiar de proveedor sin tocar el cliente (`NEXT_PUBLIC_GEOCODING_PROVIDER`).
 * Implementacion real en `nominatimServerClient.ts` — reusada tal cual por
 * la sincronizacion de refugios Codigo Azul, para no tener dos clientes
 * Nominatim distintos.
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const latNum = lat ? Number(lat) : undefined;
  const lngNum = lng ? Number(lng) : undefined;

  try {
    const results = await geocodeAddress(query, {
      near: typeof latNum === "number" && typeof lngNum === "number" ? { lat: latNum, lng: lngNum } : undefined,
    });
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { results: [], error: error instanceof Error ? error.message : "No se pudo consultar el geocodificador." },
      { status: 502 }
    );
  }
}

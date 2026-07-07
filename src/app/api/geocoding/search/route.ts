import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy server-side de geocodificacion. Nominatim (OpenStreetMap) exige un
 * `User-Agent` identificable y penaliza uso intensivo desde el navegador; se
 * consulta desde el servidor para cumplir su politica de uso y para poder
 * cambiar de proveedor sin tocar el cliente (`NEXT_PUBLIC_GEOCODING_PROVIDER`).
 */

type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  class: string;
  importance?: number;
};

const NOMINATIM_BASE_URL = process.env.NEXT_PUBLIC_NOMINATIM_BASE_URL || "https://nominatim.openstreetmap.org";

function classifyPlaceType(result: NominatimResult): string {
  if (result.class === "amenity" && result.type === "hospital") return "hospital";
  if (result.class === "amenity" && (result.type === "clinic" || result.type === "doctors")) return "clinic";
  if (result.class === "amenity" && result.type === "shelter") return "shelter";
  if (result.class === "tourism" || result.class === "leisure" || result.class === "historic") return "landmark";
  return "address";
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const params = new URLSearchParams({
    format: "jsonv2",
    q: query,
    addressdetails: "1",
    limit: "6",
  });
  if (lat && lng) {
    const delta = 0.6;
    const latNum = Number(lat);
    const lngNum = Number(lng);
    params.set("viewbox", `${lngNum - delta},${latNum + delta},${lngNum + delta},${latNum - delta}`);
    params.set("bounded", "0");
  }

  try {
    const response = await fetch(`${NOMINATIM_BASE_URL}/search?${params.toString()}`, {
      headers: {
        "User-Agent": "ARGUS-Grid/1.0 (navegacion operacional; contacto: soporte@argus.local)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) {
      return NextResponse.json({ results: [], error: `Nominatim respondio con estado ${response.status}` }, { status: 502 });
    }

    const data: NominatimResult[] = await response.json();
    const results = data.map((result) => ({
      id: `nominatim-${result.place_id}`,
      label: result.display_name.split(",")[0],
      address: result.display_name,
      lat: Number(result.lat),
      lng: Number(result.lon),
      type: classifyPlaceType(result),
      provider: "nominatim",
      confidence: Math.round(Math.min(1, result.importance ?? 0.4) * 100),
    }));

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { results: [], error: error instanceof Error ? error.message : "No se pudo consultar el geocodificador." },
      { status: 502 }
    );
  }
}

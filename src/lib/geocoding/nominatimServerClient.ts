/**
 * Cliente Nominatim server-side compartido, extraido de
 * `src/app/api/geocoding/search/route.ts` (mismo proveedor, mismo
 * User-Agent, mismo timeout) para que un job de ingesta (p.ej. la
 * sincronizacion de refugios Codigo Azul) pueda geocodificar direcciones de
 * fallback sin hacer un fetch HTTP a su propio deployment. La ruta HTTP
 * sigue existiendo tal cual para el buscador del mapa; este modulo es la
 * unica implementacion real, ambos la usan.
 */

export interface GeocodeResult {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  type: string;
  provider: "nominatim";
  confidence: number;
}

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
const REQUEST_TIMEOUT_MS = 6000;

export function classifyPlaceType(result: NominatimResult): string {
  if (result.class === "amenity" && result.type === "hospital") return "hospital";
  if (result.class === "amenity" && (result.type === "clinic" || result.type === "doctors")) return "clinic";
  if (result.class === "amenity" && result.type === "shelter") return "shelter";
  if (result.class === "tourism" || result.class === "leisure" || result.class === "historic") return "landmark";
  return "address";
}

export interface GeocodeSearchOptions {
  /** Punto de referencia opcional para acotar la busqueda (viewbox no exclusivo). */
  near?: { lat: number; lng: number };
  limit?: number;
}

/** Busqueda por texto libre contra Nominatim. Lanza si la respuesta HTTP no es 2xx o hay timeout — el llamador decide como degradar. */
export async function geocodeAddress(query: string, options: GeocodeSearchOptions = {}): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const params = new URLSearchParams({
    format: "jsonv2",
    q: trimmed,
    addressdetails: "1",
    limit: String(options.limit ?? 6),
  });
  if (options.near) {
    const delta = 0.6;
    params.set(
      "viewbox",
      `${options.near.lng - delta},${options.near.lat + delta},${options.near.lng + delta},${options.near.lat - delta}`
    );
    params.set("bounded", "0");
  }

  const response = await fetch(`${NOMINATIM_BASE_URL}/search?${params.toString()}`, {
    headers: {
      "User-Agent": "ARGUS-Grid/1.0 (navegacion operacional; contacto: soporte@argus.local)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Nominatim respondio con estado ${response.status}`);
  }

  const data: NominatimResult[] = await response.json();
  return data.map((result) => ({
    id: `nominatim-${result.place_id}`,
    label: result.display_name.split(",")[0],
    address: result.display_name,
    lat: Number(result.lat),
    lng: Number(result.lon),
    type: classifyPlaceType(result),
    provider: "nominatim" as const,
    confidence: Math.round(Math.min(1, result.importance ?? 0.4) * 100),
  }));
}

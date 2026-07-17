import * as cheerio from "cheerio";

/**
 * Parser HTML de la tabla de albergues de Codigo Azul
 * (`https://codigoazul.ministeriodesarrollosocial.gob.cl/albergues`).
 * Auditoria en vivo (2026-07-17, ver plan): sitio Laravel server-rendered,
 * sin API/JSON descubierto, paginacion `?page=N` — una pagina mas alla de
 * la ultima responde HTTP 200 con una fila `<td colspan="9">Sin
 * resultados</td>` en vez de datos, esa es la senal real de fin de
 * paginacion (no un conteo de paginas). Las coordenadas ya vienen en el
 * atributo `data-url="...?xy=LNG,LAT"` del link "Ver Mapa" — prioridad 1
 * del spec, no requiere geocodificar en el caso normal.
 */

export const CODIGO_AZUL_BASE_URL = "https://codigoazul.ministeriodesarrollosocial.gob.cl/albergues";
export const CODIGO_AZUL_USER_AGENT = "ARGUS-GRID/0.1 codigo-azul-shelter-sync (+https://argus-grid.example/contacto)";
const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 1500;

const EXPECTED_HEADERS = [
  "region",
  "tipo",
  "direccion",
  "componente",
  "comuna",
  "nombre",
  "institucion",
  "horario",
  "cupos",
  "mapa",
];

export class CodigoAzulStructuralChangeError extends Error {
  constructor(detail: string) {
    super(`Codigo Azul: estructura de la pagina cambio — ${detail}`);
    this.name = "CodigoAzulStructuralChangeError";
  }
}

export interface CodigoAzulRawRow {
  region: string;
  tipo: string;
  direccion: string;
  componente: string;
  comuna: string;
  nombre: string;
  institucion: string;
  horario: string;
  cuposRaw: string;
  /** Extraido de `data-url` del link "Ver Mapa" (coordenadas oficiales de la fuente). `null` si el link no trae coordenadas resolubles. */
  sourceCoordinates: { lat: number; lng: number } | null;
}

export interface ParsedAlberguesPage {
  rows: CodigoAzulRawRow[];
  /** true si la pagina es la respuesta "Sin resultados" (fin de paginacion), no un error. */
  isEmptyResultsPage: boolean;
}

function stripDiacriticsLower(value: string): string {
  return Array.from(value.normalize("NFD"))
    .filter((char) => {
      const codePoint = char.codePointAt(0) ?? 0;
      return codePoint < 0x0300 || codePoint > 0x036f;
    })
    .join("")
    .toLowerCase()
    .trim();
}

/** Extrae `xy=LNG,LAT` de la URL del widget de mapa (confirmado por auditoria: longitud primero). */
function parseXyFromMapUrl(url: string | undefined): { lat: number; lng: number } | null {
  if (!url) return null;
  const match = /[?&]xy=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(url);
  if (!match) return null;
  const lng = Number(match[1]);
  const lat = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/** Numero al inicio de "Nombre" (p.ej. "484697-Albergue..." / "467477 - Albergue..."), candidato a externalId — nunca la unica clave de dedup (ver `shelterStatusDeduplication.ts`). */
export function extractLeadingNumericId(nombre: string): string | undefined {
  const match = /^(\d{5,7})\s*-\s*/.exec(nombre.trim());
  return match ? match[1] : undefined;
}

/**
 * Parsea una pagina de resultados. Lanza `CodigoAzulStructuralChangeError`
 * si la tabla no tiene los encabezados esperados (nunca ingiere en
 * silencio con columnas movidas/faltantes). Devuelve `isEmptyResultsPage:
 * true` con `rows: []` para la senal legitima de fin de paginacion —
 * distinto de un error estructural.
 */
export function parseAlberguesPage(html: string): ParsedAlberguesPage {
  const $ = cheerio.load(html);
  const table = $("table").first();
  if (table.length === 0) {
    throw new CodigoAzulStructuralChangeError("no se encontro ninguna tabla en la pagina.");
  }

  const headers = table
    .find("thead th")
    .toArray()
    .map((el) => stripDiacriticsLower($(el).text()));

  if (headers.length !== EXPECTED_HEADERS.length || !EXPECTED_HEADERS.every((expected, index) => headers[index] === expected)) {
    throw new CodigoAzulStructuralChangeError(
      `encabezados esperados [${EXPECTED_HEADERS.join(", ")}], encontrados [${headers.join(", ")}].`
    );
  }

  const bodyRows = table.find("tbody tr").toArray();

  const isEmptyResultsPage =
    bodyRows.length === 0 ||
    (bodyRows.length === 1 && $(bodyRows[0]).find("td[colspan]").length > 0 && $(bodyRows[0]).find("td").length < EXPECTED_HEADERS.length);

  if (isEmptyResultsPage) {
    return { rows: [], isEmptyResultsPage: true };
  }

  const rows: CodigoAzulRawRow[] = [];
  for (const rowEl of bodyRows) {
    const cells = $(rowEl).find("td");
    if (cells.length !== EXPECTED_HEADERS.length) {
      throw new CodigoAzulStructuralChangeError(`fila con ${cells.length} columnas, se esperaban ${EXPECTED_HEADERS.length}.`);
    }
    const text = (index: number) => $(cells.get(index)).text().replace(/\s+/g, " ").trim();
    const mapUrl = $(cells.get(9)).find("a").attr("data-url");

    rows.push({
      region: text(0),
      tipo: text(1),
      direccion: text(2),
      componente: text(3),
      comuna: text(4),
      nombre: text(5),
      institucion: text(6),
      horario: text(7),
      cuposRaw: text(8),
      sourceCoordinates: parseXyFromMapUrl(mapUrl),
    });
  }

  return { rows, isEmptyResultsPage: false };
}

export interface FetchAlberguesPageResult {
  html: string;
  httpStatus: number;
}

/** Trae una pagina cruda (sin parsear). Un solo reintento con backoff — nunca ráfagas paralelas (el sitio corre detras de un WAF, confirmado por auditoria). */
export async function fetchAlberguesPage(page: number, options: { signal?: AbortSignal } = {}): Promise<FetchAlberguesPageResult> {
  const url = `${CODIGO_AZUL_BASE_URL}?page=${page}`;
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": CODIGO_AZUL_USER_AGENT, Accept: "text/html" },
        signal: options.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Codigo Azul respondio con estado ${response.status} en pagina ${page}.`);
      }
      const html = await response.text();
      return { html, httpStatus: response.status };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`No se pudo obtener la pagina ${page} de Codigo Azul.`);
}

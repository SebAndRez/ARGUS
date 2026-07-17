/**
 * Normalizacion de nombres de region de Chile para la ingesta de Codigo
 * Azul (`https://codigoazul.ministeriodesarrollosocial.gob.cl/albergues`).
 * No existe otro normalizador de region/comuna en el repo (auditado antes
 * de escribir este archivo) — se construye desde cero, cubriendo
 * exactamente las 16 regiones y los codigos numericos confirmados en el
 * `<select>` de region de la fuente (auditoria en vivo, 2026-07-17).
 */

export interface ChileRegionDefinition {
  /** region_id numerico usado por el `<select>` de la fuente. */
  code: number;
  /** Nombre tal como lo muestra la fuente. */
  canonicalName: string;
}

const CHILE_REGIONS: ChileRegionDefinition[] = [
  { code: 15, canonicalName: "Arica y Parinacota" },
  { code: 1, canonicalName: "Tarapacá" },
  { code: 2, canonicalName: "Antofagasta" },
  { code: 3, canonicalName: "Atacama" },
  { code: 4, canonicalName: "Coquimbo" },
  { code: 5, canonicalName: "Valparaíso" },
  { code: 13, canonicalName: "Metropolitana" },
  { code: 6, canonicalName: "O'Higgins" },
  { code: 7, canonicalName: "Maule" },
  { code: 8, canonicalName: "Biobío" },
  { code: 9, canonicalName: "Araucanía" },
  { code: 14, canonicalName: "Los Ríos" },
  { code: 10, canonicalName: "Los Lagos" },
  { code: 11, canonicalName: "Aysén" },
  { code: 12, canonicalName: "Magallanes" },
  { code: 16, canonicalName: "Ñuble" },
];

const COMBINING_DIACRITIC_MIN = 0x0300;
const COMBINING_DIACRITIC_MAX = 0x036f;

/**
 * Colapsa acentos/apostrofes/espacios a una clave alfanumerica comparable
 * ("O'Higgins" y "O Higgins" -> "ohiggins"). Filtra marcas diacriticas por
 * codepoint (tras NFD) en vez de un rango literal en una regex, para
 * evitar depender de como el editor/toolchain serializa caracteres
 * combinados no imprimibles.
 */
function collapseToMatchKey(value: string): string {
  const withoutDiacritics = Array.from(value.normalize("NFD"))
    .filter((char) => {
      const codePoint = char.codePointAt(0) ?? 0;
      return codePoint < COMBINING_DIACRITIC_MIN || codePoint > COMBINING_DIACRITIC_MAX;
    })
    .join("");
  return withoutDiacritics.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const REGION_BY_MATCH_KEY = new Map<string, ChileRegionDefinition>(
  CHILE_REGIONS.map((region) => [collapseToMatchKey(region.canonicalName), region])
);

export interface NormalizedChileRegion {
  code: number;
  canonicalName: string;
}

/**
 * Resuelve un nombre de region publicado por la fuente a su forma
 * canonica + codigo numerico. `null` si no coincide con ninguna de las 16
 * regiones (nunca inventa una region) — el llamador debe conservar el
 * texto original de todas formas.
 */
export function normalizeRegionName(raw: string | null | undefined): NormalizedChileRegion | null {
  if (!raw) return null;
  const region = REGION_BY_MATCH_KEY.get(collapseToMatchKey(raw));
  return region ? { code: region.code, canonicalName: region.canonicalName } : null;
}

export function getRegionByCode(code: number): NormalizedChileRegion | null {
  const region = CHILE_REGIONS.find((item) => item.code === code);
  return region ? { code: region.code, canonicalName: region.canonicalName } : null;
}

export function listChileRegions(): ChileRegionDefinition[] {
  return CHILE_REGIONS.slice();
}

/**
 * Limpieza de mayusculas/minusculas de comuna (p.ej. "ALTO HOSPICIO" ->
 * "Alto Hospicio"). No existe una lista maestra de comunas en el repo —
 * esto NO valida contra un catalogo, solo normaliza capitalizacion; no
 * fabricar una lista de comunas que no se ha auditado.
 */
export function normalizeCommune(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return undefined;
  return trimmed
    .split(" ")
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(" ");
}

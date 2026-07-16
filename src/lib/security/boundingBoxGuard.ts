/**
 * ARGUS — validación de bounding box (Prompt 12 §19). Rate limiting por sí
 * solo no impide que una única solicitud pida sincronizar el planeta
 * completo — esto ocurre antes de llamar a Overpass, nunca después.
 */

export interface BoundingBoxLike {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface BoundingBoxValidation {
  valid: boolean;
  reason?: string;
}

/**
 * ~2.5° por eje cubre holgadamente una región metropolitana grande
 * (varios cientos de km) sin permitir un bbox de escala país/continente.
 * Ajustable sin cambiar la forma del contrato.
 */
export const MAX_BBOX_SPAN_DEGREES = 2.5;

export function validateBoundingBox(bbox: Partial<BoundingBoxLike>): BoundingBoxValidation {
  const { south, west, north, east } = bbox;
  const values = [south, west, north, east];
  if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) {
    return { valid: false, reason: "south/west/north/east deben ser numeros finitos." };
  }

  const s = south as number;
  const w = west as number;
  const n = north as number;
  const e = east as number;

  if (s < -90 || s > 90 || n < -90 || n > 90) {
    return { valid: false, reason: "Latitud fuera de rango (-90..90)." };
  }
  if (w < -180 || w > 180 || e < -180 || e > 180) {
    return { valid: false, reason: "Longitud fuera de rango (-180..180)." };
  }
  if (s >= n) {
    return { valid: false, reason: "south debe ser menor que north." };
  }
  if (w >= e) {
    return { valid: false, reason: "west debe ser menor que east (bbox que cruza el antimeridiano no esta soportado)." };
  }

  const latSpan = n - s;
  const lngSpan = e - w;
  if (latSpan > MAX_BBOX_SPAN_DEGREES || lngSpan > MAX_BBOX_SPAN_DEGREES) {
    return {
      valid: false,
      reason: `Area maxima permitida: ${MAX_BBOX_SPAN_DEGREES} grados por eje (recibido lat=${latSpan.toFixed(2)}, lng=${lngSpan.toFixed(2)}).`,
    };
  }

  return { valid: true };
}

/**
 * Normalizacion extensible de la columna "Tipo" de Codigo Azul. Las seis
 * categorias confirmadas en la fuente (auditoria en vivo, 2026-07-17: las
 * cinco visibles en filas de muestra mas "Albergue Plan Protege Calle
 * COVID-19", presente solo en el `<select>` de filtro) mapean todas a
 * `CriticalPoiCategory: "shelter"` — la taxonomia completa de Codigo Azul
 * son variantes de refugio, no categorias distintas de infraestructura
 * critica. Una categoria futura no reconocida cae en "OTHER" sin perder el
 * texto original (spec ARGUS v1.0.3.5 §2/§10: no limitar a las categorias
 * observadas hoy).
 */

export type CodigoAzulSubtype =
  | "SHELTER"
  | "PROTEGE_SHELTER"
  | "PROTEGE_CALLE_COVID_SHELTER"
  | "EMERGENCY_SHELTER"
  | "WINTER_CAPACITY"
  | "HOSTEL"
  | "OTHER";

export interface CodigoAzulTypeMapping {
  /** `CriticalPoiCategory` — siempre "shelter" para Codigo Azul. */
  category: "shelter";
  subtype: CodigoAzulSubtype;
  /** Texto original de la columna "Tipo", nunca descartado. */
  originalLabel: string;
}

function normalizeLabel(value: string): string {
  const withoutDiacritics = Array.from(value.normalize("NFD"))
    .filter((char) => {
      const codePoint = char.codePointAt(0) ?? 0;
      return codePoint < 0x0300 || codePoint > 0x036f;
    })
    .join("");
  return withoutDiacritics.toLowerCase().trim().replace(/\s+/g, " ");
}

const TYPE_LOOKUP: Record<string, CodigoAzulSubtype> = {
  "albergue": "SHELTER",
  "albergue protege": "PROTEGE_SHELTER",
  "albergue plan protege calle covid-19": "PROTEGE_CALLE_COVID_SHELTER",
  "albergue de emergencia": "EMERGENCY_SHELTER",
  "cupo de invierno": "WINTER_CAPACITY",
  "hospederia": "HOSTEL",
};

/** Componente/programa publicado por la fuente (p.ej. "Plan Protege"), conservado tal cual — no se normaliza a un enum, es texto administrativo libre. */
export function mapAlbergueTipo(rawTipo: string | null | undefined): CodigoAzulTypeMapping {
  const original = rawTipo?.trim() ?? "";
  const subtype = TYPE_LOOKUP[normalizeLabel(original)] ?? "OTHER";
  return { category: "shelter", subtype, originalLabel: original };
}

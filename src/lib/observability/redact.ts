/**
 * ARGUS Prompt 19 §11 — política central de redacción antes de escribir a
 * consola. Generaliza el único precedente existente en el repo
 * (`src/lib/access/accessAudit.ts`'s `sanitizeAuditPayload`, que redacta
 * campo por campo a mano) en un helper reutilizable por cualquier evento
 * operacional nuevo.
 *
 * No depende de que cada desarrollador recuerde qué omitir: cualquier clave
 * cuyo nombre coincida con el patrón se reemplaza, sin importar el valor.
 */

const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|password|token|secret|api[-_]?key|governmentid|email|phone|medical/i;

const REDACTED_PLACEHOLDER = "[redacted]";
const MAX_DEPTH = 4;
const MAX_ARRAY_ITEMS = 50;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

/**
 * Redacta recursivamente cualquier valor antes de que llegue a
 * `console.*`. Nunca muta el valor de entrada — siempre construye una copia.
 * Acotado en profundidad y en tamaño de arreglo para que un objeto grande o
 * cíclico-por-referencia-repetida no infle el log indefinidamente.
 */
export function redactForLog(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[max-depth]";
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => redactForLog(item, depth + 1));
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED_PLACEHOLDER : redactForLog(val, depth + 1);
    }
    return out;
  }
  return value;
}

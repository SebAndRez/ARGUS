import { createHash } from "crypto";

/**
 * ARGUS — resolución centralizada de identidad de cliente para rate
 * limiting (Prompt 12 §10-§11). Punto único que decide qué IP "es" el
 * cliente y cómo se hashean identificadores sensibles antes de usarlos como
 * parte de una clave — ningún endpoint debe leer headers de IP ni hashear
 * identificadores por su cuenta.
 */

const MAX_IP_LENGTH = 45; // longitud máxima de una IPv6 textual con zona.
const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
// IPv6 completo o comprimido (con "::"), sin validar exhaustivamente cada
// grupo — suficiente para descartar basura sin reimplementar un parser RFC.
const IPV6_PATTERN = /^[0-9a-fA-F:]+:[0-9a-fA-F:]*$/;

/**
 * Cadena de confianza: en Vercel, `x-forwarded-for` lo escribe el proxy de
 * borde (no el cliente) y el primer valor de la lista separada por comas es
 * la IP original del cliente; `x-real-ip` es el fallback de Vercel cuando
 * `x-forwarded-for` no está presente. Deliberadamente NO se leen headers que
 * el cliente podría inventar sin que un proxy los reescriba (`x-client-ip`,
 * cualquier header personalizado), ni query params, ni el body — todos son
 * spoofeables por el propio solicitante (Prompt 12 §10).
 */
const TRUSTED_IP_HEADERS = ["x-forwarded-for", "x-real-ip"] as const;

function isValidIp(candidate: string): boolean {
  if (candidate.length === 0 || candidate.length > MAX_IP_LENGTH) return false;
  if (IPV4_PATTERN.test(candidate)) {
    return candidate.split(".").every((segment) => Number(segment) <= 255);
  }
  return IPV6_PATTERN.test(candidate);
}

/**
 * Normaliza un valor de IP candidato: recorta espacios, quita corchetes
 * IPv6 (`[::1]` → `::1`), descarta el puerto si viene pegado en IPv4
 * (`1.2.3.4:5678` → `1.2.3.4`), y valida la forma resultante. Devuelve
 * `null` en vez de un valor a medio normalizar cuando el candidato no es una
 * IP válida — nunca se propaga basura como si fuera una IP real.
 */
export function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let candidate = raw.trim();
  if (candidate.length === 0 || candidate.length > MAX_IP_LENGTH) return null;

  if (candidate.startsWith("[")) {
    const closing = candidate.indexOf("]");
    if (closing === -1) return null;
    candidate = candidate.slice(1, closing);
  } else if (IPV4_PATTERN.test(candidate.split(":")[0] ?? "") && candidate.includes(":")) {
    // "1.2.3.4:5678" — strip a trailing IPv4 port, but never touch IPv6
    // (which uses ':' as its own separator and has no unambiguous port form here).
    candidate = candidate.split(":")[0] ?? candidate;
  }

  candidate = candidate.trim();
  return isValidIp(candidate) ? candidate : null;
}

export interface ResolveClientIpInput {
  headers: { get(name: string): string | null };
}

/**
 * Primer valor válido de la cadena de confianza (Prompt 12 §10). Cuando
 * `x-forwarded-for` trae varias IPs separadas por coma (cliente, proxies
 * intermedios), se usa la primera — la más cercana al cliente real en la
 * convención de Vercel/estándar de facto. Devuelve `null` si ningún header
 * confiable trae una IP válida; los llamadores deben tratar `null` como
 * "identidad anónima restringida" (`anonymousIdentityKey`), nunca como un
 * bypass sin límite.
 */
export function resolveClientIp(request: ResolveClientIpInput): string | null {
  for (const header of TRUSTED_IP_HEADERS) {
    const rawValue = request.headers.get(header);
    if (!rawValue) continue;
    const firstEntry = rawValue.split(",")[0];
    const normalized = normalizeIp(firstEntry);
    if (normalized) return normalized;
  }
  return null;
}

/**
 * Hash unidireccional (SHA-256) para cualquier identificador sensible
 * (email, username, device id) que deba formar parte de una clave de rate
 * limiting — nunca se envía el valor en texto plano al backend del
 * limitador (Prompt 12 §11). No sustituye autenticación: solo sirve para
 * agrupar solicitudes de la misma identidad sin persistir el valor original.
 */
export function hashIdentifier(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

/**
 * Clave compartida y restringida para cuando no se pudo resolver una IP
 * válida — todas las solicitudes sin IP resoluble de una misma ruta caen en
 * el mismo cupo en vez de cada una obtener un contador propio (que
 * equivaldría a un bypass ilimitado, Prompt 12 §10).
 */
export const UNRESOLVED_IP_IDENTITY = "unresolved-ip";

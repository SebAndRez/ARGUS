import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * ARGUS — guard SSRF centralizado para solicitudes salientes (Bloque 8,
 * Fase E). No existía ningún mecanismo equivalente en el repositorio antes
 * de esta tarea (confirmado por grep: sin `ssrf`, `isPrivateIp`,
 * `169.254`, `RFC1918`, `dns.lookup` en `src/lib/security`).
 *
 * Patrón de referencia: OSIRIS (`https://github.com/simplifaisoul/osiris`,
 * MIT License, Copyright (c) 2026 simplifaisoul) tiene un guard equivalente
 * en `src/lib/ssrf-guard.ts` — este archivo adapta ese diseño (canonicalizar
 * el host, bloquear rangos reservados, resolver DNS antes de decidir,
 * revalidar cada redirect) reescrito para las convenciones de ARGUS. No se
 * importa OSIRIS como dependencia ni se copia su código línea por línea.
 *
 * Uso típico:
 * ```ts
 * const response = await safeOutboundFetch(url, { signal });
 * ```
 * o, cuando el llamador ya arma su propio `fetch` y solo necesita la
 * validación:
 * ```ts
 * const safeUrl = await assertSafeOutboundUrl(url);
 * ```
 */

export interface SsrfGuardOptions {
  /** Protocolos permitidos. Por defecto solo `https:`. */
  allowedProtocols?: Array<"https:" | "http:">;
  /** Timeout por intento de red, en milisegundos. Por defecto 8000. */
  timeoutMs?: number;
  /** Máximo de saltos de redirect a seguir. Por defecto 3. */
  maxRedirects?: number;
  /**
   * Límite de tamaño de respuesta en bytes, aplicado de forma best-effort
   * leyendo el body por streaming y abortando si se excede. `undefined`
   * desactiva el límite (algunos consumidores decodifican JSON pequeño y no
   * lo necesitan).
   */
  maxResponseBytes?: number;
}

const DEFAULT_OPTIONS: Required<Omit<SsrfGuardOptions, "maxResponseBytes">> = {
  allowedProtocols: ["https:"],
  timeoutMs: 8000,
  maxRedirects: 3,
};

export class SsrfGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfGuardError";
  }
}

// ── Bloqueo de nombres reservados (antes de tocar DNS) ──
const RESERVED_HOSTNAME_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^localhost\.localdomain$/i,
  /\.localhost$/i,
  /^host\.docker\.internal$/i,
  /\.internal$/i,
  /\.local$/i,
  /^metadata\.google\.internal$/i,
];

// ── IPv4 — bloques reservados/privados (Bloque 8 §8.2) ──
const IPV4_BLOCKED_RANGES: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // incluye 169.254.169.254 (metadata cloud)
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4], // incluye 255.255.255.255
];

// ── IPv6 — prefijos reservados/privados ──
const IPV6_BLOCKED_PREFIXES = [
  "::", // no especificada
  "::1", // loopback
  "::ffff:", // IPv4-mapped (cubre ::ffff:127.0.0.1, ::ffff:10.x, etc.)
  "64:ff9b::", // NAT64
  "64:ff9b:1:",
  "100::", // discard-only
  "2001:db8:", // documentación
  "fc",
  "fd", // unique-local fc00::/7
  "fe8",
  "fe9",
  "fea",
  "feb", // link-local fe80::/10
  "ff", // multicast ff00::/8
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return parts[0] * 0x1000000 + parts[1] * 0x10000 + parts[2] * 0x100 + parts[3];
}

function isIPv4Blocked(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  for (const [net, bits] of IPV4_BLOCKED_RANGES) {
    const netInt = ipv4ToInt(net);
    const blockSize = bits === 0 ? 0x100000000 : Math.pow(2, 32 - bits);
    if (Math.floor(ipInt / blockSize) === Math.floor(netInt / blockSize)) return true;
  }
  return false;
}

function isIPv6Blocked(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (lower === "::" || lower === "::1") return true;
  return IPV6_BLOCKED_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * Detecta representaciones alternativas de IPv4 (decimal, hexadecimal,
 * octal-like, forma corta `127.1`) ANTES de intentar resolución DNS. No se
 * confía en que el resolutor DNS del entorno rechace estas formas — algunos
 * `getaddrinfo` de sistema las aceptan y las resuelven igual que la forma
 * canónica, así que se rechazan aquí de forma determinista sin depender del
 * comportamiento del SO.
 */
function isAlternateIPv4Representation(host: string): boolean {
  if (/^\d+$/.test(host)) return true; // decimal puro: 2130706433
  if (/^0x[0-9a-fA-F]+$/i.test(host)) return true; // hex: 0x7f000001
  if (/^[\d.]+$/.test(host) && host.includes(".")) {
    const groups = host.split(".");
    if (groups.length !== 4) return true; // forma corta: 127.1, 1.2.3
    if (groups.some((g) => g.length > 1 && g.startsWith("0"))) return true; // octal-like: 017700000001, 01.0.0.1
  }
  return false;
}

export interface HostValidationResult {
  ok: boolean;
  reason?: string;
  resolved?: string[];
}

/**
 * Valida que `host` (IP literal o hostname) sea un objetivo de red seguro:
 * no localhost/reservado por nombre, no IP literal en rango bloqueado, no
 * representación alternativa de IPv4, y — para hostnames — ninguna
 * respuesta A/AAAA resuelta cae en un rango bloqueado.
 */
export async function validateHost(host: string): Promise<HostValidationResult> {
  const trimmed = host.trim();
  if (!trimmed) return { ok: false, reason: "empty host" };

  const bracketed = trimmed.replace(/^\[|\]$/g, "");
  const lowerHost = trimmed.toLowerCase();

  if (RESERVED_HOSTNAME_PATTERNS.some((re) => re.test(lowerHost))) {
    return { ok: false, reason: "hostname matches reserved name pattern" };
  }

  if (isAlternateIPv4Representation(bracketed)) {
    return { ok: false, reason: "non-canonical IPv4 representation rejected" };
  }

  const ipFamily = isIP(bracketed);
  if (ipFamily === 4) {
    if (isIPv4Blocked(bracketed)) return { ok: false, reason: "IPv4 in reserved range" };
    return { ok: true, resolved: [bracketed] };
  }
  if (ipFamily === 6) {
    if (isIPv6Blocked(bracketed)) return { ok: false, reason: "IPv6 in reserved range" };
    return { ok: true, resolved: [bracketed] };
  }

  // Hostname — sintaxis básica, luego resolver y revalidar cada respuesta.
  if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(trimmed)) {
    return { ok: false, reason: "invalid hostname syntax" };
  }

  let answers: Array<{ address: string; family: number }> = [];
  try {
    answers = await lookup(trimmed, { all: true });
  } catch (err) {
    return { ok: false, reason: `DNS lookup failed: ${(err as Error).message}` };
  }
  if (answers.length === 0) {
    return { ok: false, reason: "hostname has no A/AAAA records" };
  }
  for (const answer of answers) {
    if (answer.family === 4 && isIPv4Blocked(answer.address)) {
      return { ok: false, reason: `hostname resolves to reserved IPv4 ${answer.address}` };
    }
    if (answer.family === 6 && isIPv6Blocked(answer.address)) {
      return { ok: false, reason: `hostname resolves to reserved IPv6 ${answer.address}` };
    }
  }
  return { ok: true, resolved: answers.map((a) => a.address) };
}

/**
 * Valida esquema, credenciales embebidas y host de una URL de salida.
 * Lanza `SsrfGuardError` si algo es inseguro; devuelve la `URL` parseada si
 * es segura. No ejecuta ningún fetch — solo valida.
 */
export async function assertSafeOutboundUrl(input: string, options?: SsrfGuardOptions): Promise<URL> {
  const allowedProtocols = options?.allowedProtocols ?? DEFAULT_OPTIONS.allowedProtocols;

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new SsrfGuardError("invalid URL");
  }

  if (!allowedProtocols.includes(parsed.protocol as "https:" | "http:")) {
    throw new SsrfGuardError(`blocked protocol: ${parsed.protocol}`);
  }
  if (parsed.username || parsed.password) {
    throw new SsrfGuardError("URLs with embedded credentials are not allowed");
  }

  const check = await validateHost(parsed.hostname);
  if (!check.ok) {
    throw new SsrfGuardError(`blocked target — ${check.reason}`);
  }
  return parsed;
}

/**
 * `fetch` seguro: valida la URL inicial y cada salto de redirect antes de
 * seguirlo (protocolo, credenciales, host, DNS), aplica timeout vía
 * `AbortController`, y — si se configura `maxResponseBytes` — corta la
 * lectura del body al superar el límite. Nunca sigue redirects
 * automáticamente (`redirect: "manual"` interno); cada `Location` se
 * resuelve como URL absoluta y se vuelve a validar por completo, nunca se
 * confía en que el host original siga siendo el mismo tras un salto.
 */
export async function safeOutboundFetch(
  input: string,
  init: RequestInit = {},
  options?: SsrfGuardOptions
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_OPTIONS.timeoutMs;
  const maxRedirects = options?.maxRedirects ?? DEFAULT_OPTIONS.maxRedirects;
  const maxResponseBytes = options?.maxResponseBytes;

  let currentUrl = input;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const safeUrl = await assertSafeOutboundUrl(currentUrl, options);

    const controller = new AbortController();
    const externalSignal = init.signal;
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    const timeoutId = setTimeout(() => controller.abort(new Error("safeOutboundFetch: timeout")), timeoutMs);

    let response: Response;
    try {
      response = await fetch(safeUrl.toString(), { ...init, redirect: "manual", signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return response;
      currentUrl = new URL(location, safeUrl).toString();
      continue;
    }

    if (maxResponseBytes && response.body) {
      return capResponseBodySize(response, maxResponseBytes);
    }
    return response;
  }

  throw new SsrfGuardError("too many redirects");
}

/**
 * Envuelve `response.body` en un `ReadableStream` que aborta (lanzando) en
 * cuanto la cuenta de bytes recibidos supera `maxBytes` — evita descargas
 * inesperadamente grandes de una respuesta que superó la validación de host
 * pero cuyo tamaño no se conoce de antemano (o cuyo `Content-Length` no es
 * confiable).
 */
function capResponseBodySize(response: Response, maxBytes: number): Response {
  const source = response.body;
  if (!source) return response;
  let received = 0;
  const capped = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = source.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (received > maxBytes) {
            controller.error(new SsrfGuardError(`response exceeded maxResponseBytes (${maxBytes})`));
            await reader.cancel();
            return;
          }
          controller.enqueue(value);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
  return new Response(capped, { status: response.status, statusText: response.statusText, headers: response.headers });
}

import { NextResponse } from "next/server";
import { hashIdentifier, resolveClientIp, UNRESOLVED_IP_IDENTITY } from "@/lib/security/clientIdentity";
import {
  determineRateLimitBackendKind,
  incrementDistributedCounter,
  incrementMemoryCounter,
  type RateLimitBackendKind,
  type RateLimitCounterResult,
} from "@/lib/security/rateLimitBackend";
import { getRateLimitRule, type RateLimitPolicyName, type RateLimitRule } from "@/lib/security/rateLimitPolicy";

/**
 * ARGUS — helper central de rate limiting (Prompt 12 §21). Único punto que
 * combina política + backend + identidad + headers para cualquier endpoint;
 * ningún endpoint debe volver a implementar la lógica de Redis, memoria o
 * cabeceras HTTP por su cuenta.
 *
 * Uso típico:
 * ```ts
 * const outcome = await enforceRateLimit({
 *   policy: "knowledge_import_file",
 *   request,
 *   identity: { userId: user.id },
 * });
 * const blocked = rateLimitResponseForOutcome(outcome);
 * if (blocked) return blocked;
 * ```
 */

export interface EnforceRateLimitIdentity {
  /** Requerido cuando la política usa `keyStrategy: "user"`. */
  userId?: string | null;
  /**
   * Valor crudo (p. ej. email normalizado) para políticas con
   * `keyStrategy: "account"` — nunca se envía en texto plano al backend, se
   * hashea internamente (`hashIdentifier`) antes de formar la clave.
   */
  accountIdentifier?: string | null;
}

type MinimalRequest = {
  headers: { get(name: string): string | null };
  nextUrl?: { pathname?: string };
  url?: string;
};

export interface EnforceRateLimitInput {
  policy: RateLimitPolicyName;
  request: MinimalRequest;
  identity?: EnforceRateLimitIdentity;
  /** Reloj inyectable para tests deterministas — por defecto `new Date()`. */
  now?: Date;
}

export interface RateLimitOutcome {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
  /**
   * Backend que efectivamente resolvió esta solicitud — nunca se expone en
   * respuestas públicas (Prompt 12 §7), solo para logs/decisiones internas.
   */
  backend: RateLimitBackendKind;
  policy: RateLimitPolicyName;
}

function resolveRoutePath(request: MinimalRequest): string {
  if (request.nextUrl?.pathname) return request.nextUrl.pathname;
  if (request.url) {
    try {
      return new URL(request.url).pathname;
    } catch {
      // falls through to the safe default below
    }
  }
  return "unknown-route";
}

function buildIdentityPart(rule: RateLimitRule, identity: EnforceRateLimitIdentity | undefined, request: MinimalRequest): string {
  if (rule.keyStrategy === "user") {
    if (!identity?.userId) {
      throw new Error(`enforceRateLimit: policy "${rule.name}" requires identity.userId.`);
    }
    return `user:${identity.userId}`;
  }

  if (rule.keyStrategy === "account") {
    const raw = identity?.accountIdentifier?.trim();
    // Never an unlimited bypass: an empty/missing identifier still lands in
    // one shared, restricted bucket rather than skipping the check.
    return raw ? `account:${hashIdentifier(raw)}` : `account:${UNRESOLVED_IP_IDENTITY}`;
  }

  const ip = resolveClientIp(request);
  return `ip:${ip ?? UNRESOLVED_IP_IDENTITY}`;
}

function logRateLimitEvent(
  event: "rate_limit_blocked" | "rate_limit_backend_error" | "rate_limit_backend_unavailable",
  rule: RateLimitRule,
  backend: RateLimitBackendKind,
  routePath: string
): void {
  // Deliberately no IP, no user id, no email, no key, no payload — only
  // safe-to-log dimensions (Prompt 12 §20).
  console.warn(
    `[argus:rate-limit] ${event} policy=${rule.name} route=${routePath} backend=${backend} env=${
      process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown"
    }`
  );
}

/**
 * Resuelve el contador para esta clave, decidiendo entre backend
 * distribuido, memoria de desarrollo, o el comportamiento de
 * `failureMode` cuando ninguno de los dos está realmente disponible.
 * Nunca lanza — cualquier fallo del backend distribuido se traduce en un
 * resultado explícito (`backend: "unavailable"` o degradación a memoria).
 */
async function resolveCounter(
  rule: RateLimitRule,
  key: string,
  now: Date,
  routePath: string
): Promise<{ counter: RateLimitCounterResult; backend: RateLimitBackendKind }> {
  const initialKind = determineRateLimitBackendKind();

  if (initialKind === "distributed") {
    try {
      const counter = await incrementDistributedCounter(key, rule.windowSeconds);
      return { counter, backend: "distributed" };
    } catch {
      logRateLimitEvent("rate_limit_backend_error", rule, "unavailable", routePath);
      return degradeOrBlock(rule, key, now);
    }
  }

  if (initialKind === "memory-development") {
    return { counter: incrementMemoryCounter(key, rule.windowSeconds, now.getTime()), backend: "memory-development" };
  }

  // initialKind === "unavailable": producción sin credenciales Upstash configuradas.
  logRateLimitEvent("rate_limit_backend_unavailable", rule, "unavailable", routePath);
  return degradeOrBlock(rule, key, now);
}

/**
 * Aplica la política de falla (Prompt 12 §8) cuando no hay backend
 * distribuido disponible: `fail_open_local` degrada a un contador en
 * memoria (nunca se declara protección global); `fail_closed` fuerza un
 * resultado bloqueado sin incrementar ningún contador real — la operación
 * protegida nunca llega a ejecutarse sin protección.
 */
function degradeOrBlock(
  rule: RateLimitRule,
  key: string,
  now: Date
): { counter: RateLimitCounterResult; backend: RateLimitBackendKind } {
  if (rule.failureMode === "fail_open_local") {
    return { counter: incrementMemoryCounter(key, rule.windowSeconds, now.getTime()), backend: "memory-development" };
  }
  return { counter: { count: rule.maxRequests + 1, ttlSeconds: rule.windowSeconds }, backend: "unavailable" };
}

export async function enforceRateLimit(input: EnforceRateLimitInput): Promise<RateLimitOutcome> {
  const rule = getRateLimitRule(input.policy);
  const now = input.now ?? new Date();
  const routePath = resolveRoutePath(input.request);
  const identityPart = buildIdentityPart(rule, input.identity, input.request);
  const key = `rl:${rule.name}:${routePath}:${identityPart}`;

  const { counter, backend } = await resolveCounter(rule, key, now, routePath);
  const allowed = backend !== "unavailable" && counter.count <= rule.maxRequests;
  const remaining = Math.max(0, rule.maxRequests - counter.count);
  const resetAt = new Date(now.getTime() + counter.ttlSeconds * 1000);
  const retryAfterSeconds = allowed ? 0 : Math.max(1, counter.ttlSeconds);

  if (!allowed && backend !== "unavailable") {
    logRateLimitEvent("rate_limit_blocked", rule, backend, routePath);
  }

  return { allowed, limit: rule.maxRequests, remaining, resetAt, retryAfterSeconds, backend, policy: rule.name };
}

/**
 * Cabeceras estándar (Prompt 12 §16). `RateLimit-Reset`/`Retry-After` se
 * expresan siempre en segundos restantes (delta), nunca como timestamp
 * absoluto — `now` debe ser el mismo reloj usado para calcular `outcome`
 * (los tests lo pasan explícitamente; en producción por defecto es
 * `new Date()` al momento de construir la respuesta). Nunca negativos.
 */
export function rateLimitHeaders(outcome: RateLimitOutcome, now: Date = new Date()): Record<string, string> {
  const resetSeconds = Math.max(0, Math.round((outcome.resetAt.getTime() - now.getTime()) / 1000));
  const headers: Record<string, string> = {
    "RateLimit-Limit": String(outcome.limit),
    "RateLimit-Remaining": String(Math.max(0, outcome.remaining)),
    "RateLimit-Reset": String(resetSeconds),
  };
  if (!outcome.allowed && outcome.backend !== "unavailable") {
    headers["Retry-After"] = String(Math.max(1, outcome.retryAfterSeconds));
  }
  return headers;
}

/**
 * 429 — respuesta consistente (Prompt 12 §15). Nunca incluye la clave
 * interna, identidad, IP, ni detalles del backend/proveedor.
 */
export function rateLimitExceededResponse(outcome: RateLimitOutcome, now: Date = new Date()): NextResponse {
  return NextResponse.json(
    {
      error: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests. Try again later.",
      retryAfterSeconds: outcome.retryAfterSeconds,
    },
    { status: 429, headers: rateLimitHeaders(outcome, now) }
  );
}

/**
 * 503 — el backend distribuido requerido por una política `fail_closed` no
 * está disponible en este entorno. La operación protegida nunca se ejecuta
 * en este caso (Prompt 12 §8.1). No se exponen detalles de infraestructura.
 */
export function rateLimitServiceUnavailableResponse(outcome: RateLimitOutcome): NextResponse {
  return NextResponse.json(
    {
      error: "SERVICE_UNAVAILABLE",
      message: "This operation requires rate-limiting protection that is not currently available. Try again later.",
    },
    { status: 503, headers: { "Retry-After": String(outcome.retryAfterSeconds) } }
  );
}

/**
 * Conveniencia para el caso común: devuelve la respuesta HTTP correcta
 * (429 o 503) cuando la solicitud debe rechazarse, o `null` cuando puede
 * proceder — así cada endpoint hace exactamente:
 * ```ts
 * const blocked = rateLimitResponseForOutcome(outcome);
 * if (blocked) return blocked;
 * ```
 * sin repetir la distinción 429/503 en cada ruta.
 */
export function rateLimitResponseForOutcome(outcome: RateLimitOutcome, now: Date = new Date()): NextResponse | null {
  if (outcome.allowed) return null;
  if (outcome.backend === "unavailable") return rateLimitServiceUnavailableResponse(outcome);
  return rateLimitExceededResponse(outcome, now);
}

export type { RateLimitPolicyName } from "@/lib/security/rateLimitPolicy";

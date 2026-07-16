import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard reutilizable de seguridad de base de datos para comandos
 * destructivos (seed, reset, etc.). Fail-closed: cualquier condicion no
 * reconocida explicitamente como segura bloquea la ejecucion.
 *
 * IMPORTANTE: este modulo no debe importar `@prisma/client` ni
 * `src/lib/prisma` — su unico proposito es decidir si es seguro seguir
 * *antes* de que exista la posibilidad de instanciar un PrismaClient.
 */

function loadEnvFile(path: string, override = false) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key] || override) process.env[key] = value;
  }
}

/** Carga .env y .env.local (si existen) sin sobreescribir variables ya seteadas por el proceso, salvo .env.local que tiene prioridad — mismo comportamiento que `guardLocalDatabase.ts`. */
export function loadLocalEnvFiles() {
  loadEnvFile(join(process.cwd(), ".env"));
  loadEnvFile(join(process.cwd(), ".env.local"), true);
}

export function isProductionEnvironment(): { blocked: boolean; environment: string } {
  const nodeEnv = process.env.NODE_ENV ?? "";
  const vercelEnv = process.env.VERCEL_ENV ?? "";
  if (nodeEnv === "production" || vercelEnv === "production") {
    return { blocked: true, environment: vercelEnv === "production" ? "vercel_production" : "node_production" };
  }
  return { blocked: false, environment: vercelEnv || nodeEnv || "unknown" };
}

/** Extrae solo el host (nunca usuario/password/query/path) para logs seguros. Retorna null si la URL no se puede analizar o no tiene host. */
export function safeParseHost(rawUrl: string | undefined | null): string | null {
  if (!rawUrl || !rawUrl.trim()) return null;
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.hostname) return null;
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isLoopbackHost(host: string | null): boolean {
  if (!host) return false;
  return LOOPBACK_HOSTS.has(host);
}

const SUPABASE_HOST_PATTERNS = [".supabase.co", ".supabase.in", ".pooler.supabase.com", "supabase.co", "pooler.supabase.com"];

export function looksLikeSupabaseHost(host: string | null): boolean {
  if (!host) return false;
  return SUPABASE_HOST_PATTERNS.some((pattern) => host.endsWith(pattern) || host === pattern);
}

function printBlockedMessage(params: { reason: string; environment: string; host: string | null; detail: string }) {
  console.error(
    [
      "",
      "ARGUS SEED BLOCKED",
      "",
      "La base de datos configurada no fue confirmada como un destino seguro para seed.",
      `Motivo: ${params.detail}`,
      `Entorno: ${params.environment}`,
      `Host: ${params.host ?? "(no identificable)"}`,
      "",
      "No se creo ningun PrismaClient y no se ejecuto ninguna operacion de base de datos.",
      "Revisa DATABASE_URL/DIRECT_URL y las variables ARGUS_ALLOW_REMOTE_SEED / ARGUS_SEED_CONFIRM_HOST si el destino es intencional.",
      "",
    ].join("\n")
  );
}

export interface DatabaseSafetyEnvInput {
  databaseUrl: string | undefined;
  directUrl: string | undefined;
  nodeEnv: string | undefined;
  vercelEnv: string | undefined;
  allowRemoteSeed: string | undefined;
  seedConfirmHost: string | undefined;
}

export type DatabaseSafetyDecision =
  | { safe: true; host: string; reason: "loopback" | "remote_confirmed"; warning?: string }
  | {
      safe: false;
      host: string | null;
      environment: string;
      reason:
        | "production_environment"
        | "missing_database_url"
        | "unparseable_url"
        | "supabase_host"
        | "remote_not_authorized";
      detail: string;
    };

/**
 * Pure decision core, with zero I/O: no `fs` reads, no `process.env` reads,
 * no `console` output, no `process.exit`. Takes every input explicitly so
 * it can be unit-tested deterministically (see tests/p0/seed-guard.test.ts)
 * without risking a real `.env`/`.env.local` (which may point at the shared
 * Supabase instance) leaking into the decision. `assertSafeDatabaseForSeed`
 * below is the only caller that reads real `process.env`/loads env files.
 */
export function evaluateDatabaseSafetyForSeed(input: DatabaseSafetyEnvInput): DatabaseSafetyDecision {
  const nodeEnv = input.nodeEnv ?? "";
  const vercelEnv = input.vercelEnv ?? "";
  const isProduction = nodeEnv === "production" || vercelEnv === "production";
  const environment = vercelEnv === "production" ? "vercel_production" : isProduction ? "node_production" : vercelEnv || nodeEnv || "unknown";

  if (isProduction) {
    return {
      safe: false,
      host: null,
      environment,
      reason: "production_environment",
      detail: "NODE_ENV o VERCEL_ENV indican produccion. El seed nunca puede correr en produccion.",
    };
  }

  if (!input.databaseUrl || !input.databaseUrl.trim()) {
    return {
      safe: false,
      host: null,
      environment,
      reason: "missing_database_url",
      detail: "DATABASE_URL no esta definida.",
    };
  }

  const databaseHost = safeParseHost(input.databaseUrl);
  if (!databaseHost) {
    return {
      safe: false,
      host: null,
      environment,
      reason: "unparseable_url",
      detail: "DATABASE_URL no se pudo interpretar o no contiene un host valido.",
    };
  }

  // Si DIRECT_URL esta presente, tambien debe ser analizable y consistente
  // con la misma clasificacion (local o remota) que DATABASE_URL.
  let directHost: string | null = null;
  if (input.directUrl && input.directUrl.trim()) {
    directHost = safeParseHost(input.directUrl);
    if (!directHost) {
      return {
        safe: false,
        host: null,
        environment,
        reason: "unparseable_url",
        detail: "DIRECT_URL no se pudo interpretar o no contiene un host valido.",
      };
    }
  }

  const allHosts = [databaseHost, directHost].filter((host): host is string => Boolean(host));
  const allLoopback = allHosts.every((host) => isLoopbackHost(host));

  if (allLoopback) {
    return { safe: true, host: databaseHost, reason: "loopback" };
  }

  const anySupabase = allHosts.some((host) => looksLikeSupabaseHost(host));
  if (anySupabase) {
    return {
      safe: false,
      host: databaseHost,
      environment,
      reason: "supabase_host",
      detail: "El host parece ser una instancia Supabase. Supabase nunca se autoriza automaticamente para seed, sin excepcion.",
    };
  }

  // Host remoto, no-Supabase: requiere doble confirmacion explicita e
  // independiente — una bandera generica no es suficiente por si sola.
  const allowRemote = input.allowRemoteSeed === "true";
  const confirmedHost = input.seedConfirmHost?.trim().toLowerCase();
  const hostConfirmed = Boolean(confirmedHost) && confirmedHost === databaseHost;

  if (allowRemote && hostConfirmed) {
    return {
      safe: true,
      host: databaseHost,
      reason: "remote_confirmed",
      warning: `Sembrando una base remota explicitamente confirmada (host: ${databaseHost}).`,
    };
  }

  return {
    safe: false,
    host: databaseHost,
    environment,
    reason: "remote_not_authorized",
    detail:
      "El host es remoto y no fue autorizado explicitamente. Se requieren ARGUS_ALLOW_REMOTE_SEED=true Y " +
      "ARGUS_SEED_CONFIRM_HOST=<host exacto> (ambos, no uno solo) para permitir un destino remoto de staging.",
  };
}

/**
 * Guard principal para `prisma/seed.ts` y comandos npm equivalentes.
 * Debe llamarse ANTES de importar `src/lib/prisma` o `@prisma/client`.
 * Termina el proceso (`process.exit(1)`) si el destino no es seguro —
 * nunca retorna en el caso de bloqueo, para que el llamador no necesite
 * lógica adicional de control de flujo. Delega toda la decisión a
 * `evaluateDatabaseSafetyForSeed`; esta función solo se encarga de leer
 * `process.env`/archivos `.env` reales e imprimir/salir — el único motivo
 * por el que no se prueba directamente en la suite automatizada.
 */
export function assertSafeDatabaseForSeed(): DatabaseSafetyDecision {
  loadLocalEnvFiles();

  const decision = evaluateDatabaseSafetyForSeed({
    databaseUrl: process.env.DATABASE_URL,
    directUrl: process.env.DIRECT_URL,
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    allowRemoteSeed: process.env.ARGUS_ALLOW_REMOTE_SEED,
    seedConfirmHost: process.env.ARGUS_SEED_CONFIRM_HOST,
  });

  if (!decision.safe) {
    printBlockedMessage(decision);
    process.exit(1);
  }

  if (decision.warning) console.warn(decision.warning);
  else console.log(`Base local verificada (host: ${decision.host}). Continuando seed.`);

  return decision;
}

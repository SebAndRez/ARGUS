/**
 * src/lib/database-target/client/targetPrismaClient.ts
 *
 * Factory for an ISOLATED Prisma Client generated from
 * `prisma/schema.target.prisma` (output `node_modules/.prisma/target-client-
 * DO-NOT-USE`, see that file's header comment). Development/tests only —
 * never imported by production runtime code, never wired to any existing
 * request path.
 *
 * Hard rules this file enforces at construction time, not just by
 * convention:
 *   1. Requires `TARGET_DATABASE_URL` explicitly. NEVER falls back to
 *      `DATABASE_URL` — that variable belongs to the CURRENT/production
 *      database's Prisma client (`prisma/schema.prisma`), and silently
 *      reusing it here would be exactly the kind of accidental cross-wiring
 *      this isolation exists to prevent.
 *   2. Rejects any URL whose host is not `127.0.0.1`/`localhost`, and any
 *      URL containing a managed-host substring (supabase/pooler/vercel/
 *      neon/railway/render/aws/azure) — same allowlist shape as
 *      `scripts/migration-rehearsal/lib/assert-local-only.mjs`, duplicated
 *      deliberately rather than imported (that script is a `.mjs` CLI tool
 *      outside `src/`, and this is an app-side TS module with a different
 *      env-var contract — `TARGET_DATABASE_URL`, not `DATABASE_URL`).
 *   3. Refuses to construct anything when `NODE_ENV === "production"` —
 *      this client is development/test only, full stop.
 *   4. Caches a single instance per resolved URL on `globalThis` (the
 *      standard Next.js dev-mode pattern) so hot-reload doesn't exhaust
 *      Postgres connections; `closeTargetPrismaClient()` disconnects and
 *      clears the cache for clean shutdown/tests.
 */

const ALLOWED_HOSTS = new Set(["127.0.0.1", "localhost"]);

const FORBIDDEN_SUBSTRINGS = [
  "supabase",
  "pooler",
  "vercel",
  "neon",
  "railway",
  "render",
  "aws",
  "azure",
];

export class TargetDatabaseClientConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TargetDatabaseClientConfigError";
  }
}

export interface TargetClientEnv {
  TARGET_DATABASE_URL?: string;
  NODE_ENV?: string;
  [key: string]: string | undefined;
}

/**
 * Validates and returns `env.TARGET_DATABASE_URL`. Throws
 * `TargetDatabaseClientConfigError` on every violation — callers must treat
 * a throw as fatal, never continue with a fallback URL.
 */
export function resolveTargetDatabaseUrl(env: TargetClientEnv = process.env): string {
  const url = env.TARGET_DATABASE_URL;
  if (!url) {
    throw new TargetDatabaseClientConfigError(
      "TARGET_DATABASE_URL is required. The target Prisma client never falls back to DATABASE_URL " +
        "(that variable belongs to the current/production database client)."
    );
  }

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new TargetDatabaseClientConfigError(
      `TARGET_DATABASE_URL is not a parseable URL: ${JSON.stringify(url)}`
    );
  }

  const lowered = url.toLowerCase();
  for (const bad of FORBIDDEN_SUBSTRINGS) {
    if (lowered.includes(bad)) {
      throw new TargetDatabaseClientConfigError(
        `TARGET_DATABASE_URL contains forbidden substring "${bad}" — refusing to construct a target Prisma client against a managed/remote host.`
      );
    }
  }

  if (!ALLOWED_HOSTS.has(hostname)) {
    throw new TargetDatabaseClientConfigError(
      `TARGET_DATABASE_URL host "${hostname}" is not 127.0.0.1 or localhost — refusing to construct a target Prisma client.`
    );
  }

  return url;
}

function assertNotProduction(env: TargetClientEnv): void {
  if (env.NODE_ENV === "production") {
    throw new TargetDatabaseClientConfigError(
      "The target Prisma client is development/test only and must never be constructed when NODE_ENV=production."
    );
  }
}

/** Minimal shape any generated PrismaClient instance satisfies — avoids a hard type dependency on a client that may not have been generated yet. */
export interface TargetPrismaClientLike {
  $disconnect: () => Promise<void>;
  [key: string]: unknown;
}

type TargetPrismaClientCtor = new (args: {
  datasources: { db: { url: string } };
}) => TargetPrismaClientLike;

/**
 * Loads the generated client's constructor. Deliberately uses a
 * non-literal dynamic `import()` specifier — TypeScript does not attempt to
 * resolve or type-check a non-literal import specifier at compile time, so
 * this module compiles fine even before anyone has run
 * `prisma generate --schema prisma/schema.target.prisma` locally. It only
 * fails, loudly, at the moment something actually tries to construct a
 * client without having generated it.
 */
async function defaultLoadClientCtor(): Promise<TargetPrismaClientCtor> {
  const generatedClientPath =
    "../../../../node_modules/.prisma/target-client-DO-NOT-USE" as string;
  let mod: { PrismaClient?: TargetPrismaClientCtor };
  try {
    mod = await import(generatedClientPath);
  } catch (err) {
    throw new TargetDatabaseClientConfigError(
      "Target Prisma client is not generated. Run `npm run db:target:validate` (or " +
        "`prisma generate --schema prisma/schema.target.prisma`) before requesting a target client. " +
        `Underlying error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (!mod.PrismaClient) {
    throw new TargetDatabaseClientConfigError(
      "Generated target client module has no PrismaClient export — regenerate it."
    );
  }
  return mod.PrismaClient;
}

export interface CreateTargetPrismaClientOptions {
  env?: TargetClientEnv;
  /** Injectable for tests — avoids depending on the real generated client. */
  loadClientCtor?: () => Promise<TargetPrismaClientCtor>;
}

interface GlobalTargetClientCache {
  url: string;
  client: TargetPrismaClientLike;
}

const GLOBAL_CACHE_KEY = "__argusTargetPrismaClientCache__" as const;

function readGlobalCache(): GlobalTargetClientCache | undefined {
  return (globalThis as Record<string, unknown>)[GLOBAL_CACHE_KEY] as
    | GlobalTargetClientCache
    | undefined;
}

function writeGlobalCache(cache: GlobalTargetClientCache | undefined): void {
  (globalThis as Record<string, unknown>)[GLOBAL_CACHE_KEY] = cache;
}

/**
 * Returns a single cached target Prisma client instance, constructing it on
 * first call. Reuses the cached instance across calls in the same process
 * as long as the resolved URL matches (dev hot-reload safety) — a change in
 * `TARGET_DATABASE_URL` (e.g. between test files) forces a fresh instance
 * rather than silently reusing a client pointed at a different database.
 */
export async function getTargetPrismaClient(
  options: CreateTargetPrismaClientOptions = {}
): Promise<TargetPrismaClientLike> {
  const env = options.env ?? process.env;
  assertNotProduction(env);
  const url = resolveTargetDatabaseUrl(env);

  const cached = readGlobalCache();
  if (cached && cached.url === url) {
    return cached.client;
  }

  const loadClientCtor = options.loadClientCtor ?? defaultLoadClientCtor;
  const PrismaClient = await loadClientCtor();
  const client = new PrismaClient({ datasources: { db: { url } } });
  writeGlobalCache({ url, client });
  return client;
}

/** Disconnects and clears the cached client — for clean test/process shutdown. */
export async function closeTargetPrismaClient(): Promise<void> {
  const cached = readGlobalCache();
  if (!cached) return;
  writeGlobalCache(undefined);
  await cached.client.$disconnect();
}

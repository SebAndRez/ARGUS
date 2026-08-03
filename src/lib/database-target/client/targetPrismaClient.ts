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

// ---------------------------------------------------------------------------
// Least-privilege principals
// ---------------------------------------------------------------------------
/**
 * `TARGET_DATABASE_URL` is the MIGRATION/OWNER connection: in the local
 * rehearsal it is the container's bootstrap superuser, which owns the schemas,
 * owns `security.audit_logs`, owns every SECURITY DEFINER function, has
 * BYPASSRLS, and holds CREATE ON SCHEMA security.
 *
 * That is fine for applying DDL. It is NOT fine for anything that claims to be
 * the runtime, and it silently was: the canonical audit writer resolved its
 * client from `TARGET_DATABASE_URL`, so `insertAuditLog()` ran as that
 * superuser. Every "app_api can/cannot do X" statement about the writer was
 * therefore unfalsifiable — RLS never applied, and the function grants were
 * never consulted, because the owner needs neither.
 *
 * These two variables are the fix, and they are deliberately separate
 * variables rather than a mode flag on the existing one, so a runtime path
 * cannot fall back to the owner by accident:
 *   * TARGET_RUNTIME_DATABASE_URL — connects as `app_api`. What the audit
 *     writer and any request-path code uses.
 *   * TARGET_ADMIN_DATABASE_URL   — connects as `access_admin`. Only the
 *     access-role grant/revoke administration uses this.
 * Neither ever falls back to the other, nor to TARGET_DATABASE_URL, nor to
 * DATABASE_URL/DIRECT_URL. All three go through the same loopback/managed-host
 * validation as above.
 */
export type TargetPrincipalKind = "owner" | "runtime" | "admin";

const ENV_VAR_BY_PRINCIPAL: Record<TargetPrincipalKind, string> = {
  owner: "TARGET_DATABASE_URL",
  runtime: "TARGET_RUNTIME_DATABASE_URL",
  admin: "TARGET_ADMIN_DATABASE_URL",
};

function resolvePrincipalUrl(kind: TargetPrincipalKind, env: TargetClientEnv): string {
  const varName = ENV_VAR_BY_PRINCIPAL[kind];
  const url = env[varName];
  if (!url) {
    throw new TargetDatabaseClientConfigError(
      `${varName} is required for the "${kind}" target principal. It never falls back to ` +
        `another principal's URL — a runtime path that silently used the migration/owner ` +
        `credential is exactly the defect this separation exists to prevent.`
    );
  }
  // Reuse the single validation implementation by handing it a synthetic env
  // with only TARGET_DATABASE_URL set, so the loopback/managed-host/parse rules
  // cannot drift between principals.
  return resolveTargetDatabaseUrl({ TARGET_DATABASE_URL: url, NODE_ENV: env.NODE_ENV });
}

interface PrincipalCacheEntry {
  url: string;
  client: TargetPrismaClientLike;
}

const PRINCIPAL_CACHE_KEY = "__argusTargetPrincipalClientCache__" as const;

function principalCache(): Map<TargetPrincipalKind, PrincipalCacheEntry> {
  const existing = (globalThis as Record<string, unknown>)[PRINCIPAL_CACHE_KEY] as
    | Map<TargetPrincipalKind, PrincipalCacheEntry>
    | undefined;
  if (existing) return existing;
  const created = new Map<TargetPrincipalKind, PrincipalCacheEntry>();
  (globalThis as Record<string, unknown>)[PRINCIPAL_CACHE_KEY] = created;
  return created;
}

export interface GetTargetPrincipalClientOptions extends CreateTargetPrismaClientOptions {
  /** Skips the non-privileged assertion. Only the "owner" principal may do this. */
  skipPrincipalAssertion?: boolean;
}

/** What a connection actually turned out to be, read back from the server rather than assumed from the URL. */
export interface TargetPrincipalIdentity {
  sessionUser: string;
  currentUser: string;
  isSuperuser: boolean;
  isBypassRls: boolean;
  ownsSecuritySchema: boolean;
  hasCreateOnSecuritySchema: boolean;
  ownsAuditLogs: boolean;
}

export class TargetPrincipalPrivilegeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TargetPrincipalPrivilegeError";
  }
}

interface PrincipalProbeClient {
  $queryRawUnsafe: <T = unknown>(query: string, ...values: unknown[]) => Promise<T[]>;
}

/**
 * Reads back WHO the connection actually is. Deliberately queries the server
 * instead of parsing the URL: a URL says what was requested, `session_user`
 * says what was granted, and `pg_roles` says what that role can actually do.
 */
export async function describeTargetPrincipal(client: TargetPrismaClientLike): Promise<TargetPrincipalIdentity> {
  const rows = await (client as unknown as PrincipalProbeClient).$queryRawUnsafe<{
    session_user: string;
    current_user: string;
    is_superuser: boolean;
    is_bypassrls: boolean;
    security_schema_owner: string | null;
    has_create_on_security: boolean;
    audit_logs_owner: string | null;
  }>(
    `SELECT session_user::text AS session_user,
            current_user::text AS current_user,
            (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_superuser,
            (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS is_bypassrls,
            (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'security') AS security_schema_owner,
            coalesce(has_schema_privilege(current_user, 'security', 'CREATE'), false) AS has_create_on_security,
            (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = to_regclass('security.audit_logs')) AS audit_logs_owner`
  );
  const row = rows[0]!;
  return {
    sessionUser: row.session_user,
    currentUser: row.current_user,
    isSuperuser: Boolean(row.is_superuser),
    isBypassRls: Boolean(row.is_bypassrls),
    ownsSecuritySchema: row.security_schema_owner === row.current_user,
    hasCreateOnSecuritySchema: Boolean(row.has_create_on_security),
    ownsAuditLogs: row.audit_logs_owner === row.current_user,
  };
}

/**
 * Throws unless the connection is a genuinely non-privileged principal. Every
 * clause corresponds to a way the previous arrangement made RLS and grants
 * unobservable, so none of them is decorative.
 */
export function assertNonPrivilegedPrincipal(
  identity: TargetPrincipalIdentity,
  expectedRole?: string
): void {
  const violations: string[] = [];
  if (identity.isSuperuser) violations.push(`${identity.currentUser} is SUPERUSER`);
  if (identity.isBypassRls) violations.push(`${identity.currentUser} has BYPASSRLS`);
  if (identity.ownsSecuritySchema) violations.push(`${identity.currentUser} owns schema security`);
  if (identity.hasCreateOnSecuritySchema) violations.push(`${identity.currentUser} holds CREATE ON SCHEMA security`);
  if (identity.ownsAuditLogs) violations.push(`${identity.currentUser} owns security.audit_logs`);
  if (expectedRole && identity.currentUser !== expectedRole) {
    violations.push(`connected as ${identity.currentUser}, expected ${expectedRole}`);
  }
  if (violations.length > 0) {
    throw new TargetPrincipalPrivilegeError(
      `AUDIT_WRITER_PRINCIPAL_VIOLATION: a non-privileged target principal was required but ` +
        `${violations.join("; ")}. The runtime must never use the migration/owner credential.`
    );
  }
}

const EXPECTED_ROLE_BY_PRINCIPAL: Partial<Record<TargetPrincipalKind, string>> = {
  runtime: "app_api",
  admin: "access_admin",
};

/**
 * Returns a cached client for the named principal, asserting on first
 * construction that a "runtime"/"admin" connection really is non-privileged.
 * The assertion runs once per cached client, not per query, and a failure is
 * fatal — there is no "warn and continue" path, because continuing is what
 * previously hid the problem.
 */
export async function getTargetPrincipalClient(
  kind: TargetPrincipalKind,
  options: GetTargetPrincipalClientOptions = {}
): Promise<TargetPrismaClientLike> {
  const env = options.env ?? process.env;
  assertNotProduction(env);
  const url = resolvePrincipalUrl(kind, env);

  const cache = principalCache();
  const cached = cache.get(kind);
  if (cached && cached.url === url) return cached.client;

  const loadClientCtor = options.loadClientCtor ?? defaultLoadClientCtor;
  const PrismaClient = await loadClientCtor();
  const client = new PrismaClient({ datasources: { db: { url } } });

  if (kind !== "owner" && !options.skipPrincipalAssertion) {
    try {
      assertNonPrivilegedPrincipal(await describeTargetPrincipal(client), EXPECTED_ROLE_BY_PRINCIPAL[kind]);
    } catch (err) {
      await client.$disconnect().catch(() => undefined);
      throw err;
    }
  }

  cache.set(kind, { url, client });
  return client;
}

/** The runtime (app_api) client. What the canonical audit writer and any request-path code must use. */
export function getTargetRuntimePrismaClient(
  options: GetTargetPrincipalClientOptions = {}
): Promise<TargetPrismaClientLike> {
  return getTargetPrincipalClient("runtime", options);
}

/** The access-role administration (access_admin) client. Nothing else may use it. */
export function getTargetAdminPrismaClient(
  options: GetTargetPrincipalClientOptions = {}
): Promise<TargetPrismaClientLike> {
  return getTargetPrincipalClient("admin", options);
}

/** Disconnects and clears every per-principal cached client. */
export async function closeTargetPrincipalClients(): Promise<void> {
  const cache = principalCache();
  const entries = [...cache.values()];
  cache.clear();
  await Promise.all(entries.map((entry) => entry.client.$disconnect().catch(() => undefined)));
}

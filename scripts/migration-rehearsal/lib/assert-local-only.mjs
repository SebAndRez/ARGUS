// Guard invoked before ANY psql/pg connection in the migration rehearsal.
// Aborts (throws) unless every signal confirms a disposable local database.
// Deliberately has zero dependency on pg/node-postgres — it inspects the
// connection string as text, so it can run before any driver is loaded.

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

const ALLOWED_HOSTS = new Set(["127.0.0.1", "localhost"]);

/**
 * @param {{ ARGUS_MIGRATION_LOCAL_ONLY?: string, POSTGRES_HOST?: string, DATABASE_URL?: string }} env
 * @returns {{ host: string }} on success
 * @throws {Error} on any violation — callers must treat a throw as fatal, never continue.
 */
export function assertLocalOnly(env) {
  const localOnlyFlag = env.ARGUS_MIGRATION_LOCAL_ONLY;
  if (localOnlyFlag !== "true") {
    throw new Error(
      `ARGUS_MIGRATION_LOCAL_ONLY must be exactly "true", got: ${JSON.stringify(localOnlyFlag ?? null)}`
    );
  }

  const host = env.POSTGRES_HOST;
  if (!host || !ALLOWED_HOSTS.has(host)) {
    throw new Error(
      `POSTGRES_HOST must be 127.0.0.1 or localhost, got: ${JSON.stringify(host ?? null)}`
    );
  }

  const databaseUrl = env.DATABASE_URL ?? "";
  const lowered = databaseUrl.toLowerCase();
  for (const bad of FORBIDDEN_SUBSTRINGS) {
    if (lowered.includes(bad)) {
      throw new Error(
        `DATABASE_URL contains forbidden substring "${bad}" — refusing to connect (rehearsal must never reach a managed/remote host).`
      );
    }
  }

  // DATABASE_URL, when present, must itself point at an allowed host —
  // catches "127.0.0.1" env var set correctly while DATABASE_URL still
  // secretly points elsewhere (e.g. copy-paste error from .env).
  if (databaseUrl) {
    let parsedHost;
    try {
      parsedHost = new URL(databaseUrl).hostname;
    } catch {
      throw new Error(`DATABASE_URL is not a parseable URL: ${JSON.stringify(databaseUrl)}`);
    }
    if (!ALLOWED_HOSTS.has(parsedHost)) {
      throw new Error(
        `DATABASE_URL host "${parsedHost}" is not 127.0.0.1 or localhost — refusing to connect.`
      );
    }
  }

  return { host };
}

// CLI mode: `node assert-local-only.mjs` — reads process.env, exits 0 (silent)
// or exits 1 with the violation on stderr. Used by PowerShell scripts as a
// pre-flight gate before any psql invocation.
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    assertLocalOnly(process.env);
    process.exit(0);
  } catch (err) {
    process.stderr.write(`ARGUS_MIGRATION_REMOTE_GUARD_VIOLATION: ${err.message}\n`);
    process.exit(1);
  }
}

import { describe, expect, it } from "vitest";
import { evaluateDatabaseSafetyForSeed } from "../../scripts/lib/databaseSafety";

/**
 * Regression suite for the Prompt 2 fix: `prisma/seed.ts` must never run
 * against production, an unidentifiable host, or an unauthorized remote
 * host — and Supabase must never be authorized automatically, even with
 * the remote-override variables set.
 *
 * Deliberately tests `evaluateDatabaseSafetyForSeed` (pure, no `process.env`
 * reads, no `fs` reads, no `PrismaClient` import anywhere in its module)
 * rather than `assertSafeDatabaseForSeed` or `prisma/seed.ts` itself:
 * - `assertSafeDatabaseForSeed` reads the *real* `.env`/`.env.local` (which,
 *   per project docs, may point at the shared Supabase instance) and calls
 *   `process.exit(1)` on failure, which would kill the test runner.
 * - `prisma/seed.ts` is never imported at all — this is the "regla crítica"
 *   from Prompt 4 §8, satisfied by avoidance: importing it would execute
 *   its top-level `run().catch(...).finally(...)` call.
 */

const baseInput = {
  databaseUrl: undefined as string | undefined,
  directUrl: undefined as string | undefined,
  nodeEnv: undefined as string | undefined,
  vercelEnv: undefined as string | undefined,
  allowRemoteSeed: undefined as string | undefined,
  seedConfirmHost: undefined as string | undefined,
};

describe("evaluateDatabaseSafetyForSeed (Prompt 2 seed guard)", () => {
  it("Caso A — DATABASE_URL ausente: bloquea", () => {
    const decision = evaluateDatabaseSafetyForSeed({ ...baseInput });
    expect(decision.safe).toBe(false);
    if (!decision.safe) expect(decision.reason).toBe("missing_database_url");
  });

  it("Caso B — DATABASE_URL invalida: bloquea", () => {
    const decision = evaluateDatabaseSafetyForSeed({ ...baseInput, databaseUrl: "invalid" });
    expect(decision.safe).toBe(false);
    if (!decision.safe) expect(decision.reason).toBe("unparseable_url");
  });

  it("Caso C — NODE_ENV=production: bloquea incluso con URL local", () => {
    const decision = evaluateDatabaseSafetyForSeed({
      ...baseInput,
      nodeEnv: "production",
      databaseUrl: "postgresql://user:pass@localhost:5432/argus",
    });
    expect(decision.safe).toBe(false);
    if (!decision.safe) expect(decision.reason).toBe("production_environment");
  });

  it("Caso D — VERCEL_ENV=production: bloquea incluso con URL local", () => {
    const decision = evaluateDatabaseSafetyForSeed({
      ...baseInput,
      vercelEnv: "production",
      databaseUrl: "postgresql://user:pass@localhost:5432/argus",
    });
    expect(decision.safe).toBe(false);
    if (!decision.safe) expect(decision.reason).toBe("production_environment");
  });

  it("Caso E — host remoto no autorizado: bloquea sin intentar conexion", () => {
    const decision = evaluateDatabaseSafetyForSeed({
      ...baseInput,
      databaseUrl: "postgresql://user:pass@db.example-not-a-real-host.invalid:5432/testdb",
    });
    expect(decision.safe).toBe(false);
    if (!decision.safe) expect(decision.reason).toBe("remote_not_authorized");
  });

  it("Caso F — host con formato Supabase: bloquea por defecto", () => {
    const decision = evaluateDatabaseSafetyForSeed({
      ...baseInput,
      databaseUrl: "postgresql://user:pass@db.fake-project-ref.supabase.co:5432/postgres",
    });
    expect(decision.safe).toBe(false);
    if (!decision.safe) expect(decision.reason).toBe("supabase_host");
  });

  it("Caso F (extendido) — Supabase sigue bloqueado incluso con ambas variables de confirmacion remota", () => {
    const decision = evaluateDatabaseSafetyForSeed({
      ...baseInput,
      databaseUrl: "postgresql://user:pass@db.fake-project-ref.supabase.co:5432/postgres",
      allowRemoteSeed: "true",
      seedConfirmHost: "db.fake-project-ref.supabase.co",
    });
    expect(decision.safe).toBe(false);
    if (!decision.safe) expect(decision.reason).toBe("supabase_host");
  });

  it("Caso G — base local explicita: aprueba (sin PrismaClient involucrado)", () => {
    const decision = evaluateDatabaseSafetyForSeed({
      ...baseInput,
      databaseUrl: "postgresql://user:pass@localhost:5432/argus_local_test",
    });
    expect(decision.safe).toBe(true);
    if (decision.safe) {
      expect(decision.host).toBe("localhost");
      expect(decision.reason).toBe("loopback");
    }
  });

  it("Caso H — autorizacion remota incompleta (solo ARGUS_ALLOW_REMOTE_SEED): bloquea", () => {
    const decision = evaluateDatabaseSafetyForSeed({
      ...baseInput,
      databaseUrl: "postgresql://user:pass@staging.example-not-a-real-host.invalid:5432/testdb",
      allowRemoteSeed: "true",
    });
    expect(decision.safe).toBe(false);
    if (!decision.safe) expect(decision.reason).toBe("remote_not_authorized");
  });

  it("Caso H (variante) — autorizacion remota incompleta (solo ARGUS_SEED_CONFIRM_HOST): bloquea", () => {
    const decision = evaluateDatabaseSafetyForSeed({
      ...baseInput,
      databaseUrl: "postgresql://user:pass@staging.example-not-a-real-host.invalid:5432/testdb",
      seedConfirmHost: "staging.example-not-a-real-host.invalid",
    });
    expect(decision.safe).toBe(false);
    if (!decision.safe) expect(decision.reason).toBe("remote_not_authorized");
  });

  it("Caso I — autorizacion remota explicita y valida (ambas variables coinciden): aprueba sin conectarse", () => {
    const decision = evaluateDatabaseSafetyForSeed({
      ...baseInput,
      databaseUrl: "postgresql://user:pass@staging.example-not-a-real-host.invalid:5432/testdb",
      allowRemoteSeed: "true",
      seedConfirmHost: "STAGING.example-not-a-real-host.invalid", // case-insensitive match
    });
    expect(decision.safe).toBe(true);
    if (decision.safe) {
      expect(decision.host).toBe("staging.example-not-a-real-host.invalid");
      expect(decision.reason).toBe("remote_confirmed");
    }
  });

  it("Caso I (negativo) — host de confirmacion que NO coincide: bloquea", () => {
    const decision = evaluateDatabaseSafetyForSeed({
      ...baseInput,
      databaseUrl: "postgresql://user:pass@staging.example-not-a-real-host.invalid:5432/testdb",
      allowRemoteSeed: "true",
      seedConfirmHost: "otro-host-completamente-distinto.invalid",
    });
    expect(decision.safe).toBe(false);
    if (!decision.safe) expect(decision.reason).toBe("remote_not_authorized");
  });

  it("DIRECT_URL invalida tambien bloquea, incluso si DATABASE_URL es local", () => {
    const decision = evaluateDatabaseSafetyForSeed({
      ...baseInput,
      databaseUrl: "postgresql://user:pass@localhost:5432/argus",
      directUrl: "invalid",
    });
    expect(decision.safe).toBe(false);
    if (!decision.safe) expect(decision.reason).toBe("unparseable_url");
  });
});

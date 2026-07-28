import { describe, expect, it } from "vitest";
import { assertLocalOnly } from "../../scripts/migration-rehearsal/lib/assert-local-only.mjs";

const validEnv = () => ({
  ARGUS_MIGRATION_LOCAL_ONLY: "true",
  POSTGRES_HOST: "127.0.0.1",
  DATABASE_URL: "postgresql://argus_rehearsal:x@127.0.0.1:55432/argus_migration_rehearsal",
});

describe("assertLocalOnly", () => {
  it("passes for a fully local, correctly-flagged connection", () => {
    expect(() => assertLocalOnly(validEnv())).not.toThrow();
  });

  it("passes with host localhost instead of 127.0.0.1", () => {
    expect(() =>
      assertLocalOnly({
        ...validEnv(),
        POSTGRES_HOST: "localhost",
        DATABASE_URL: "postgresql://u:p@localhost:55432/argus_migration_rehearsal",
      })
    ).not.toThrow();
  });

  it("rejects when ARGUS_MIGRATION_LOCAL_ONLY is missing", () => {
    const env = validEnv();
    delete (env as Record<string, unknown>).ARGUS_MIGRATION_LOCAL_ONLY;
    expect(() => assertLocalOnly(env)).toThrow(/ARGUS_MIGRATION_LOCAL_ONLY/);
  });

  it("rejects when ARGUS_MIGRATION_LOCAL_ONLY is not the literal string true", () => {
    expect(() => assertLocalOnly({ ...validEnv(), ARGUS_MIGRATION_LOCAL_ONLY: "1" })).toThrow(
      /ARGUS_MIGRATION_LOCAL_ONLY/
    );
  });

  it("rejects a non-local POSTGRES_HOST", () => {
    expect(() => assertLocalOnly({ ...validEnv(), POSTGRES_HOST: "db.internal.example.com" })).toThrow(
      /POSTGRES_HOST/
    );
  });

  it.each([
    "postgresql://u:p@db.abcdxyz.supabase.co:5432/postgres",
    "postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
    "postgresql://u:p@my-app.vercel.app:5432/postgres",
    "postgresql://u:p@ep-cool-name.neon.tech:5432/neondb",
    "postgresql://u:p@viaduct.proxy.rlwy.net:5432/railway",
    "postgresql://u:p@dpg-abc123.render.com:5432/db",
    "postgresql://u:p@my-db.rds.amazonaws.com:5432/db",
    "postgresql://u:p@my-db.postgres.database.azure.com:5432/db",
  ])("rejects DATABASE_URL containing a forbidden remote host: %s", (databaseUrl) => {
    expect(() => assertLocalOnly({ ...validEnv(), DATABASE_URL: databaseUrl })).toThrow(
      /forbidden substring/
    );
  });

  it("rejects a DATABASE_URL whose host does not match POSTGRES_HOST allowlist even without a forbidden substring", () => {
    expect(() =>
      assertLocalOnly({ ...validEnv(), DATABASE_URL: "postgresql://u:p@10.0.0.5:5432/argus_migration_rehearsal" })
    ).toThrow(/not 127.0.0.1 or localhost/);
  });

  it("rejects an unparseable DATABASE_URL", () => {
    expect(() => assertLocalOnly({ ...validEnv(), DATABASE_URL: "not-a-url" })).toThrow(/not a parseable URL/);
  });

  it("passes when DATABASE_URL is absent (host-only checks still apply)", () => {
    const env = validEnv();
    delete (env as Record<string, unknown>).DATABASE_URL;
    expect(() => assertLocalOnly(env)).not.toThrow();
  });
});

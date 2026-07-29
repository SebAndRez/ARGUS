import { afterEach, describe, expect, it } from "vitest";
import {
  TargetDatabaseClientConfigError,
  closeTargetPrismaClient,
  getTargetPrismaClient,
  resolveTargetDatabaseUrl,
  type TargetPrismaClientLike,
} from "../../src/lib/database-target/client/targetPrismaClient";

const LOCAL_URL = "postgresql://argus:x@127.0.0.1:55432/argus_target_dev";

function fakeCtor(instances: TargetPrismaClientLike[]) {
  return async () =>
    class FakeClient {
      $disconnect = async () => {};
      constructor() {
        instances.push(this as unknown as TargetPrismaClientLike);
      }
    } as unknown as new (args: { datasources: { db: { url: string } } }) => TargetPrismaClientLike;
}

describe("resolveTargetDatabaseUrl", () => {
  it("throws when TARGET_DATABASE_URL is unset", () => {
    expect(() => resolveTargetDatabaseUrl({})).toThrow(TargetDatabaseClientConfigError);
    expect(() => resolveTargetDatabaseUrl({})).toThrow(/TARGET_DATABASE_URL is required/);
  });

  it("never falls back to DATABASE_URL when TARGET_DATABASE_URL is absent", () => {
    expect(() =>
      resolveTargetDatabaseUrl({ DATABASE_URL: LOCAL_URL } as Record<string, string>)
    ).toThrow(/TARGET_DATABASE_URL is required/);
  });

  it("accepts a local TARGET_DATABASE_URL", () => {
    expect(resolveTargetDatabaseUrl({ TARGET_DATABASE_URL: LOCAL_URL })).toBe(LOCAL_URL);
  });

  it("accepts localhost as well as 127.0.0.1", () => {
    const url = "postgresql://u:p@localhost:55432/argus_target_dev";
    expect(resolveTargetDatabaseUrl({ TARGET_DATABASE_URL: url })).toBe(url);
  });

  it("rejects an unparseable URL", () => {
    expect(() => resolveTargetDatabaseUrl({ TARGET_DATABASE_URL: "not-a-url" })).toThrow(
      /not a parseable URL/
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
  ])("rejects a forbidden managed host: %s", (url) => {
    expect(() => resolveTargetDatabaseUrl({ TARGET_DATABASE_URL: url })).toThrow(
      /forbidden substring/
    );
  });

  it("rejects a remote-looking host with no forbidden substring", () => {
    expect(() =>
      resolveTargetDatabaseUrl({ TARGET_DATABASE_URL: "postgresql://u:p@10.0.0.5:5432/db" })
    ).toThrow(/not 127.0.0.1 or localhost/);
  });
});

describe("getTargetPrismaClient", () => {
  afterEach(async () => {
    await closeTargetPrismaClient();
  });

  it("refuses to construct when NODE_ENV=production, even with a valid local URL", async () => {
    await expect(
      getTargetPrismaClient({
        env: { TARGET_DATABASE_URL: LOCAL_URL, NODE_ENV: "production" },
      })
    ).rejects.toThrow(/development\/test only/);
  });

  it("refuses to construct against a remote host even if injected", async () => {
    const instances: TargetPrismaClientLike[] = [];
    await expect(
      getTargetPrismaClient({
        env: { TARGET_DATABASE_URL: "postgresql://u:p@my-app.vercel.app:5432/db" },
        loadClientCtor: fakeCtor(instances),
      })
    ).rejects.toThrow(/forbidden substring/);
    expect(instances).toHaveLength(0);
  });

  it("constructs exactly once and caches the instance across repeated calls", async () => {
    const instances: TargetPrismaClientLike[] = [];
    const options = { env: { TARGET_DATABASE_URL: LOCAL_URL }, loadClientCtor: fakeCtor(instances) };
    const first = await getTargetPrismaClient(options);
    const second = await getTargetPrismaClient(options);
    expect(second).toBe(first);
    expect(instances).toHaveLength(1);
  });

  it("constructs a fresh instance when the URL changes", async () => {
    const instances: TargetPrismaClientLike[] = [];
    const loadClientCtor = fakeCtor(instances);
    const first = await getTargetPrismaClient({
      env: { TARGET_DATABASE_URL: LOCAL_URL },
      loadClientCtor,
    });
    const second = await getTargetPrismaClient({
      env: { TARGET_DATABASE_URL: "postgresql://u:p@localhost:55432/other" },
      loadClientCtor,
    });
    expect(second).not.toBe(first);
    expect(instances).toHaveLength(2);
  });

  it("closeTargetPrismaClient disconnects and clears the cache", async () => {
    const instances: TargetPrismaClientLike[] = [];
    let disconnected = false;
    const loadClientCtor = async () =>
      class FakeClient {
        $disconnect = async () => {
          disconnected = true;
        };
        constructor() {
          instances.push(this as unknown as TargetPrismaClientLike);
        }
      } as unknown as new (args: { datasources: { db: { url: string } } }) => TargetPrismaClientLike;

    const options = { env: { TARGET_DATABASE_URL: LOCAL_URL }, loadClientCtor };
    await getTargetPrismaClient(options);
    await closeTargetPrismaClient();
    expect(disconnected).toBe(true);

    await getTargetPrismaClient(options);
    expect(instances).toHaveLength(2);
  });
});

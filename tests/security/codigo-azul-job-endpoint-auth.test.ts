import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Autorizacion de los endpoints de sincronizacion de Codigo Azul (spec
 * ARGUS v1.0.3.5 §25): la ejecucion manual exige sesion de operador +
 * rate limit; la ejecucion programada exige el secreto de cron
 * (fail-closed si no esta configurado) — ningun endpoint publico puede
 * disparar la ingesta, mismo patron que
 * `tests/senapred/senapredSingleOwner.test.ts`.
 */

vi.mock("@/lib/criticalPoi/criticalPoiCodigoAzulSync", () => ({
  runCodigoAzulIngestion: vi.fn().mockResolvedValue({
    status: "success",
    pagesProcessed: 9,
    pageErrors: 0,
    recordsFetched: 89,
    recordsCreated: 89,
    recordsUpdated: 0,
    recordsUnchanged: 0,
    recordsAmbiguous: 0,
    recordsUnresolved: 0,
    recordsInvalid: 0,
    durationMs: 12000,
  }),
}));

vi.mock("@/lib/ingestion/persistExternalEvents", () => ({
  recordIngestionRun: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/services/authService", () => ({
  getCurrentUser: vi.fn(),
}));

import { NextRequest } from "next/server";
import { getCurrentUser } from "@/services/authService";
import { runCodigoAzulIngestion } from "@/lib/criticalPoi/criticalPoiCodigoAzulSync";
import { POST as manualRunPost } from "@/app/api/knowledge-intake/jobs/run-codigo-azul-shelters/route";
import { GET as cronRunGet, POST as cronRunPost } from "@/app/api/jobs/run-codigo-azul-shelters/route";
import { resetMemoryJobLocksForTests } from "@/lib/jobs/jobLockBackend";
import { resetMemoryRateLimitBackendForTests } from "@/lib/security/rateLimitBackend";

const getCurrentUserMock = vi.mocked(getCurrentUser);
const runCodigoAzulIngestionMock = vi.mocked(runCodigoAzulIngestion);

const CITIZEN = { id: "citizen-1", role: "CITIZEN" };
const OPERATOR = { id: "operator-1", role: "OPERATOR" };
const CRON_SECRET = "test-codigo-azul-cron-secret";

function manualRequest() {
  return new NextRequest("http://localhost/api/knowledge-intake/jobs/run-codigo-azul-shelters", { method: "POST" });
}

function cronRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/jobs/run-codigo-azul-shelters", {
    method: "POST",
    headers: { "Idempotency-Key": "codigo-azul-run-1", ...headers },
  });
}

beforeEach(() => {
  resetMemoryJobLocksForTests();
  resetMemoryRateLimitBackendForTests();
});

afterEach(() => {
  vi.clearAllMocks();
  resetMemoryJobLocksForTests();
  resetMemoryRateLimitBackendForTests();
  delete process.env.CRON_SECRET;
  delete process.env.VERCEL_ENV;
});

describe("POST /api/knowledge-intake/jobs/run-codigo-azul-shelters — manual (operador)", () => {
  it("ANONYMOUS -> 401, nunca ejecuta la ingesta", async () => {
    getCurrentUserMock.mockResolvedValue(null as never);
    const response = await manualRunPost(manualRequest());
    expect(response!.status).toBe(401);
    expect(runCodigoAzulIngestionMock).not.toHaveBeenCalled();
  });

  it("CITIZEN -> 403, nunca ejecuta la ingesta", async () => {
    getCurrentUserMock.mockResolvedValue(CITIZEN as never);
    const response = await manualRunPost(manualRequest());
    expect(response!.status).toBe(403);
    expect(runCodigoAzulIngestionMock).not.toHaveBeenCalled();
  });

  it("OPERATOR -> 200, ejecuta la ingesta una vez", async () => {
    getCurrentUserMock.mockResolvedValue(OPERATOR as never);
    const response = await manualRunPost(manualRequest());
    expect(response.status).toBe(200);
    expect(runCodigoAzulIngestionMock).toHaveBeenCalledTimes(1);
  });
});

describe("GET/POST /api/jobs/run-codigo-azul-shelters — programado (secreto de cron)", () => {
  it("sin CRON_SECRET configurado -> 401 fail-closed, nunca ejecuta la ingesta", async () => {
    delete process.env.CRON_SECRET;
    const response = await cronRunPost(cronRequest({ authorization: "Bearer cualquier-cosa" }));
    expect(response.status).toBe(401);
    expect(runCodigoAzulIngestionMock).not.toHaveBeenCalled();
  });

  it("token invalido -> 401, nunca ejecuta la ingesta", async () => {
    process.env.CRON_SECRET = CRON_SECRET;
    const response = await cronRunPost(cronRequest({ authorization: "Bearer token-incorrecto" }));
    expect(response.status).toBe(401);
    expect(runCodigoAzulIngestionMock).not.toHaveBeenCalled();
  });

  it("token correcto -> 200, ejecuta la ingesta una vez", async () => {
    process.env.CRON_SECRET = CRON_SECRET;
    const response = await cronRunPost(cronRequest({ authorization: `Bearer ${CRON_SECRET}` }));
    expect(response.status).toBe(200);
    expect(runCodigoAzulIngestionMock).toHaveBeenCalledTimes(1);
  });

  it("GET tambien autorizado con el mismo secreto (disparo GitHub Actions)", async () => {
    process.env.CRON_SECRET = CRON_SECRET;
    const response = await cronRunGet(cronRequest({ authorization: `Bearer ${CRON_SECRET}` }));
    expect(response.status).toBe(200);
  });

  it("Idempotency-Key/X-Argus-Run-Id ausente -> se genera uno internamente, no bloquea la corrida", async () => {
    process.env.CRON_SECRET = CRON_SECRET;
    const request = new NextRequest("http://localhost/api/jobs/run-codigo-azul-shelters", {
      method: "POST",
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    const response = await cronRunPost(request);
    expect(response.status).toBe(200);
    expect(runCodigoAzulIngestionMock).toHaveBeenCalledTimes(1);
  });

  it("Idempotency-Key/X-Argus-Run-Id con caracteres invalidos -> 400, nunca ejecuta la ingesta", async () => {
    process.env.CRON_SECRET = CRON_SECRET;
    const response = await cronRunPost(cronRequest({ authorization: `Bearer ${CRON_SECRET}`, "Idempotency-Key": "clave con espacios !!" }));
    expect(response.status).toBe(400);
    expect(runCodigoAzulIngestionMock).not.toHaveBeenCalled();
  });

  it("VERCEL_ENV=preview -> 403 aunque el secreto sea correcto, nunca ejecuta la ingesta (CRON_SECRET compartido con Production)", async () => {
    process.env.CRON_SECRET = CRON_SECRET;
    process.env.VERCEL_ENV = "preview";
    const response = await cronRunPost(cronRequest({ authorization: `Bearer ${CRON_SECRET}` }));
    expect(response.status).toBe(403);
    expect(runCodigoAzulIngestionMock).not.toHaveBeenCalled();
  });

  it("dos corridas concurrentes: la segunda recibe 409 (lock ya tomado), nunca corre dos veces en paralelo", async () => {
    process.env.CRON_SECRET = CRON_SECRET;
    runCodigoAzulIngestionMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ status: "success", pagesProcessed: 1, pageErrors: 0, recordsFetched: 1, recordsCreated: 1, recordsUpdated: 0, recordsUnchanged: 0, recordsAmbiguous: 0, recordsUnresolved: 0, recordsInvalid: 0, durationMs: 50 }), 50))
    );
    const [first, second] = await Promise.all([
      cronRunPost(cronRequest({ authorization: `Bearer ${CRON_SECRET}`, "X-Argus-Run-Id": "run-a" })),
      cronRunPost(cronRequest({ authorization: `Bearer ${CRON_SECRET}`, "X-Argus-Run-Id": "run-b" })),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
  });
});

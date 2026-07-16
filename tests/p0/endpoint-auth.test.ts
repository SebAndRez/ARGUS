import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression suite for the Prompt 1 fix: the three previously-unauthenticated
 * mutating endpoints must reject anonymous and under-privileged callers
 * BEFORE any persistence/network call, and must let OPERATOR/ADMIN through.
 *
 * Mocking strategy: only the actual I/O boundary is mocked —
 * `@/services/authService`'s `getCurrentUser` (which otherwise needs a real
 * Next.js request context via `next/headers` plus a Prisma-backed session
 * lookup) — so the real `requireOperator()`/`requireAuth()`/`hasAnyRole()`
 * authorization logic runs unmocked. This tests actual behavior (the HTTP
 * status a given role produces), not implementation details. Persistence
 * (`knowledgePersistenceService`) and network (`criticalPoiOsmSync`, which
 * calls Overpass) are also mocked, so no test can reach a real database or
 * external API regardless of which role is used.
 */

vi.mock("@/services/authService", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/knowledge-intake/persistence/knowledgePersistenceService", () => ({
  saveKnowledgeDocument: vi.fn(),
  saveKnowledgeDocumentChunks: vi.fn(),
  saveKnowledgeEvidence: vi.fn(),
  saveKnowledgeLesson: vi.fn(),
  upsertKnowledgeIncidentByExternalId: vi.fn(),
}));

vi.mock("@/lib/criticalPoi/criticalPoiOsmSync", () => ({
  syncCriticalPoisForBbox: vi.fn(),
}));

import { getCurrentUser } from "@/services/authService";
import * as knowledgePersistence from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { syncCriticalPoisForBbox } from "@/lib/criticalPoi/criticalPoiOsmSync";
import { POST as manualImportPost } from "@/app/api/knowledge-intake/import/manual/route";
import { POST as fileImportPost } from "@/app/api/knowledge-intake/import/file/route";
import { POST as criticalPoiSyncPost } from "@/app/api/critical-pois/sync/route";

const getCurrentUserMock = vi.mocked(getCurrentUser);
const syncCriticalPoisForBboxMock = vi.mocked(syncCriticalPoisForBbox);
const persistenceMocks = [
  vi.mocked(knowledgePersistence.saveKnowledgeDocument),
  vi.mocked(knowledgePersistence.saveKnowledgeDocumentChunks),
  vi.mocked(knowledgePersistence.saveKnowledgeEvidence),
  vi.mocked(knowledgePersistence.saveKnowledgeLesson),
  vi.mocked(knowledgePersistence.upsertKnowledgeIncidentByExternalId),
];

function expectNoPersistenceOrNetworkCalls() {
  persistenceMocks.forEach((mock) => expect(mock).not.toHaveBeenCalled());
  expect(syncCriticalPoisForBboxMock).not.toHaveBeenCalled();
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ANONYMOUS = null;
const CITIZEN = { id: "u1", role: "CITIZEN" };
const OPERATOR = { id: "u2", role: "OPERATOR" };
const ADMIN = { id: "u3", role: "ADMIN" };

beforeEach(() => {
  syncCriticalPoisForBboxMock.mockResolvedValue({ fetchedCount: 0, upserted: 0, skipped: 0 } as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/knowledge-intake/import/manual", () => {
  const validBody = { rawText: "Reporte de prueba para autorizacion", persist: false };

  it("Caso A — anonimo: 401, cero llamadas a persistencia", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    const response = await manualImportPost(jsonRequest(validBody));
    expect(response.status).toBe(401);
    expectNoPersistenceOrNetworkCalls();
  });

  it("Caso B — CITIZEN (sin privilegio): 403, cero llamadas a persistencia", async () => {
    getCurrentUserMock.mockResolvedValue(CITIZEN as never);
    const response = await manualImportPost(jsonRequest(validBody));
    expect(response.status).toBe(403);
    expectNoPersistenceOrNetworkCalls();
  });

  it("Caso C — OPERATOR: supera el guard, payload valido sin persist no escribe nada", async () => {
    getCurrentUserMock.mockResolvedValue(OPERATOR as never);
    const response = await manualImportPost(jsonRequest(validBody));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.persistResult).toBeNull();
    expectNoPersistenceOrNetworkCalls();
  });

  it("Caso C — OPERATOR con payload invalido (rawText vacio): 400, sin escritura", async () => {
    getCurrentUserMock.mockResolvedValue(OPERATOR as never);
    const response = await manualImportPost(jsonRequest({ rawText: "" }));
    expect(response.status).toBe(400);
    expectNoPersistenceOrNetworkCalls();
  });

  it("Caso D — ADMIN: supera el guard igual que OPERATOR", async () => {
    getCurrentUserMock.mockResolvedValue(ADMIN as never);
    const response = await manualImportPost(jsonRequest(validBody));
    expect(response.status).toBe(200);
    expectNoPersistenceOrNetworkCalls();
  });
});

describe("POST /api/knowledge-intake/import/file", () => {
  const validBody = {
    rawText: "Documento de prueba para autorizacion",
    inputType: "txt_markdown",
    rawMetadata: { submittedThrough: "test" },
  };

  it("Caso A — anonimo: 401, cero llamadas a persistencia", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    const response = await fileImportPost(jsonRequest(validBody));
    expect(response.status).toBe(401);
    expectNoPersistenceOrNetworkCalls();
  });

  it("Caso B — CITIZEN (sin privilegio): 403, cero llamadas a persistencia", async () => {
    getCurrentUserMock.mockResolvedValue(CITIZEN as never);
    const response = await fileImportPost(jsonRequest(validBody));
    expect(response.status).toBe(403);
    expectNoPersistenceOrNetworkCalls();
  });

  it("Caso C — OPERATOR: supera el guard, payload valido sin persist no escribe nada", async () => {
    getCurrentUserMock.mockResolvedValue(OPERATOR as never);
    const response = await fileImportPost(jsonRequest(validBody));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.persistResult).toBeNull();
    expectNoPersistenceOrNetworkCalls();
  });

  it("Caso D — ADMIN: supera el guard igual que OPERATOR", async () => {
    getCurrentUserMock.mockResolvedValue(ADMIN as never);
    const response = await fileImportPost(jsonRequest(validBody));
    expect(response.status).toBe(200);
    expectNoPersistenceOrNetworkCalls();
  });
});

describe("POST /api/critical-pois/sync", () => {
  const validBbox = { south: -33.5, west: -70.7, north: -33.4, east: -70.6 };

  it("Caso A — anonimo: 401, cero llamadas a Overpass/persistencia", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    const response = await criticalPoiSyncPost(jsonRequest(validBbox));
    expect(response.status).toBe(401);
    expectNoPersistenceOrNetworkCalls();
  });

  it("Caso B — CITIZEN (sin privilegio): 403, cero llamadas a Overpass/persistencia", async () => {
    getCurrentUserMock.mockResolvedValue(CITIZEN as never);
    const response = await criticalPoiSyncPost(jsonRequest(validBbox));
    expect(response.status).toBe(403);
    expectNoPersistenceOrNetworkCalls();
  });

  it("Caso C — OPERATOR con bbox valido: supera el guard y SI llama al servicio (mockeado, cero red real)", async () => {
    getCurrentUserMock.mockResolvedValue(OPERATOR as never);
    const response = await criticalPoiSyncPost(jsonRequest(validBbox));
    expect(response.status).toBe(200);
    expect(syncCriticalPoisForBboxMock).toHaveBeenCalledTimes(1);
  });

  it("Caso C — OPERATOR con bbox invalido (falta 'east'): 400, sin llamar al servicio", async () => {
    getCurrentUserMock.mockResolvedValue(OPERATOR as never);
    const { east: _east, ...incompleteBbox } = validBbox;
    void _east;
    const response = await criticalPoiSyncPost(jsonRequest(incompleteBbox));
    expect(response.status).toBe(400);
    expectNoPersistenceOrNetworkCalls();
  });

  it("Caso D — ADMIN: supera el guard igual que OPERATOR", async () => {
    getCurrentUserMock.mockResolvedValue(ADMIN as never);
    const response = await criticalPoiSyncPost(jsonRequest(validBbox));
    expect(response.status).toBe(200);
    expect(syncCriticalPoisForBboxMock).toHaveBeenCalledTimes(1);
  });

  it("metodo no permitido (GET) no expone una via alternativa de ejecucion", async () => {
    const routeModule: Record<string, unknown> = await import("@/app/api/critical-pois/sync/route");
    expect(routeModule.GET).toBeUndefined();
  });
});

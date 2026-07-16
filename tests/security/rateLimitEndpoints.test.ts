import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Prompt 12 §23 — endpoint-level rate limiting tests. Drives the real route
 * handlers with a mocked I/O boundary (auth, persistence, Overpass,
 * password verification) and the REAL in-memory rate limit backend (no
 * `UPSTASH_REDIS_REST_URL`/`TOKEN` set, not production — matches
 * `determineRateLimitBackendKind()`'s dev/test default), reset between
 * tests. Demonstrates `rate limit rechazado → servicio protegido no
 * llamado`, never just testing the helper in isolation.
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

vi.mock("@/lib/knowledge-intake/incidentNormalizer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/knowledge-intake/incidentNormalizer")>();
  return { ...actual, normalizeKnowledgeInput: vi.fn(actual.normalizeKnowledgeInput) };
});

vi.mock("@/lib/criticalPoi/criticalPoiOsmSync", () => ({
  syncCriticalPoisForBbox: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn(), create: vi.fn() } },
}));

vi.mock("@/lib/auth/passwordService", () => ({
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(() => "hashed"),
  validatePasswordStrength: vi.fn(() => ({ valid: true })),
}));

vi.mock("@/services/auditService", () => ({
  logAuditEvent: vi.fn(),
}));

import { getCurrentUser } from "@/services/authService";
import * as knowledgePersistence from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { normalizeKnowledgeInput } from "@/lib/knowledge-intake/incidentNormalizer";
import { syncCriticalPoisForBbox } from "@/lib/criticalPoi/criticalPoiOsmSync";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/passwordService";
import { POST as manualImportPost } from "@/app/api/knowledge-intake/import/manual/route";
import { POST as fileImportPost } from "@/app/api/knowledge-intake/import/file/route";
import { POST as criticalPoiSyncPost } from "@/app/api/critical-pois/sync/route";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { resetMemoryRateLimitBackendForTests } from "@/lib/security/rateLimitBackend";

const getCurrentUserMock = vi.mocked(getCurrentUser);
const syncCriticalPoisForBboxMock = vi.mocked(syncCriticalPoisForBbox);
const normalizeKnowledgeInputMock = vi.mocked(normalizeKnowledgeInput);
const userFindUniqueMock = vi.mocked(prisma.user.findUnique);
const verifyPasswordMock = vi.mocked(verifyPassword);
const persistenceMocks = [
  vi.mocked(knowledgePersistence.saveKnowledgeDocument),
  vi.mocked(knowledgePersistence.saveKnowledgeDocumentChunks),
  vi.mocked(knowledgePersistence.saveKnowledgeEvidence),
  vi.mocked(knowledgePersistence.saveKnowledgeLesson),
  vi.mocked(knowledgePersistence.upsertKnowledgeIncidentByExternalId),
];

const OPERATOR = { id: "operator-endpoint-test", role: "OPERATOR" };

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetMemoryRateLimitBackendForTests();
  getCurrentUserMock.mockResolvedValue(OPERATOR as never);
  syncCriticalPoisForBboxMock.mockResolvedValue({ fetchedCount: 0, upserted: 0, skipped: 0 } as never);
  userFindUniqueMock.mockResolvedValue(null);
  persistenceMocks.forEach((mock) => {
    mock.mockResolvedValue({ id: "doc-1" } as never);
  });
  vi.mocked(knowledgePersistence.upsertKnowledgeIncidentByExternalId).mockResolvedValue({
    incident: { id: "incident-1" },
    action: "created",
  } as never);
});

afterEach(() => {
  vi.clearAllMocks();
  resetMemoryRateLimitBackendForTests();
});

describe("Caso 3 — POST /api/knowledge-intake/import/manual: exceso de cuota", () => {
  it("al exceder el limite (10/600s), cero persistencia y cero normalizacion en el intento bloqueado", async () => {
    const body = { rawText: "Reporte de prueba para rate limiting", persist: true };
    for (let i = 0; i < 10; i += 1) {
      const response = await manualImportPost(jsonRequest(body, { "x-forwarded-for": "203.0.113.50" }));
      expect(response.status).toBe(200);
    }
    normalizeKnowledgeInputMock.mockClear();
    persistenceMocks.forEach((mock) => mock.mockClear());

    const blockedResponse = await manualImportPost(jsonRequest(body, { "x-forwarded-for": "203.0.113.50" }));
    expect(blockedResponse.status).toBe(429);
    const blockedBody = await blockedResponse.json();
    expect(blockedBody.error).toBe("RATE_LIMIT_EXCEEDED");
    expect(normalizeKnowledgeInputMock).not.toHaveBeenCalled();
    persistenceMocks.forEach((mock) => expect(mock).not.toHaveBeenCalled());
  });
});

describe("Caso 4 — POST /api/knowledge-intake/import/file: exceso de cuota", () => {
  it("al exceder el limite (5/600s), el archivo no se procesa ni se escribe nada", async () => {
    const body = {
      rawText: "Documento de prueba",
      inputType: "txt_markdown",
      rawMetadata: { submittedThrough: "test", persist: true },
    };
    for (let i = 0; i < 5; i += 1) {
      const response = await fileImportPost(jsonRequest(body, { "x-forwarded-for": "203.0.113.51" }));
      expect(response.status).toBe(200);
    }
    persistenceMocks.forEach((mock) => mock.mockClear());

    const blockedResponse = await fileImportPost(jsonRequest(body, { "x-forwarded-for": "203.0.113.51" }));
    expect(blockedResponse.status).toBe(429);
    persistenceMocks.forEach((mock) => expect(mock).not.toHaveBeenCalled());
  });
});

describe("Caso 5 — POST /api/critical-pois/sync: exceso de cuota", () => {
  const validBbox = { south: -33.5, west: -70.7, north: -33.4, east: -70.6 };

  it("al exceder el limite (3/900s), Overpass no se llama", async () => {
    for (let i = 0; i < 3; i += 1) {
      const response = await criticalPoiSyncPost(jsonRequest(validBbox, { "x-forwarded-for": "203.0.113.52" }));
      expect(response.status).toBe(200);
    }
    syncCriticalPoisForBboxMock.mockClear();

    const blockedResponse = await criticalPoiSyncPost(jsonRequest(validBbox, { "x-forwarded-for": "203.0.113.52" }));
    expect(blockedResponse.status).toBe(429);
    expect(syncCriticalPoisForBboxMock).not.toHaveBeenCalled();
  });
});

describe("Caso 16 — bbox excesivo", () => {
  it("400 antes de llamar a Overpass, para un bbox que abarca un area excesiva", async () => {
    const hugeBbox = { south: -56, west: -76, north: -17, east: -66 }; // Cono Sur completo
    const response = await criticalPoiSyncPost(jsonRequest(hugeBbox, { "x-forwarded-for": "203.0.113.53" }));
    expect(response.status).toBe(400);
    expect(syncCriticalPoisForBboxMock).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body.status).toBe("invalidRequest");
  });
});

describe("Caso 6 — login por IP", () => {
  it("multiples intentos bloqueados al superar el umbral (10/600s); verifyPassword nunca corre tras el bloqueo", async () => {
    // Distinct email per attempt so the (lower, 5/600s) account-layer limit
    // never trips first — this isolates the IP-layer limit (10/600s) being tested.
    const ip = "203.0.113.60";
    for (let i = 0; i < 10; i += 1) {
      const response = await loginPost(
        jsonRequest({ email: `attempt-${i}@example.com`, password: "wrong-password" }, { "x-forwarded-for": ip })
      );
      // user lookup mocked to null -> 401 "credenciales invalidas" for every unblocked attempt
      expect(response.status).toBe(401);
    }
    verifyPasswordMock.mockClear();
    userFindUniqueMock.mockClear();

    const blockedResponse = await loginPost(
      jsonRequest({ email: "attempt-11@example.com", password: "wrong-password" }, { "x-forwarded-for": ip })
    );
    expect(blockedResponse.status).toBe(429);
    expect(userFindUniqueMock).not.toHaveBeenCalled();
    expect(verifyPasswordMock).not.toHaveBeenCalled();
  });
});

describe("Caso 7 — login por cuenta (distinto de IP)", () => {
  it("la misma cuenta desde multiples IPs distintas es limitada por la capa de cuenta", async () => {
    const loginBody = { email: "targeted-account@example.com", password: "guess" };
    // 5 intentos desde 5 IPs distintas -> la capa por IP (10/600s cada una)
    // nunca se satura, pero la capa por cuenta (5/600s) si.
    for (let i = 0; i < 5; i += 1) {
      const response = await loginPost(jsonRequest(loginBody, { "x-forwarded-for": `198.51.100.${i}` }));
      expect(response.status).toBe(401);
    }
    const sixthAttempt = await loginPost(jsonRequest(loginBody, { "x-forwarded-for": "198.51.100.99" }));
    expect(sixthAttempt.status).toBe(429);
  });

  it("cuentas distintas no comparten cuota (Caso 8 aplicado a login)", async () => {
    const first = await loginPost(
      jsonRequest({ email: "user-one@example.com", password: "x" }, { "x-forwarded-for": "198.51.100.10" })
    );
    const second = await loginPost(
      jsonRequest({ email: "user-two@example.com", password: "x" }, { "x-forwarded-for": "198.51.100.11" })
    );
    expect(first.status).toBe(401);
    expect(second.status).toBe(401);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `POST /api/admin/telecom-connectivity` (spec ARGUS v1.0.3.6 §2/§18/§21):
 * `requireOperator()` es el piso para registrar candidatos/corroborados,
 * pero marcar `verificationStatus: "official"` exige ademas
 * `canConfirmOfficialConnectivityStatus` (AUTHORITY/INSTITUTIONAL_ADMIN/
 * ADMIN/SUPER_ADMIN). Fuente sin `sourceUrl`/`sourcePublishedAt` -> 400
 * (salvo `argus_estimate`). Mismo patron que
 * `tests/security/adminSanctionsAuthorization.test.ts`: se ejercita el
 * handler real con solo Prisma/auth mockeados.
 */

vi.mock("@/services/authService", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/services/auditService", () => ({
  logAuditEvent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    telecomConnectivityStatus: {
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    telecomConnectivityEvidence: { create: vi.fn() },
    criticalPoi: { upsert: vi.fn() },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  },
}));

import { getCurrentUser } from "@/services/authService";
import { prisma } from "@/lib/prisma";
import { POST as telecomConnectivityPost } from "@/app/api/admin/telecom-connectivity/route";

const getCurrentUserMock = vi.mocked(getCurrentUser);
const findFirstMock = vi.mocked(prisma.telecomConnectivityStatus.findFirst);
const createMock = vi.mocked(prisma.telecomConnectivityStatus.create);
const evidenceCreateMock = vi.mocked(prisma.telecomConnectivityEvidence.create);

const OPERATOR = { id: "operator-1", role: "OPERATOR" };
const AUTHORITY = { id: "authority-1", role: "AUTHORITY" };
const CITIZEN = { id: "citizen-1", role: "CITIZEN" };

function postRequest(body: unknown) {
  return new Request("http://localhost/api/admin/telecom-connectivity", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function mockActor(actor: typeof OPERATOR | null) {
  getCurrentUserMock.mockResolvedValue(actor as never);
}

const VALID_REGIONAL_BODY = {
  kind: "regional_status",
  adminLevel1: "Valparaíso",
  roamingType: "roaming_emergencia",
  networkState: "degraded",
  sourceType: "subtel_communique",
  sourceName: "SUBTEL",
  sourceUrl: "https://www.subtel.gob.cl/comunicado-x",
  sourcePublishedAt: "2026-07-17T10:00:00.000Z",
};

beforeEach(() => {
  findFirstMock.mockResolvedValue(null as never);
  createMock.mockResolvedValue({ id: "status-1" } as never);
  evidenceCreateMock.mockResolvedValue({ id: "evidence-1" } as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/admin/telecom-connectivity — autorizacion", () => {
  it("sin sesion -> 401", async () => {
    mockActor(null);
    const response = await telecomConnectivityPost(postRequest(VALID_REGIONAL_BODY));
    expect(response!.status).toBe(401);
  });

  it("CITIZEN -> 403 (no es OPERATOR+)", async () => {
    mockActor(CITIZEN as never);
    const response = await telecomConnectivityPost(postRequest(VALID_REGIONAL_BODY));
    expect(response!.status).toBe(403);
  });

  it("OPERATOR puede registrar un estado candidato/corroborado", async () => {
    mockActor(OPERATOR);
    const response = await telecomConnectivityPost(postRequest(VALID_REGIONAL_BODY));
    expect(response.status).toBe(200);
  });

  it("OPERATOR intentando verificationStatus 'official' -> 403", async () => {
    mockActor(OPERATOR);
    const response = await telecomConnectivityPost(postRequest({ ...VALID_REGIONAL_BODY, verificationStatus: "official" }));
    expect(response.status).toBe(403);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("AUTHORITY puede marcar verificationStatus 'official'", async () => {
    mockActor(AUTHORITY as never);
    const response = await telecomConnectivityPost(postRequest({ ...VALID_REGIONAL_BODY, verificationStatus: "official" }));
    expect(response.status).toBe(200);
  });
});

describe("POST /api/admin/telecom-connectivity — validacion de fuente", () => {
  it("sourceUrl ausente (sourceType != argus_estimate) -> 400", async () => {
    mockActor(OPERATOR);
    const { sourceUrl: _sourceUrl, ...body } = VALID_REGIONAL_BODY;
    const response = await telecomConnectivityPost(postRequest(body));
    expect(response.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("sourcePublishedAt ausente (sourceType != argus_estimate) -> 400", async () => {
    mockActor(OPERATOR);
    const { sourcePublishedAt: _sourcePublishedAt, ...body } = VALID_REGIONAL_BODY;
    const response = await telecomConnectivityPost(postRequest(body));
    expect(response.status).toBe(400);
  });

  it("sourceType 'argus_estimate' no requiere sourceUrl/sourcePublishedAt", async () => {
    mockActor(OPERATOR);
    const { sourceUrl: _sourceUrl, sourcePublishedAt: _sourcePublishedAt, ...rest } = VALID_REGIONAL_BODY;
    const response = await telecomConnectivityPost(postRequest({ ...rest, sourceType: "argus_estimate" }));
    expect(response.status).toBe(200);
  });

  it("roamingType 'roaming_internacional' -> 400, nunca se persiste", async () => {
    mockActor(OPERATOR);
    const response = await telecomConnectivityPost(postRequest({ ...VALID_REGIONAL_BODY, roamingType: "roaming_internacional" }));
    expect(response.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("kind invalido -> 400", async () => {
    mockActor(OPERATOR);
    const response = await telecomConnectivityPost(postRequest({ ...VALID_REGIONAL_BODY, kind: "not_a_kind" }));
    expect(response.status).toBe(400);
  });
});

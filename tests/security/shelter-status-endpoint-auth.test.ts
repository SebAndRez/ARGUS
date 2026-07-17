import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `POST /api/critical-pois/[id]/operational-status` (spec ARGUS v1.0.3.4
 * §19): endpoint de escritura de estado operacional de refugios, sin API
 * publica confirmada para SENAPRED/municipalidades — es la via primaria de
 * datos oficiales en produccion, y por lo tanto debe estar protegida como
 * cualquier otro endpoint administrativo del repo (mismo patron que
 * `tests/security/adminSanctionsAuthorization.test.ts`).
 */

vi.mock("@/services/authService", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/services/auditService", () => ({
  logAuditEvent: vi.fn(),
}));

vi.mock("@/lib/criticalPoi/criticalPoiPersistenceService", () => ({
  getCriticalPoiById: vi.fn(),
}));

vi.mock("@/lib/criticalPoi/shelterOperationalStatusService", () => ({
  getOperationalStatusByPoiId: vi.fn().mockResolvedValue(null),
  getStatusEvidenceForPoi: vi.fn().mockResolvedValue([]),
  applyShelterStatusReport: vi.fn().mockResolvedValue({ id: "status-1", poiId: "poi-1", shelterStatus: "available" }),
  recordShelterStatusEvidenceOnly: vi.fn(),
}));

import { getCurrentUser } from "@/services/authService";
import { logAuditEvent } from "@/services/auditService";
import { getCriticalPoiById } from "@/lib/criticalPoi/criticalPoiPersistenceService";
import { applyShelterStatusReport, getOperationalStatusByPoiId } from "@/lib/criticalPoi/shelterOperationalStatusService";
import { POST as operationalStatusPost } from "@/app/api/critical-pois/[id]/operational-status/route";
import { resetMemoryRateLimitBackendForTests } from "@/lib/security/rateLimitBackend";

const getCurrentUserMock = vi.mocked(getCurrentUser);
const logAuditEventMock = vi.mocked(logAuditEvent);
const getCriticalPoiByIdMock = vi.mocked(getCriticalPoiById);
const applyShelterStatusReportMock = vi.mocked(applyShelterStatusReport);
const getOperationalStatusByPoiIdMock = vi.mocked(getOperationalStatusByPoiId);

const CITIZEN = { id: "citizen-1", role: "CITIZEN" };
const OPERATOR = { id: "operator-1", role: "OPERATOR" };

const SHELTER_POI = {
  id: "poi-shelter-1",
  category: "shelter",
  name: "Refugio Estadio",
  lat: -33.46,
  lng: -70.61,
};

const HOSPITAL_POI = { ...SHELTER_POI, id: "poi-hospital-1", category: "hospital" };

function postRequest(id: string, body: unknown) {
  return new Request(`http://localhost/api/critical-pois/${id}/operational-status`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

const validBody = {
  sourceType: "manual_operator",
  sourceName: "Operador ARGUS - turno tarde",
  shelterStatus: "available",
  capacityTotal: 500,
  occupancyCurrent: 120,
};

beforeEach(() => {
  resetMemoryRateLimitBackendForTests();
  getCriticalPoiByIdMock.mockResolvedValue(SHELTER_POI as never);
  getOperationalStatusByPoiIdMock.mockResolvedValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
  resetMemoryRateLimitBackendForTests();
});

describe("POST /api/critical-pois/[id]/operational-status — autorizacion", () => {
  it("ANONYMOUS -> 401", async () => {
    getCurrentUserMock.mockResolvedValue(null as never);
    const response = await operationalStatusPost(postRequest(SHELTER_POI.id, validBody), ctx(SHELTER_POI.id));
    expect(response!.status).toBe(401);
    expect(applyShelterStatusReportMock).not.toHaveBeenCalled();
  });

  it("CITIZEN -> 403 (no es OPERATOR+)", async () => {
    getCurrentUserMock.mockResolvedValue(CITIZEN as never);
    const response = await operationalStatusPost(postRequest(SHELTER_POI.id, validBody), ctx(SHELTER_POI.id));
    expect(response!.status).toBe(403);
    expect(applyShelterStatusReportMock).not.toHaveBeenCalled();
  });

  it("OPERATOR con payload valido -> 200, aplica el reporte y registra auditoria", async () => {
    getCurrentUserMock.mockResolvedValue(OPERATOR as never);
    const response = await operationalStatusPost(postRequest(SHELTER_POI.id, validBody), ctx(SHELTER_POI.id));
    expect(response.status).toBe(200);
    expect(applyShelterStatusReportMock).toHaveBeenCalledTimes(1);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "operator-1",
        action: "SHELTER_STATUS_UPDATED",
        targetType: "CriticalPoi",
        targetId: SHELTER_POI.id,
      })
    );
  });
});

describe("POST /api/critical-pois/[id]/operational-status — validacion", () => {
  beforeEach(() => {
    getCurrentUserMock.mockResolvedValue(OPERATOR as never);
  });

  it("POI inexistente -> 404", async () => {
    getCriticalPoiByIdMock.mockResolvedValue(null);
    const response = await operationalStatusPost(postRequest("no-existe", validBody), ctx("no-existe"));
    expect(response.status).toBe(404);
  });

  it("POI de categoria distinta a 'shelter' -> 400, nunca aplica el reporte", async () => {
    getCriticalPoiByIdMock.mockResolvedValue(HOSPITAL_POI as never);
    const response = await operationalStatusPost(postRequest(HOSPITAL_POI.id, validBody), ctx(HOSPITAL_POI.id));
    expect(response.status).toBe(400);
    expect(applyShelterStatusReportMock).not.toHaveBeenCalled();
  });

  it("sourceType invalido -> 400 con detalle, sin tocar la base de datos", async () => {
    const response = await operationalStatusPost(
      postRequest(SHELTER_POI.id, { ...validBody, sourceType: "rumor_anonimo" }),
      ctx(SHELTER_POI.id)
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.details).toBeDefined();
    expect(applyShelterStatusReportMock).not.toHaveBeenCalled();
  });

  it("occupancyCurrent mayor que capacityTotal -> 400 (nunca se acepta un dato imposible)", async () => {
    const response = await operationalStatusPost(
      postRequest(SHELTER_POI.id, { ...validBody, capacityTotal: 50, occupancyCurrent: 999 }),
      ctx(SHELTER_POI.id)
    );
    expect(response.status).toBe(400);
    expect(applyShelterStatusReportMock).not.toHaveBeenCalled();
  });

  it("confidenceScore fuera de 0-100 -> 400", async () => {
    const response = await operationalStatusPost(
      postRequest(SHELTER_POI.id, { ...validBody, confidenceScore: 500 }),
      ctx(SHELTER_POI.id)
    );
    expect(response.status).toBe(400);
    expect(applyShelterStatusReportMock).not.toHaveBeenCalled();
  });

  it("campos ausentes no se envian como false/0 al servicio de persistencia", async () => {
    await operationalStatusPost(
      postRequest(SHELTER_POI.id, { sourceType: "manual_operator", sourceName: "Operador X", hasWater: true }),
      ctx(SHELTER_POI.id)
    );
    const [, report] = applyShelterStatusReportMock.mock.calls[0];
    expect(report.hasWater).toBe(true);
    expect(report.hasElectricity).toBeUndefined();
    expect(report.capacityTotal).toBeUndefined();
  });
});

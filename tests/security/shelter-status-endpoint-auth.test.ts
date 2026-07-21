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
import {
  applyShelterStatusReport,
  getOperationalStatusByPoiId,
  getStatusEvidenceForPoi,
} from "@/lib/criticalPoi/shelterOperationalStatusService";
import { GET as operationalStatusGet, POST as operationalStatusPost } from "@/app/api/critical-pois/[id]/operational-status/route";
import { resetMemoryRateLimitBackendForTests } from "@/lib/security/rateLimitBackend";

const getCurrentUserMock = vi.mocked(getCurrentUser);
const logAuditEventMock = vi.mocked(logAuditEvent);
const getCriticalPoiByIdMock = vi.mocked(getCriticalPoiById);
const applyShelterStatusReportMock = vi.mocked(applyShelterStatusReport);
const getOperationalStatusByPoiIdMock = vi.mocked(getOperationalStatusByPoiId);
const getStatusEvidenceForPoiMock = vi.mocked(getStatusEvidenceForPoi);

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

/**
 * GET /api/critical-pois/[id]/operational-status no tiene `requireOperator()`
 * (a diferencia del POST de arriba) — por diseno es publico, pero por eso
 * mismo nunca debe devolver operatorName/contactPhone/contactNotes, ni en
 * `operationalStatus` ni escondidos dentro de `evidence[].payload` (que
 * espeja el reporte de fuente original). Regresion del hallazgo de la
 * auditoria Fase 2.
 */
describe("GET /api/critical-pois/[id]/operational-status — redaccion de datos de contacto (sin autenticacion)", () => {
  const FULL_STATUS = {
    id: "status-1",
    poiId: SHELTER_POI.id,
    shelterStatus: "available",
    capacityStatus: "ok",
    operatorName: "Juan Perez",
    contactPhone: "+56 9 1234 5678",
    contactNotes: "Llamar solo despues de las 8am",
    sourceType: "manual_operator",
    sourceName: "Operador ARGUS",
    confidence: 70,
    verificationStatus: "unverified",
    lastUpdatedAt: "2026-07-18T00:00:00.000Z",
    isStale: false,
    publicationStatus: "active",
    createdAt: "2026-07-18T00:00:00.000Z",
  };

  const EVIDENCE_WITH_CONTACT_PAYLOAD = {
    id: "evidence-1",
    poiId: SHELTER_POI.id,
    eventType: "capacity_updated",
    sourceType: "manual_operator",
    sourceName: "Operador ARGUS",
    confidenceScore: 70,
    payload: {
      sourceType: "manual_operator",
      sourceName: "Operador ARGUS",
      confidenceScore: 70,
      operatorName: "Juan Perez",
      contactPhone: "+56 9 1234 5678",
      contactNotes: "Llamar solo despues de las 8am",
      capacityTotal: 100,
      // Clave desconocida/futura, no listada en el allowlist ni en el
      // denylist anterior — prueba que la redaccion es allowlist (todo lo
      // no reconocido se descarta), no denylist (solo se descartan 3
      // nombres conocidos).
      internalDebugNote: "nota interna que nunca deberia salir",
    },
    createdAt: "2026-07-18T00:00:00.000Z",
  };

  function getRequest(id: string) {
    return new Request(`http://localhost/api/critical-pois/${id}/operational-status`, { method: "GET" });
  }

  it("nunca expone operatorName/contactPhone/contactNotes en operationalStatus, ni en evidence[].payload", async () => {
    getCriticalPoiByIdMock.mockResolvedValue(SHELTER_POI as never);
    getOperationalStatusByPoiIdMock.mockResolvedValue(FULL_STATUS as never);
    getStatusEvidenceForPoiMock.mockResolvedValue([EVIDENCE_WITH_CONTACT_PAYLOAD] as never);

    const response = await operationalStatusGet(getRequest(SHELTER_POI.id), ctx(SHELTER_POI.id));
    expect(response.status).toBe(200);
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(body.operationalStatus.operatorName).toBeUndefined();
    expect(body.operationalStatus.contactPhone).toBeUndefined();
    expect(body.operationalStatus.contactNotes).toBeUndefined();
    expect(body.evidence[0].payload.operatorName).toBeUndefined();
    expect(body.evidence[0].payload.contactPhone).toBeUndefined();
    expect(body.evidence[0].payload.contactNotes).toBeUndefined();
    // Cinturon y tirantes: ninguno de los 3 valores reales aparece en ningun
    // lado de la respuesta serializada, sin importar la clave.
    expect(serialized).not.toContain("Juan Perez");
    expect(serialized).not.toContain("+56 9 1234 5678");
    expect(serialized).not.toContain("Llamar solo despues de las 8am");
    // Prueba de allowlist (no denylist): una clave desconocida en el payload
    // tambien queda afuera, no solo las 3 nombradas explicitamente.
    expect(body.evidence[0].payload.internalDebugNote).toBeUndefined();
    expect(serialized).not.toContain("internalDebugNote");
    expect(serialized).not.toContain("nota interna que nunca deberia salir");

    // El resto de los campos, no sensibles, se conserva.
    expect(body.operationalStatus.shelterStatus).toBe("available");
    expect(body.evidence[0].payload.capacityTotal).toBe(100);
  });

  it("operationalStatus ausente -> null, nunca revienta por falta de reporte", async () => {
    getCriticalPoiByIdMock.mockResolvedValue(SHELTER_POI as never);
    getOperationalStatusByPoiIdMock.mockResolvedValue(null);
    getStatusEvidenceForPoiMock.mockResolvedValue([]);

    const response = await operationalStatusGet(getRequest(SHELTER_POI.id), ctx(SHELTER_POI.id));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.operationalStatus).toBeNull();
    expect(body.evidence).toEqual([]);
  });

  it("POI no es shelter -> 404, nunca llama al servicio de estado", async () => {
    getCriticalPoiByIdMock.mockResolvedValue(HOSPITAL_POI as never);
    const response = await operationalStatusGet(getRequest(HOSPITAL_POI.id), ctx(HOSPITAL_POI.id));
    expect(response.status).toBe(404);
    expect(getOperationalStatusByPoiIdMock).not.toHaveBeenCalled();
  });
});

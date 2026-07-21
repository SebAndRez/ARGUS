import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GET /api/critical-pois (sin autenticacion) adjunta el estado operacional
 * de refugios a cada POI. Regresion del hallazgo de la auditoria Fase 2:
 * antes hacia `{ ...poi, operationalStatus }` con el objeto completo del
 * servicio, filtrando operatorName/contactPhone/contactNotes en cuanto esa
 * tabla tuviera filas. Ahora pasa por `toPublicShelterOperationalStatus`.
 */

vi.mock("@/lib/criticalPoi/criticalPoiPersistenceService", () => ({
  getCriticalPoisInBbox: vi.fn(),
}));

vi.mock("@/lib/criticalPoi/shelterOperationalStatusService", () => ({
  getOperationalStatusesByPoiIds: vi.fn(),
}));

import { getCriticalPoisInBbox } from "@/lib/criticalPoi/criticalPoiPersistenceService";
import { getOperationalStatusesByPoiIds } from "@/lib/criticalPoi/shelterOperationalStatusService";
import { GET as criticalPoisGet } from "@/app/api/critical-pois/route";

const getCriticalPoisInBboxMock = vi.mocked(getCriticalPoisInBbox);
const getOperationalStatusesByPoiIdsMock = vi.mocked(getOperationalStatusesByPoiIds);

const SHELTER_POI = {
  id: "poi-shelter-1",
  category: "shelter",
  priority: "P0",
  name: "Refugio Estadio",
  lat: -33.46,
  lng: -70.61,
  countryCode: "CL",
};

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

function bboxRequest(zoom = 12) {
  return new Request(
    `http://localhost/api/critical-pois?south=-34&west=-71&north=-33&east=-70&zoom=${zoom}`
  ) as never;
}

beforeEach(() => {
  getCriticalPoisInBboxMock.mockResolvedValue([SHELTER_POI] as never);
  getOperationalStatusesByPoiIdsMock.mockResolvedValue(new Map([[SHELTER_POI.id, FULL_STATUS]]) as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/critical-pois — redaccion de datos de contacto (sin autenticacion)", () => {
  it("nunca expone operatorName/contactPhone/contactNotes en operationalStatus", async () => {
    const response = await criticalPoisGet(bboxRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(body.pois).toHaveLength(1);
    expect(body.pois[0].operationalStatus.operatorName).toBeUndefined();
    expect(body.pois[0].operationalStatus.contactPhone).toBeUndefined();
    expect(body.pois[0].operationalStatus.contactNotes).toBeUndefined();
    expect(serialized).not.toContain("Juan Perez");
    expect(serialized).not.toContain("+56 9 1234 5678");
    expect(serialized).not.toContain("Llamar solo despues de las 8am");

    // El resto de los campos, no sensibles, se conserva.
    expect(body.pois[0].operationalStatus.shelterStatus).toBe("available");
    expect(body.pois[0].operationalStatus.sourceName).toBe("Operador ARGUS");
  });

  it("POI sin estado operacional reportado -> queda sin el campo, no revienta", async () => {
    getOperationalStatusesByPoiIdsMock.mockResolvedValue(new Map());
    const response = await criticalPoisGet(bboxRequest());
    const body = await response.json();
    expect(body.pois[0].operationalStatus).toBeUndefined();
  });
});

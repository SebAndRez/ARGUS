import { describe, expect, it, vi } from "vitest";

/**
 * `GET /api/fenix/shelters` debe seguir sirviendo el modo demo exactamente
 * igual que antes (sin params de ubicacion) y solo cambiar a datos reales
 * (`CriticalPoi` + estado operacional) cuando se entrega `lat`/`lng` — spec
 * ARGUS v1.0.3.4 §4 (no crear un segundo endpoint, extender el existente sin
 * romper el modo demo).
 */

vi.mock("@/lib/fenix/fenixShelterSource", () => ({
  getRealFenixShelters: vi.fn(),
}));

import { NextRequest } from "next/server";
import { GET as fenixSheltersGet } from "@/app/api/fenix/shelters/route";
import { getRealFenixShelters } from "@/lib/fenix/fenixShelterSource";
import { demoFenixShelters } from "@/data/fenixDemo";

const getRealFenixSheltersMock = vi.mocked(getRealFenixShelters);

function request(query: string) {
  return new NextRequest(`http://localhost/api/fenix/shelters${query}`);
}

describe("GET /api/fenix/shelters", () => {
  it("sin lat/lng: sirve el set demo completo, sin tocar getRealFenixShelters", async () => {
    const response = await fenixSheltersGet(request(""));
    const body = await response.json();
    expect(body.source).toBe("demo");
    expect(body.shelters).toEqual(demoFenixShelters);
    expect(getRealFenixSheltersMock).not.toHaveBeenCalled();
  });

  it("sin lat/lng pero con scenarioId: filtra el set demo por escenario, comportamiento sin cambios", async () => {
    const scenarioId = demoFenixShelters[0].scenarioId;
    const response = await fenixSheltersGet(request(`?scenarioId=${scenarioId}`));
    const body = await response.json();
    expect(body.source).toBe("demo");
    expect(body.shelters.every((shelter: { scenarioId?: string }) => shelter.scenarioId === scenarioId)).toBe(true);
  });

  it("con lat/lng: consulta refugios reales y nunca mezcla con datos demo", async () => {
    getRealFenixSheltersMock.mockResolvedValue([
      { id: "poi-1", name: "Refugio Real", status: "available", coordinates: [-33.45, -70.6] },
    ]);
    const response = await fenixSheltersGet(request("?lat=-33.45&lng=-70.6&radiusKm=5"));
    const body = await response.json();
    expect(body.source).toBe("critical_poi");
    expect(body.shelters).toHaveLength(1);
    expect(getRealFenixSheltersMock).toHaveBeenCalledWith({ lat: -33.45, lng: -70.6 }, 5);
  });

  it("con lat/lng pero fallo en la consulta real: responde 200 con lista vacia, no revienta el mapa", async () => {
    getRealFenixSheltersMock.mockRejectedValue(new Error("db down"));
    const response = await fenixSheltersGet(request("?lat=-33.45&lng=-70.6"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.source).toBe("critical_poi");
    expect(body.shelters).toEqual([]);
    expect(body.error).toBeTruthy();
  });

  it("radiusKm se acota al maximo permitido", async () => {
    getRealFenixSheltersMock.mockResolvedValue([]);
    await fenixSheltersGet(request("?lat=-33.45&lng=-70.6&radiusKm=99999"));
    expect(getRealFenixSheltersMock).toHaveBeenCalledWith({ lat: -33.45, lng: -70.6 }, 100);
  });
});

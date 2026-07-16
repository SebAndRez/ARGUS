import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ARGUS Prompt 17 §35 — integración ligera del endpoint compartido:
 * registro → selección → gateway → contexto → respuesta HTTP. Solo se
 * mockea la capa de permisos/gateway — el endpoint real corre sin mockear.
 */

vi.mock("@/lib/modules/moduleOperationalContext", () => ({
  getModuleIncidentListContext: vi.fn(),
  getModuleIncidentDetailContext: vi.fn(),
}));

import { NextRequest } from "next/server";
import { getModuleIncidentDetailContext, getModuleIncidentListContext } from "@/lib/modules/moduleOperationalContext";
import { GET as listGet } from "@/app/api/modules/incidents/route";
import { GET as detailGet } from "@/app/api/modules/incidents/[id]/route";

const listContextMock = vi.mocked(getModuleIncidentListContext);
const detailContextMock = vi.mocked(getModuleIncidentDetailContext);

beforeEach(() => {
  listContextMock.mockReset();
  detailContextMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/modules/incidents", () => {
  it("rechaza sin ?module= válido, sin invocar el contexto", async () => {
    const response = await listGet(new NextRequest("http://localhost/api/modules/incidents"));
    expect(response.status).toBe(400);
    expect(listContextMock).not.toHaveBeenCalled();
  });

  it("propaga el estado unauthorized como 401", async () => {
    listContextMock.mockResolvedValue({ state: "unauthorized", error: { code: "UNAUTHORIZED", message: "no session" } });
    const response = await listGet(new NextRequest("http://localhost/api/modules/incidents?module=argus-atlas"));
    expect(response.status).toBe(401);
  });

  it("estado degradado del gateway responde 502, nunca 200 con array vacío disfrazado", async () => {
    listContextMock.mockResolvedValue({ state: "unavailable", error: { code: "DATA_UNAVAILABLE", message: "db down" } });
    const response = await listGet(new NextRequest("http://localhost/api/modules/incidents?module=argus-vigia"));
    expect(response.status).toBe(502);
  });

  it("estado available responde 200 con los datos", async () => {
    listContextMock.mockResolvedValue({ state: "available", data: { summaries: [], nextCursor: null } });
    const response = await listGet(new NextRequest("http://localhost/api/modules/incidents?module=argus-vigia&limit=10"));
    expect(response.status).toBe(200);
    expect(listContextMock).toHaveBeenCalledWith("argus-vigia", expect.objectContaining({ limit: 10 }));
  });

  it("parsea filtros de lista separados por coma", async () => {
    listContextMock.mockResolvedValue({ state: "empty", data: { summaries: [], nextCursor: null } });
    await listGet(new NextRequest("http://localhost/api/modules/incidents?module=argus-talos&severity=high,critical"));
    expect(listContextMock).toHaveBeenCalledWith("argus-talos", expect.objectContaining({ severity: ["high", "critical"] }));
  });
});

describe("GET /api/modules/incidents/[id]", () => {
  it("responde 404 cuando el incidente no existe", async () => {
    detailContextMock.mockResolvedValue({ state: "unavailable", error: { code: "INCIDENT_NOT_FOUND", message: "not found" } });
    const response = await detailGet(new NextRequest("http://localhost/api/modules/incidents/abc?module=argus-oraculo"), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(response.status).toBe(404);
  });

  it("responde 400 sin ?module= válido", async () => {
    const response = await detailGet(new NextRequest("http://localhost/api/modules/incidents/abc"), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(response.status).toBe(400);
    expect(detailContextMock).not.toHaveBeenCalled();
  });

  it("responde 200 con insufficient_data cuando corresponde (no un error genérico)", async () => {
    detailContextMock.mockResolvedValue({ state: "insufficient_data", error: { code: "INSUFFICIENT_DATA", message: "no geometry" } });
    const response = await detailGet(new NextRequest("http://localhost/api/modules/incidents/abc?module=argus-talos"), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.state).toBe("insufficient_data");
  });
});

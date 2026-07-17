import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PRIV-FINAL-001 — `GET /api/help-requests` and `GET /api/reports` used to
 * return raw Prisma rows (full description, exact latitude/longitude,
 * locationText, etc.) to any caller, authenticated or not. This suite drives
 * the real route handlers (real RBAC via `hasAnyRole`/`OPERATOR_ROLES`, real
 * DTO serializers, real rate limiter) with only the I/O boundary mocked:
 * `@/services/authService`'s `getCurrentUser` and `@/lib/prisma`.
 */

vi.mock("@/services/authService", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    helpRequest: { findMany: vi.fn() },
    report: { findMany: vi.fn() },
  },
}));

import { NextRequest } from "next/server";
import { getCurrentUser } from "@/services/authService";
import { prisma } from "@/lib/prisma";
import { GET as helpRequestsGet } from "@/app/api/help-requests/route";
import { GET as reportsGet } from "@/app/api/reports/route";
import { resetMemoryRateLimitBackendForTests } from "@/lib/security/rateLimitBackend";

const getCurrentUserMock = vi.mocked(getCurrentUser);
const helpRequestFindManyMock = vi.mocked(prisma.helpRequest.findMany);
const reportFindManyMock = vi.mocked(prisma.report.findMany);

const ANONYMOUS = null;
const CITIZEN = { id: "citizen-1", role: "CITIZEN" };
const VERIFIED_CITIZEN = { id: "verified-1", role: "VERIFIED_CITIZEN" };
const OPERATOR = { id: "operator-1", role: "OPERATOR" };
const ANALYST = { id: "analyst-1", role: "ANALYST" };
const ADMIN = { id: "admin-1", role: "ADMIN" };
const SUPER_ADMIN = { id: "super-1", role: "SUPER_ADMIN" };
// A role string that does not exist in the RBAC hierarchy at all — simulates
// a forged/garbage role value that must never grant elevated access.
const FORGED_ROLE = { id: "forged-1", role: "SUPER_DUPER_ADMIN" };

const rawHelpRequest = {
  id: "hr-1",
  userId: "citizen-owner",
  category: "medical",
  title: "Ayuda urgente, estoy atrapada",
  description: "Estoy en el segundo piso de mi casa en calle Falsa 123, con mi hija de 3 años",
  latitude: -33.44891,
  longitude: -70.66932,
  locationText: "Calle Falsa 123, depto 4B",
  priority: "HIGH",
  status: "RECEIVED",
  restrictedMode: false,
  aiSummary: "Solicitud de ayuda clasificada como alta basada en la descripción.",
  aiRecommendation: "Enviar unidad de apoyo y coordinar con operadores locales.",
  aiConfidence: 80,
  createdAt: new Date("2026-07-10T10:00:00.000Z"),
  updatedAt: new Date("2026-07-10T10:00:00.000Z"),
  user: { publicAlias: "Vecino-4821" },
};

const restrictedHelpRequest = {
  ...rawHelpRequest,
  id: "hr-restricted",
  restrictedMode: true,
};

const rawReport = {
  id: "rep-1",
  userId: "citizen-reporter",
  category: "fire",
  title: "Incendio junto a mi casa en Av. Siempre Viva 742",
  description: "Se ve una columna de humo enorme, mi telefono es 555-1234 por si necesitan mas datos",
  latitude: -33.44891,
  longitude: -70.66932,
  locationText: "Av. Siempre Viva 742",
  severity: "HIGH",
  status: "NEW",
  aiSummary: "Análisis preliminar de la alerta: se detecta un posible evento de fire con prioridad high.",
  aiRecommendation: "Recomendado: enviar equipo de respuesta a la ubicación reportada.",
  aiConfidence: 75,
  falseReportRisk: 18,
  createdAt: new Date("2026-07-10T11:00:00.000Z"),
  updatedAt: new Date("2026-07-10T11:00:00.000Z"),
  user: { publicAlias: "Ciudadano-9021" },
};

const FORBIDDEN_PUBLIC_SUBSTRINGS = [
  "description",
  "locationText",
  "Falsa 123",
  "Siempre Viva 742",
  "555-1234",
  "Estoy en el segundo piso",
  "columna de humo enorme",
  "\"latitude\"",
  "\"longitude\"",
  "-33.44891",
  "-70.66932",
  "citizen-owner",
  "citizen-reporter",
];

function assertNoLeak(body: unknown) {
  const serialized = JSON.stringify(body);
  for (const needle of FORBIDDEN_PUBLIC_SUBSTRINGS) {
    expect(serialized).not.toContain(needle);
  }
}

function getRequest(path: string, ip = "203.0.113.10") {
  return new NextRequest(`http://localhost${path}`, {
    headers: { "x-forwarded-for": ip },
  });
}

beforeEach(() => {
  resetMemoryRateLimitBackendForTests();
  helpRequestFindManyMock.mockResolvedValue([rawHelpRequest, restrictedHelpRequest] as never);
  reportFindManyMock.mockResolvedValue([rawReport] as never);
});

afterEach(() => {
  vi.clearAllMocks();
  resetMemoryRateLimitBackendForTests();
});

describe("GET /api/help-requests — autorización por rol", () => {
  it("Caso 1 — anónimo: 200, DTO público redactado, cero PII, cero coordenadas exactas", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    const response = await helpRequestsGet(getRequest("/api/help-requests", "203.0.113.11"));
    expect(response.status).toBe(200);
    const body = await response.json();
    assertNoLeak(body);
    expect(body.helpRequests).toHaveLength(2);
    expect(body.helpRequests[0]).not.toHaveProperty("description");
    expect(body.helpRequests[0]).not.toHaveProperty("title");
  });

  it("Caso 2 — ciudadano autenticado (CITIZEN): mismo nivel público que anónimo", async () => {
    getCurrentUserMock.mockResolvedValue(CITIZEN as never);
    const response = await helpRequestsGet(getRequest("/api/help-requests", "203.0.113.12"));
    expect(response.status).toBe(200);
    const body = await response.json();
    assertNoLeak(body);
  });

  it("VERIFIED_CITIZEN tampoco recibe detalle completo (solo OPERATOR+ lo hace)", async () => {
    getCurrentUserMock.mockResolvedValue(VERIFIED_CITIZEN as never);
    const response = await helpRequestsGet(getRequest("/api/help-requests", "203.0.113.13"));
    const body = await response.json();
    assertNoLeak(body);
  });

  it("Caso 3 — OPERATOR: detalle completo permitido, cache privada/no-store", async () => {
    getCurrentUserMock.mockResolvedValue(OPERATOR as never);
    const response = await helpRequestsGet(getRequest("/api/help-requests", "203.0.113.14"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.helpRequests[0].description).toBe(rawHelpRequest.description);
    expect(body.helpRequests[0].latitude).toBe(rawHelpRequest.latitude);
  });

  it("ANALYST: detalle completo permitido (mismo nivel que OPERATOR)", async () => {
    getCurrentUserMock.mockResolvedValue(ANALYST as never);
    const response = await helpRequestsGet(getRequest("/api/help-requests", "203.0.113.15"));
    const body = await response.json();
    expect(body.helpRequests[0].description).toBe(rawHelpRequest.description);
  });

  it("Caso 4 — ADMIN y SUPER_ADMIN: detalle completo permitido", async () => {
    getCurrentUserMock.mockResolvedValue(ADMIN as never);
    const adminResponse = await helpRequestsGet(getRequest("/api/help-requests", "203.0.113.16"));
    const adminBody = await adminResponse.json();
    expect(adminBody.helpRequests[0].description).toBe(rawHelpRequest.description);

    getCurrentUserMock.mockResolvedValue(SUPER_ADMIN as never);
    const superAdminResponse = await helpRequestsGet(getRequest("/api/help-requests", "203.0.113.17"));
    const superAdminBody = await superAdminResponse.json();
    expect(superAdminBody.helpRequests[0].description).toBe(rawHelpRequest.description);
  });

  it("Caso 5 — rol falso/inexistente en la sesión: no obtiene detalle (se normaliza a PUBLIC)", async () => {
    getCurrentUserMock.mockResolvedValue(FORGED_ROLE as never);
    const response = await helpRequestsGet(getRequest("/api/help-requests", "203.0.113.18"));
    const body = await response.json();
    assertNoLeak(body);
  });

  it("Caso 6 — restrictedMode: anónimo no recibe ubicación aproximada del registro restringido", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    const response = await helpRequestsGet(getRequest("/api/help-requests", "203.0.113.19"));
    const body = await response.json();
    const restricted = body.helpRequests.find((item: { id: string }) => item.id === "hr-restricted");
    expect(restricted.isRestricted).toBe(true);
    expect(restricted.approximateLocation).toBeNull();
  });

  it("query params de rol falso (?role=OPERATOR, ?admin=true) no tienen ningún efecto: el guard nunca lee la URL", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    const response = await helpRequestsGet(
      getRequest("/api/help-requests?role=OPERATOR&admin=true&full=true", "203.0.113.20")
    );
    const body = await response.json();
    assertNoLeak(body);
    expect(response.headers.get("Cache-Control")).not.toBe("private, no-store");
  });

  it("Caso 8 — paginación: limite invalido/enorme se acota al máximo permitido", async () => {
    getCurrentUserMock.mockResolvedValue(OPERATOR as never);
    await helpRequestsGet(getRequest("/api/help-requests?limit=999999", "203.0.113.21"));
    expect(helpRequestFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 })
    );
  });
});

describe("GET /api/reports — autorización por rol", () => {
  it("Caso 1 — anónimo: 200, DTO público redactado, cero PII, cero coordenadas exactas", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    const response = await reportsGet(getRequest("/api/reports", "203.0.113.30"));
    expect(response.status).toBe(200);
    const body = await response.json();
    assertNoLeak(body);
    expect(body.reports[0]).not.toHaveProperty("description");
    expect(body.reports[0]).not.toHaveProperty("title");
    expect(body.reports[0]).not.toHaveProperty("falseReportRisk");
  });

  it("Caso 2 — ciudadano autenticado (CITIZEN): mismo nivel público que anónimo", async () => {
    getCurrentUserMock.mockResolvedValue(CITIZEN as never);
    const response = await reportsGet(getRequest("/api/reports", "203.0.113.31"));
    const body = await response.json();
    assertNoLeak(body);
  });

  it("Caso 3/4 — OPERATOR/ADMIN: detalle completo permitido, cache privada/no-store", async () => {
    getCurrentUserMock.mockResolvedValue(OPERATOR as never);
    const response = await reportsGet(getRequest("/api/reports", "203.0.113.32"));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.reports[0].description).toBe(rawReport.description);
    expect(body.reports[0].locationText).toBe(rawReport.locationText);
  });

  it("Caso 5 — rol falso: no obtiene detalle", async () => {
    getCurrentUserMock.mockResolvedValue(FORGED_ROLE as never);
    const response = await reportsGet(getRequest("/api/reports", "203.0.113.33"));
    const body = await response.json();
    assertNoLeak(body);
  });

  it("Caso 7 — registro antiguo con campos ausentes no rompe el endpoint", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    reportFindManyMock.mockResolvedValue([{ id: "legacy-1" }] as never);
    const response = await reportsGet(getRequest("/api/reports", "203.0.113.34"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.reports[0].approximateLocation).toBeNull();
  });

  it("Caso 8 — paginación: limite invalido/enorme se acota al máximo permitido", async () => {
    getCurrentUserMock.mockResolvedValue(OPERATOR as never);
    await reportsGet(getRequest("/api/reports?limit=abc", "203.0.113.35"));
    expect(reportFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
  });
});

describe("Rate limiting de lectura pública (§16) — no bloquea a operadores", () => {
  it("anónimo excede la cuota (60/60s) y recibe 429; operador desde la misma IP no es afectado", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    const ip = "203.0.113.40";
    for (let i = 0; i < 60; i += 1) {
      const response = await reportsGet(getRequest("/api/reports", ip));
      expect(response.status).toBe(200);
    }
    const blocked = await reportsGet(getRequest("/api/reports", ip));
    expect(blocked.status).toBe(429);

    getCurrentUserMock.mockResolvedValue(OPERATOR as never);
    const operatorResponse = await reportsGet(getRequest("/api/reports", ip));
    expect(operatorResponse.status).toBe(200);
  });
});

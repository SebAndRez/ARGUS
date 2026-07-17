import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PRIV-FINAL-001 — `GET /api/events` is the real, unauthenticated data
 * source behind the public 2D map / VIGÍA / ATLAS (confirmed: it queries
 * `Report`/`HelpRequest` directly, bypassing `GET /api/reports` and
 * `GET /api/help-requests`). Locking down those two endpoints alone would
 * leave this route as "a second insecure API" (explicitly forbidden by the
 * fix's own instructions) since the map keeps fetching straight from here.
 * This suite proves the same role-based redaction applies here too, and
 * that the map's data contract (`CrisisEvent`-shaped objects with
 * non-nullable `title`/`description`/`latitude`/`longitude`) still holds for
 * public/citizen viewers so existing rendering code doesn't break.
 */

vi.mock("@/services/authService", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: { findMany: vi.fn() },
    helpRequest: { findMany: vi.fn() },
  },
}));

import { NextRequest } from "next/server";
import { getCurrentUser } from "@/services/authService";
import { prisma } from "@/lib/prisma";
import { GET as eventsGet } from "@/app/api/events/route";
import { resetMemoryRateLimitBackendForTests } from "@/lib/security/rateLimitBackend";

const getCurrentUserMock = vi.mocked(getCurrentUser);
const reportFindManyMock = vi.mocked(prisma.report.findMany);
const helpRequestFindManyMock = vi.mocked(prisma.helpRequest.findMany);

const ANONYMOUS = null;
const CITIZEN = { id: "citizen-1", role: "CITIZEN" };
const OPERATOR = { id: "operator-1", role: "OPERATOR" };
const ADMIN = { id: "admin-1", role: "ADMIN" };
const FORGED_ROLE = { id: "forged-1", role: "SUPER_DUPER_ADMIN" };

const rawReport = {
  id: "rep-1",
  userId: "citizen-reporter",
  category: "fire",
  title: "Incendio junto a mi casa en Av. Siempre Viva 742",
  description: "Se ve una columna de humo enorme, mi telefono es 555-1234",
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

const rawHelpRequest = {
  id: "hr-1",
  userId: "citizen-owner",
  category: "medical",
  title: "Ayuda urgente, estoy atrapada en calle Falsa 123",
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

const restrictedHelpRequest = { ...rawHelpRequest, id: "hr-restricted", restrictedMode: true };
const legacyHelpRequestNoCoords = {
  ...rawHelpRequest,
  id: "hr-legacy",
  latitude: null,
  longitude: null,
};

const FORBIDDEN_PUBLIC_SUBSTRINGS = [
  "Falsa 123",
  "Siempre Viva 742",
  "555-1234",
  "segundo piso",
  "columna de humo enorme",
  "-33.44891",
  "-70.66932",
  "citizen-owner",
  "citizen-reporter",
  "\"locationText\":\"",
];

function assertNoLeak(body: unknown) {
  const serialized = JSON.stringify(body);
  for (const needle of FORBIDDEN_PUBLIC_SUBSTRINGS) {
    expect(serialized).not.toContain(needle);
  }
}

function getRequest(path: string, ip = "203.0.113.50") {
  return new NextRequest(`http://localhost${path}`, { headers: { "x-forwarded-for": ip } });
}

beforeEach(() => {
  resetMemoryRateLimitBackendForTests();
  reportFindManyMock.mockResolvedValue([rawReport] as never);
  helpRequestFindManyMock.mockResolvedValue([rawHelpRequest, restrictedHelpRequest, legacyHelpRequestNoCoords] as never);
});

afterEach(() => {
  vi.clearAllMocks();
  resetMemoryRateLimitBackendForTests();
});

describe("GET /api/events — mapa público (Caso 22: regresión del mapa)", () => {
  it("anónimo: cero PII, cero coordenadas exactas, contrato CrisisEvent intacto (title/description siempre presentes)", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    const response = await eventsGet(getRequest("/api/events", "203.0.113.51"));
    expect(response.status).toBe(200);
    const body = await response.json();
    assertNoLeak(body);

    const reportEvent = body.events.find((event: { recordType: string }) => event.recordType === "Report");
    expect(reportEvent.title).toBeTruthy();
    expect(reportEvent.description).toBeTruthy();
    expect(typeof reportEvent.latitude).toBe("number");
    expect(typeof reportEvent.longitude).toBe("number");
    expect(reportEvent.latitude).not.toBe(rawReport.latitude);
    expect(reportEvent.longitude).not.toBe(rawReport.longitude);
  });

  it("ciudadano autenticado (CITIZEN): mismo nivel redactado que anónimo", async () => {
    getCurrentUserMock.mockResolvedValue(CITIZEN as never);
    const response = await eventsGet(getRequest("/api/events", "203.0.113.52"));
    const body = await response.json();
    assertNoLeak(body);
  });

  it("HelpRequest restringido (restrictedMode) nunca aparece con coordenada exacta — se excluye del feed público", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    const response = await eventsGet(getRequest("/api/events", "203.0.113.53"));
    const body = await response.json();
    const restricted = body.events.find((event: { id: string }) => event.id === "hr-restricted");
    expect(restricted).toBeUndefined();
  });

  it("registro legado sin coordenadas no rompe el endpoint y se excluye del feed público", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    const response = await eventsGet(getRequest("/api/events", "203.0.113.54"));
    expect(response.status).toBe(200);
    const body = await response.json();
    const legacy = body.events.find((event: { id: string }) => event.id === "hr-legacy");
    expect(legacy).toBeUndefined();
  });

  it("Report público no expone texto completo (title/description son plantillas seguras, no el original)", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    const response = await eventsGet(getRequest("/api/events", "203.0.113.55"));
    const body = await response.json();
    const reportEvent = body.events.find((event: { recordType: string }) => event.recordType === "Report");
    expect(reportEvent.title).not.toBe(rawReport.title);
    expect(reportEvent.description).not.toBe(rawReport.description);
  });

  it("operador puede abrir detalle completo cuando corresponde, con cache privada/no-store", async () => {
    getCurrentUserMock.mockResolvedValue(OPERATOR as never);
    const response = await eventsGet(getRequest("/api/events", "203.0.113.56"));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await response.json();
    const reportEvent = body.events.find((event: { recordType: string }) => event.recordType === "Report");
    expect(reportEvent.description).toBe(rawReport.description);
    expect(reportEvent.latitude).toBe(rawReport.latitude);
  });

  it("ADMIN también conserva acceso completo", async () => {
    getCurrentUserMock.mockResolvedValue(ADMIN as never);
    const response = await eventsGet(getRequest("/api/events", "203.0.113.57"));
    const body = await response.json();
    const reportEvent = body.events.find((event: { recordType: string }) => event.recordType === "Report");
    expect(reportEvent.description).toBe(rawReport.description);
  });

  it("rol falso en la sesión no obtiene detalle completo", async () => {
    getCurrentUserMock.mockResolvedValue(FORGED_ROLE as never);
    const response = await eventsGet(getRequest("/api/events", "203.0.113.58"));
    const body = await response.json();
    assertNoLeak(body);
  });

  it("parámetros de rol falsos en la URL (?role=OPERATOR) no tienen ningún efecto", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    const response = await eventsGet(getRequest("/api/events?role=OPERATOR&admin=true", "203.0.113.59"));
    const body = await response.json();
    assertNoLeak(body);
    expect(response.headers.get("Cache-Control")).not.toBe("private, no-store");
  });
});

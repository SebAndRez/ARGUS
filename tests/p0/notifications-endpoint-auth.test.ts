import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SEC-GAP-01 fix — `GET /api/notifications` had no session/role check at all
 * and read `Report`/`HelpRequest` directly without the redaction applied by
 * every sibling route (`GET /api/reports`, `GET /api/help-requests`,
 * `GET /api/events`, PRIV-FINAL-001). This suite drives the real route
 * handler (real RBAC via `hasAnyRole`/`OPERATOR_ROLES`, real DTO serializers,
 * real rate limiter) with only the I/O boundary mocked.
 */

vi.mock("@/services/authService", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/predictive-core/predictiveFeed", () => ({
  getPredictiveNotificationPackets: vi.fn(),
}));

vi.mock("@/lib/ingestion/ingestUsgsEarthquakes", () => ({
  getOrFetchUsgsEarthquakes: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: { findMany: vi.fn() },
    helpRequest: { findMany: vi.fn() },
    externalEvent: { findMany: vi.fn(), groupBy: vi.fn() },
    ingestionRun: { findMany: vi.fn() },
    preparednessReminder: { findMany: vi.fn() },
    knowledgeIncident: { findMany: vi.fn() },
    criticalPoiOperationalStatus: { findMany: vi.fn() },
    telecomConnectivityStatus: { findMany: vi.fn() },
    telecomConnectivityEvidence: { findFirst: vi.fn(), findMany: vi.fn() },
    criticalPoi: { findUnique: vi.fn() },
  },
}));

import { NextRequest } from "next/server";
import { getCurrentUser } from "@/services/authService";
import { getPredictiveNotificationPackets } from "@/lib/predictive-core/predictiveFeed";
import { getOrFetchUsgsEarthquakes } from "@/lib/ingestion/ingestUsgsEarthquakes";
import { prisma } from "@/lib/prisma";
import { GET as notificationsGet } from "@/app/api/notifications/route";
import { resetMemoryRateLimitBackendForTests } from "@/lib/security/rateLimitBackend";

const getCurrentUserMock = vi.mocked(getCurrentUser);
const getPredictiveNotificationPacketsMock = vi.mocked(getPredictiveNotificationPackets);
const getOrFetchUsgsEarthquakesMock = vi.mocked(getOrFetchUsgsEarthquakes);
const reportFindManyMock = vi.mocked(prisma.report.findMany);
const helpRequestFindManyMock = vi.mocked(prisma.helpRequest.findMany);
const externalEventFindManyMock = vi.mocked(prisma.externalEvent.findMany);
const externalEventGroupByMock = vi.mocked(prisma.externalEvent.groupBy);
const ingestionRunFindManyMock = vi.mocked(prisma.ingestionRun.findMany);
const preparednessReminderFindManyMock = vi.mocked(prisma.preparednessReminder.findMany);
const knowledgeIncidentFindManyMock = vi.mocked(prisma.knowledgeIncident.findMany);
const shelterStatusFindManyMock = vi.mocked(prisma.criticalPoiOperationalStatus.findMany);
const telecomStatusFindManyMock = vi.mocked(prisma.telecomConnectivityStatus.findMany);
const telecomEvidenceFindFirstMock = vi.mocked(prisma.telecomConnectivityEvidence.findFirst);
const telecomEvidenceFindManyMock = vi.mocked(prisma.telecomConnectivityEvidence.findMany);
const criticalPoiFindUniqueMock = vi.mocked(prisma.criticalPoi.findUnique);

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
];

function assertNoLeak(body: unknown) {
  const serialized = JSON.stringify(body);
  for (const needle of FORBIDDEN_PUBLIC_SUBSTRINGS) {
    expect(serialized).not.toContain(needle);
  }
}

function getRequest(path: string, ip = "203.0.113.70") {
  return new NextRequest(`http://localhost${path}`, { headers: { "x-forwarded-for": ip } });
}

beforeEach(() => {
  resetMemoryRateLimitBackendForTests();
  reportFindManyMock.mockResolvedValue([rawReport] as never);
  helpRequestFindManyMock.mockResolvedValue([rawHelpRequest] as never);
  externalEventFindManyMock.mockResolvedValue([] as never);
  externalEventGroupByMock.mockResolvedValue([] as never);
  ingestionRunFindManyMock.mockResolvedValue([] as never);
  preparednessReminderFindManyMock.mockResolvedValue([] as never);
  knowledgeIncidentFindManyMock.mockResolvedValue([] as never);
  shelterStatusFindManyMock.mockResolvedValue([] as never);
  telecomStatusFindManyMock.mockResolvedValue([] as never);
  telecomEvidenceFindFirstMock.mockResolvedValue(null as never);
  telecomEvidenceFindManyMock.mockResolvedValue([] as never);
  criticalPoiFindUniqueMock.mockResolvedValue(null as never);
  getPredictiveNotificationPacketsMock.mockResolvedValue([] as never);
  getOrFetchUsgsEarthquakesMock.mockResolvedValue({ events: [] } as never);
});

afterEach(() => {
  vi.clearAllMocks();
  resetMemoryRateLimitBackendForTests();
});

describe("GET /api/notifications — Caso A: sin sesión", () => {
  it("anónimo: 200, cero PII de Report/HelpRequest, cero coordenadas exactas", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    const response = await notificationsGet(getRequest("/api/notifications"));
    expect(response.status).toBe(200);
    const body = await response.json();
    assertNoLeak(body);
  });

  it("anónimo: la petición nunca consulta PreparednessReminder (dato personal sin sesión)", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    await notificationsGet(getRequest("/api/notifications"));
    expect(preparednessReminderFindManyMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/notifications — Caso B: acceso propio (VESTA reminders)", () => {
  it("usuario autenticado: los recordatorios se filtran exclusivamente por su propio userId, derivado del servidor", async () => {
    getCurrentUserMock.mockResolvedValue(CITIZEN as never);
    await notificationsGet(getRequest("/api/notifications"));
    expect(preparednessReminderFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ profile: { userId: CITIZEN.id } }),
      })
    );
  });
});

describe("GET /api/notifications — Caso C: intento de IDOR", () => {
  it("un userId/profileId arbitrario en la query string no tiene ningún efecto sobre qué recordatorios se leen", async () => {
    getCurrentUserMock.mockResolvedValue(CITIZEN as never);
    await notificationsGet(getRequest("/api/notifications?userId=another-user&profileId=another-profile"));
    expect(preparednessReminderFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ profile: { userId: CITIZEN.id } }),
      })
    );
  });
});

describe("GET /api/notifications — Caso D: rol autorizado (OPERATOR+)", () => {
  it("CITIZEN (sin privilegio): mismo nivel redactado que anónimo", async () => {
    getCurrentUserMock.mockResolvedValue(CITIZEN as never);
    const response = await notificationsGet(getRequest("/api/notifications", "203.0.113.71"));
    const body = await response.json();
    assertNoLeak(body);
    expect(response.headers.get("Cache-Control")).not.toBe("private, no-store");
  });

  it("rol falso/inexistente en la sesión no obtiene detalle completo (se normaliza a PUBLIC)", async () => {
    getCurrentUserMock.mockResolvedValue(FORGED_ROLE as never);
    const response = await notificationsGet(getRequest("/api/notifications", "203.0.113.72"));
    const body = await response.json();
    assertNoLeak(body);
  });

  it("OPERATOR: detalle completo permitido, cache privada/no-store", async () => {
    getCurrentUserMock.mockResolvedValue(OPERATOR as never);
    const response = await notificationsGet(getRequest("/api/notifications", "203.0.113.73"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("ADMIN: detalle completo permitido igual que OPERATOR", async () => {
    getCurrentUserMock.mockResolvedValue(ADMIN as never);
    const response = await notificationsGet(getRequest("/api/notifications", "203.0.113.74"));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});

describe("GET /api/notifications — Caso E: payload malformado", () => {
  it("parámetros no numéricos/fuera de rango no rompen el endpoint (200, valores acotados a los defaults)", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    const response = await notificationsGet(
      getRequest("/api/notifications?limit=not-a-number&lat=abc&lng=xyz&radiusKm=not-a-number", "203.0.113.75")
    );
    expect(response.status).toBe(200);
  });

  it("query params de rol falso (?role=OPERATOR, ?admin=true) no tienen ningún efecto: el guard nunca lee la URL", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    const response = await notificationsGet(
      getRequest("/api/notifications?role=OPERATOR&admin=true&full=true", "203.0.113.76")
    );
    const body = await response.json();
    assertNoLeak(body);
    expect(response.headers.get("Cache-Control")).not.toBe("private, no-store");
  });
});

describe("GET /api/notifications — rate limiting de lectura pública (§16)", () => {
  it("anónimo excede la cuota (60/60s) y recibe 429; operador desde la misma IP no es afectado", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    const ip = "203.0.113.80";
    for (let i = 0; i < 60; i += 1) {
      const response = await notificationsGet(getRequest("/api/notifications", ip));
      expect(response.status).toBe(200);
    }
    const blocked = await notificationsGet(getRequest("/api/notifications", ip));
    expect(blocked.status).toBe(429);

    getCurrentUserMock.mockResolvedValue(OPERATOR as never);
    const operatorResponse = await notificationsGet(getRequest("/api/notifications", ip));
    expect(operatorResponse.status).toBe(200);
  });
});

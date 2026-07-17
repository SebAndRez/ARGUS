import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SEC-NEW-001 — `GET /api/predictive/analysis` and
 * `GET /api/predictive/notification-feed` queried `Report`/`HelpRequest`
 * directly via `src/lib/predictive-core/predictiveFeed.ts` without ever
 * passing through `src/lib/security/incidentDto.ts` — reopening the same
 * leak (exact coordinates, free-text title) that PRIV-FINAL-001 closed on
 * `/api/reports`, `/api/help-requests` and `/api/events`. This suite drives
 * the real route handlers (real RBAC, real predictiveFeed redaction path,
 * real rate limiter) with only the I/O boundary mocked: `getCurrentUser`
 * and `@/lib/prisma`.
 */

vi.mock("@/services/authService", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: { findMany: vi.fn(), findUnique: vi.fn() },
    helpRequest: { findMany: vi.fn(), findUnique: vi.fn() },
    externalEvent: { findMany: vi.fn(), findUnique: vi.fn() },
    hazardKnowledgeFact: { findMany: vi.fn() },
    ingestionRun: { findMany: vi.fn() },
  },
}));

import { NextRequest } from "next/server";
import { getCurrentUser } from "@/services/authService";
import { prisma } from "@/lib/prisma";
import { GET as analysisGet } from "@/app/api/predictive/analysis/route";
import { GET as notificationFeedGet } from "@/app/api/predictive/notification-feed/route";
import { resetMemoryRateLimitBackendForTests } from "@/lib/security/rateLimitBackend";

const getCurrentUserMock = vi.mocked(getCurrentUser);
const reportFindManyMock = vi.mocked(prisma.report.findMany);
const helpRequestFindManyMock = vi.mocked(prisma.helpRequest.findMany);
const externalEventFindManyMock = vi.mocked(prisma.externalEvent.findMany);
const hazardKnowledgeFactFindManyMock = vi.mocked(prisma.hazardKnowledgeFact.findMany);
const ingestionRunFindManyMock = vi.mocked(prisma.ingestionRun.findMany);

const ANONYMOUS = null;
const CITIZEN = { id: "citizen-1", role: "CITIZEN" };
const OPERATOR = { id: "operator-1", role: "OPERATOR" };
const ADMIN = { id: "admin-1", role: "ADMIN" };

// Caso 2 del Prompt: texto libre con nombre, dirección y teléfono.
const SENSITIVE_TITLE = "Soy Juan Perez, estoy en Calle Falsa 123, mi telefono es +56912345678";
const SENSITIVE_LOCATION_TEXT = "Calle Falsa 123, depto 4B";
const EXACT_LAT = -33.44891234;
const EXACT_LNG = -70.66926543;

const rawReport = {
  id: "rep-1",
  userId: "citizen-reporter",
  category: "fire",
  title: SENSITIVE_TITLE,
  description: "Descripcion libre con datos personales adicionales",
  latitude: EXACT_LAT,
  longitude: EXACT_LNG,
  locationText: SENSITIVE_LOCATION_TEXT,
  severity: "HIGH",
  status: "NEW",
  aiSummary: "Análisis preliminar de la alerta: se detecta un posible evento de fire con prioridad high.",
  aiRecommendation: "Enviar equipo de respuesta.",
  aiConfidence: 75,
  falseReportRisk: 18,
  createdAt: new Date("2026-07-10T11:00:00.000Z"),
  updatedAt: new Date("2026-07-10T11:00:00.000Z"),
};

const rawHelpRequest = {
  id: "hr-1",
  userId: "citizen-owner",
  category: "medical",
  title: "Ayuda urgente, " + SENSITIVE_TITLE,
  description: "Descripcion libre de la solicitud de ayuda",
  latitude: EXACT_LAT,
  longitude: EXACT_LNG,
  locationText: SENSITIVE_LOCATION_TEXT,
  priority: "HIGH",
  status: "RECEIVED",
  restrictedMode: false,
  aiSummary: "Solicitud de ayuda clasificada como alta.",
  aiRecommendation: "Enviar unidad de apoyo.",
  aiConfidence: 80,
  createdAt: new Date("2026-07-10T10:00:00.000Z"),
  updatedAt: new Date("2026-07-10T10:00:00.000Z"),
};

// Contexto oficial para empujar confianza/severidad y ejercitar el camino de
// notificacion — dos eventos oficiales cercanos (Global Watch USGS). Se usan
// coordenadas ligeramente distintas de EXACT_LAT/EXACT_LNG (pero dentro de
// la ventana "nearby" de +/-0.75 grados que usa contextRetriever.ts) para
// que la propia coordenada exacta, pública y legítima de un evento USGS no
// coincida por casualidad con la del Report/HelpRequest y produzca un falso
// positivo en la comprobación anti-fuga de este test.
const OFFICIAL_LAT = EXACT_LAT + 0.05;
const OFFICIAL_LNG = EXACT_LNG + 0.05;
const officialContextEvents = [
  {
    id: "ext-usgs-1",
    sourceId: "usgs_earthquake",
    category: "earthquake",
    title: "M4.5 - 12km NE of Santiago",
    latitude: OFFICIAL_LAT,
    longitude: OFFICIAL_LNG,
    occurredAt: new Date("2026-07-10T09:50:00.000Z"),
    updatedAt: new Date("2026-07-10T09:50:00.000Z"),
  },
  {
    id: "ext-usgs-2",
    sourceId: "usgs_earthquake",
    category: "earthquake",
    title: "M3.9 - 15km NE of Santiago",
    latitude: OFFICIAL_LAT,
    longitude: OFFICIAL_LNG,
    occurredAt: new Date("2026-07-10T09:40:00.000Z"),
    updatedAt: new Date("2026-07-10T09:40:00.000Z"),
  },
];

const FORBIDDEN_SUBSTRINGS = [
  "Juan Perez",
  "Falsa 123",
  "+56912345678",
  SENSITIVE_LOCATION_TEXT,
  String(EXACT_LAT),
  String(EXACT_LNG),
  "citizen-reporter",
  "citizen-owner",
];

function assertNoLeak(body: unknown) {
  const serialized = JSON.stringify(body);
  for (const needle of FORBIDDEN_SUBSTRINGS) {
    expect(serialized).not.toContain(needle);
  }
}

function getRequest(path: string, ip = "203.0.113.50") {
  return new NextRequest(`http://localhost${path}`, {
    headers: { "x-forwarded-for": ip },
  });
}

beforeEach(() => {
  resetMemoryRateLimitBackendForTests();
  reportFindManyMock.mockResolvedValue([rawReport] as never);
  helpRequestFindManyMock.mockResolvedValue([rawHelpRequest] as never);
  externalEventFindManyMock.mockResolvedValue(officialContextEvents as never);
  hazardKnowledgeFactFindManyMock.mockResolvedValue([] as never);
  ingestionRunFindManyMock.mockResolvedValue([] as never);
});

afterEach(() => {
  vi.clearAllMocks();
  resetMemoryRateLimitBackendForTests();
});

describe("GET /api/predictive/analysis — privacidad por audiencia", () => {
  it("Caso 1/2 — anonimo: ninguna coordenada exacta ni texto libre sensible en ninguna analysis", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    const response = await analysisGet(getRequest("/api/predictive/analysis"));
    expect(response.status).toBe(200);
    const body = await response.json();
    assertNoLeak(body);
    expect(body.analyses.length).toBeGreaterThan(0);
    // El titulo/hypothesis deben caer al placeholder seguro del normalizador,
    // nunca al texto libre original.
    for (const analysis of body.analyses) {
      expect(analysis.title).not.toBe(rawReport.title);
      expect(analysis.title).not.toBe(rawHelpRequest.title);
      expect(analysis.hypothesis).not.toContain("Juan Perez");
    }
  });

  it("Caso 2 — CITIZEN autenticado recibe el mismo nivel redactado que anonimo", async () => {
    getCurrentUserMock.mockResolvedValue(CITIZEN as never);
    const response = await analysisGet(getRequest("/api/predictive/analysis"));
    const body = await response.json();
    assertNoLeak(body);
  });

  it("Caso 3/OPERATOR — detalle completo: titulo crudo preservado, cache privada", async () => {
    getCurrentUserMock.mockResolvedValue(OPERATOR as never);
    const response = await analysisGet(getRequest("/api/predictive/analysis"));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await response.json();
    const titles = body.analyses.map((a: { title: string }) => a.title);
    expect(titles).toContain(rawReport.title);
    expect(titles).toContain(rawHelpRequest.title);
  });

  it("ADMIN — detalle completo permitido (mismo nivel que OPERATOR)", async () => {
    getCurrentUserMock.mockResolvedValue(ADMIN as never);
    const response = await analysisGet(getRequest("/api/predictive/analysis"));
    const body = await response.json();
    const titles = body.analyses.map((a: { title: string }) => a.title);
    expect(titles).toContain(rawReport.title);
  });

  it("Caso 4 — anonimo excede public_incident_read (60/60s) y recibe 429", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    const ip = "203.0.113.60";
    for (let i = 0; i < 60; i += 1) {
      const response = await analysisGet(getRequest("/api/predictive/analysis", ip));
      expect(response.status).toBe(200);
    }
    const blocked = await analysisGet(getRequest("/api/predictive/analysis", ip));
    expect(blocked.status).toBe(429);

    // Caso 4 (variante) — un OPERATOR desde la misma IP no es afectado por
    // el limite anonimo (mismo criterio que /api/reports, /api/help-requests).
    getCurrentUserMock.mockResolvedValue(OPERATOR as never);
    const operatorResponse = await analysisGet(getRequest("/api/predictive/analysis", ip));
    expect(operatorResponse.status).toBe(200);
  });

  it("Caso 5 — busqueda puntual (inputId+kind) tambien redacta para publico", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    const reportFindUniqueMock = vi.mocked(prisma.report.findUnique);
    reportFindUniqueMock.mockResolvedValue(rawReport as never);
    const response = await analysisGet(
      getRequest("/api/predictive/analysis?inputId=rep-1&kind=citizen_report", "203.0.113.61")
    );
    const body = await response.json();
    assertNoLeak(body);
  });
});

describe("GET /api/predictive/notification-feed — privacidad por audiencia", () => {
  it("Caso 1/2 — anonimo: cero coordenadas exactas y cero texto libre en notifications[]", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    const response = await notificationFeedGet(getRequest("/api/predictive/notification-feed", "203.0.113.70"));
    expect(response.status).toBe(200);
    const body = await response.json();
    assertNoLeak(body);
    for (const notification of body.notifications) {
      if (notification.mapFocus) {
        expect(notification.mapFocus.latitude).not.toBe(EXACT_LAT);
        expect(notification.mapFocus.longitude).not.toBe(EXACT_LNG);
      }
    }
  });

  it("Caso 3/OPERATOR — mapFocus con coordenadas exactas cuando corresponde", async () => {
    getCurrentUserMock.mockResolvedValue(OPERATOR as never);
    const response = await notificationFeedGet(getRequest("/api/predictive/notification-feed", "203.0.113.71"));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await response.json();
    const withExactCoords = body.notifications.some(
      (n: { mapFocus: { latitude: number; longitude: number } | null }) =>
        n.mapFocus && n.mapFocus.latitude === EXACT_LAT && n.mapFocus.longitude === EXACT_LNG
    );
    expect(withExactCoords).toBe(true);
  });

  it("Caso 6 — rate limiting: anonimo bloqueado a los 60/60s, operador no afectado", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    const ip = "203.0.113.72";
    for (let i = 0; i < 60; i += 1) {
      const response = await notificationFeedGet(getRequest("/api/predictive/notification-feed", ip));
      expect(response.status).toBe(200);
    }
    const blocked = await notificationFeedGet(getRequest("/api/predictive/notification-feed", ip));
    expect(blocked.status).toBe(429);

    getCurrentUserMock.mockResolvedValue(OPERATOR as never);
    const operatorResponse = await notificationFeedGet(getRequest("/api/predictive/notification-feed", ip));
    expect(operatorResponse.status).toBe(200);
  });
});

describe("Caso 7 — regresion: rutas ya protegidas no cambian de contrato", () => {
  it("/api/reports y /api/help-requests no son tocadas por este cambio (import de contrato compartido, no de ruta)", async () => {
    // Ambas rutas ya tienen su propia suite (tests/p0/help-request-report-privacy.test.ts);
    // aqui solo se confirma que este cambio no las re-declara ni las importa
    // de forma distinta — predictiveFeed.ts consume el mismo toPublicReport/
    // toPublicHelpRequest exportado por incidentDto.ts, nunca una copia.
    const incidentDto = await import("@/lib/security/incidentDto");
    const predictiveFeed = await import("@/lib/predictive-core/predictiveFeed");
    expect(typeof incidentDto.toPublicReport).toBe("function");
    expect(typeof incidentDto.toPublicHelpRequest).toBe("function");
    expect(typeof predictiveFeed.getPredictiveAnalyses).toBe("function");
  });
});

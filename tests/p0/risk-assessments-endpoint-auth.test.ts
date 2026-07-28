import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SEC-GAP-01 fix — `GET /api/risk-assessments` had no session/role check at
 * all. Its `reportId` fallback path (`createCitizenReportAssessment`) baked
 * the citizen's raw, free-text `Report.title` directly into the response
 * title for any caller — the exact field `incidentDto.ts` already redacts
 * for every other public route ("pueden contener direcciones o nombres").
 * This suite drives the real route handler with only the I/O boundary
 * mocked, proving: anonymous/non-operator callers get a redacted title,
 * OPERATOR+ get the real one, and public reads are rate-limited like every
 * sibling endpoint (PRIV-FINAL-001 §16).
 */

vi.mock("@/services/authService", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    riskAssessment: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
    riskAssessmentRevision: { create: vi.fn() },
    report: { findUnique: vi.fn() },
    externalEvent: { findMany: vi.fn(), findFirst: vi.fn() },
    hazardKnowledgeFact: { findMany: vi.fn() },
    hazardKnowledgeDocument: { findMany: vi.fn() },
  },
}));

import { NextRequest } from "next/server";
import { getCurrentUser } from "@/services/authService";
import { prisma } from "@/lib/prisma";
import { GET as riskAssessmentsGet } from "@/app/api/risk-assessments/route";
import { resetMemoryRateLimitBackendForTests } from "@/lib/security/rateLimitBackend";

const getCurrentUserMock = vi.mocked(getCurrentUser);
const riskAssessmentFindManyMock = vi.mocked(prisma.riskAssessment.findMany);
const reportFindUniqueMock = vi.mocked(prisma.report.findUnique);
const externalEventFindManyMock = vi.mocked(prisma.externalEvent.findMany);
const externalEventFindFirstMock = vi.mocked(prisma.externalEvent.findFirst);
const hazardFactFindManyMock = vi.mocked(prisma.hazardKnowledgeFact.findMany);
const hazardDocumentFindManyMock = vi.mocked(prisma.hazardKnowledgeDocument.findMany);

const ANONYMOUS = null;
const CITIZEN = { id: "citizen-1", role: "CITIZEN" };
const OPERATOR = { id: "operator-1", role: "OPERATOR" };
const ADMIN = { id: "admin-1", role: "ADMIN" };
const FORGED_ROLE = { id: "forged-1", role: "SUPER_DUPER_ADMIN" };

const rawReport = {
  id: "rep-1",
  title: "Incendio junto a mi casa en Av. Siempre Viva 742",
  category: "fire",
  severity: "HIGH",
  createdAt: new Date("2026-07-10T11:00:00.000Z"),
  updatedAt: new Date("2026-07-10T11:00:00.000Z"),
};

function getRequest(path: string, ip = "203.0.113.90") {
  return new NextRequest(`http://localhost${path}`, { headers: { "x-forwarded-for": ip } });
}

beforeEach(() => {
  resetMemoryRateLimitBackendForTests();
  riskAssessmentFindManyMock.mockResolvedValue([] as never);
  reportFindUniqueMock.mockResolvedValue(rawReport as never);
  externalEventFindManyMock.mockResolvedValue([] as never);
  externalEventFindFirstMock.mockResolvedValue(null as never);
  hazardFactFindManyMock.mockResolvedValue([] as never);
  hazardDocumentFindManyMock.mockResolvedValue([] as never);
});

afterEach(() => {
  vi.clearAllMocks();
  resetMemoryRateLimitBackendForTests();
});

describe("GET /api/risk-assessments?reportId=... — redacción del título por rol", () => {
  it("Caso A — anónimo: 200, título redactado (sin el texto libre del reporte)", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    const response = await riskAssessmentsGet(getRequest("/api/risk-assessments?reportId=rep-1"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.assessments[0].title).not.toContain(rawReport.title);
    expect(body.assessments[0].title).not.toContain("Siempre Viva 742");
  });

  it("CITIZEN (sin privilegio): mismo nivel redactado que anónimo", async () => {
    getCurrentUserMock.mockResolvedValue(CITIZEN as never);
    const response = await riskAssessmentsGet(getRequest("/api/risk-assessments?reportId=rep-1", "203.0.113.91"));
    const body = await response.json();
    expect(body.assessments[0].title).not.toContain(rawReport.title);
  });

  it("rol falso/inexistente en la sesión no obtiene el título completo (se normaliza a PUBLIC)", async () => {
    getCurrentUserMock.mockResolvedValue(FORGED_ROLE as never);
    const response = await riskAssessmentsGet(getRequest("/api/risk-assessments?reportId=rep-1", "203.0.113.92"));
    const body = await response.json();
    expect(body.assessments[0].title).not.toContain(rawReport.title);
  });

  it("Caso D — OPERATOR: recibe el título completo (real)", async () => {
    getCurrentUserMock.mockResolvedValue(OPERATOR as never);
    const response = await riskAssessmentsGet(getRequest("/api/risk-assessments?reportId=rep-1", "203.0.113.93"));
    const body = await response.json();
    expect(body.assessments[0].title).toContain(rawReport.title);
  });

  it("ADMIN: recibe el título completo igual que OPERATOR", async () => {
    getCurrentUserMock.mockResolvedValue(ADMIN as never);
    const response = await riskAssessmentsGet(getRequest("/api/risk-assessments?reportId=rep-1", "203.0.113.94"));
    const body = await response.json();
    expect(body.assessments[0].title).toContain(rawReport.title);
  });

  it("reportId inexistente: misma forma de respuesta (no revela si el reporte existe) y sigue redactado para anónimo", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    reportFindUniqueMock.mockResolvedValue(null as never);
    const response = await riskAssessmentsGet(getRequest("/api/risk-assessments?reportId=does-not-exist", "203.0.113.95"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.count).toBe(1);
    expect(body.assessments[0].title).not.toContain(rawReport.title);
  });

  it("la consulta a Report usa select explícito, nunca la fila completa", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    await riskAssessmentsGet(getRequest("/api/risk-assessments?reportId=rep-1", "203.0.113.96"));
    expect(reportFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ title: true, category: true, severity: true }),
      })
    );
  });
});

describe("GET /api/risk-assessments — payload malformado", () => {
  it("limit no numérico no rompe el endpoint (200, valor acotado al default)", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    const response = await riskAssessmentsGet(getRequest("/api/risk-assessments?limit=not-a-number", "203.0.113.97"));
    expect(response.status).toBe(200);
  });
});

describe("GET /api/risk-assessments — rate limiting de lectura pública (§16)", () => {
  it("anónimo excede la cuota (60/60s) y recibe 429; operador desde la misma IP no es afectado", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    const ip = "203.0.113.99";
    for (let i = 0; i < 60; i += 1) {
      const response = await riskAssessmentsGet(getRequest("/api/risk-assessments?reportId=rep-1", ip));
      expect(response.status).toBe(200);
    }
    const blocked = await riskAssessmentsGet(getRequest("/api/risk-assessments?reportId=rep-1", ip));
    expect(blocked.status).toBe(429);

    getCurrentUserMock.mockResolvedValue(OPERATOR as never);
    const operatorResponse = await riskAssessmentsGet(getRequest("/api/risk-assessments?reportId=rep-1", ip));
    expect(operatorResponse.status).toBe(200);
  });
});

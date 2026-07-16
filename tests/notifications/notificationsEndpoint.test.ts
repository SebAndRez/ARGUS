import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Prompt 11 §22 — integration test for `/api/notifications` itself, the one
 * true I/O boundary of the notification pipeline. Mocks only the actual
 * I/O: Prisma, `getCurrentUser`, the predictive core, and the USGS live
 * fetch helper (global `fetch` is blocked entirely by tests/setup.ts). The
 * real route handler, the real `notificationCenterEngine.ts` classification
 * logic and the real `demoDataGuard.ts` guard all run unmocked.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: { findMany: vi.fn() },
    helpRequest: { findMany: vi.fn() },
    externalEvent: { findMany: vi.fn(), groupBy: vi.fn() },
    ingestionRun: { findMany: vi.fn() },
    knowledgeIncident: { findMany: vi.fn() },
    preparednessReminder: { findMany: vi.fn() },
  },
}));

vi.mock("@/services/authService", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/predictive-core/predictiveFeed", () => ({
  getPredictiveNotificationPackets: vi.fn(),
}));

vi.mock("@/lib/ingestion/ingestUsgsEarthquakes", () => ({
  getOrFetchUsgsEarthquakes: vi.fn(),
}));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/services/authService";
import { getPredictiveNotificationPackets } from "@/lib/predictive-core/predictiveFeed";
import { getOrFetchUsgsEarthquakes } from "@/lib/ingestion/ingestUsgsEarthquakes";
import { GET as notificationsGet } from "@/app/api/notifications/route";

const reportFindManyMock = vi.mocked(prisma.report.findMany);
const helpRequestFindManyMock = vi.mocked(prisma.helpRequest.findMany);
const externalEventFindManyMock = vi.mocked(prisma.externalEvent.findMany);
const externalEventGroupByMock = vi.mocked(prisma.externalEvent.groupBy);
const ingestionRunFindManyMock = vi.mocked(prisma.ingestionRun.findMany);
const knowledgeIncidentFindManyMock = vi.mocked(prisma.knowledgeIncident.findMany);
const preparednessReminderFindManyMock = vi.mocked(prisma.preparednessReminder.findMany);
const getCurrentUserMock = vi.mocked(getCurrentUser);
const getPredictiveNotificationPacketsMock = vi.mocked(getPredictiveNotificationPackets);
const getOrFetchUsgsEarthquakesMock = vi.mocked(getOrFetchUsgsEarthquakes);

function knowledgeIncidentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "ki-1",
    externalId: "senapred-1",
    title: "Alerta roja incendio forestal",
    summary: "SENAPRED declara alerta roja.",
    domain: "wildfire",
    subtype: null,
    severity: "critical",
    confidenceScore: 90,
    sourceId: "senapred_eventos",
    sourceName: "SENAPRED Chile",
    country: "CL",
    region: "Valparaiso",
    locality: null,
    latitude: -33.05,
    longitude: -71.62,
    occurredAt: new Date("2026-07-14T10:00:00.000Z"),
    detectedAt: new Date("2026-07-14T10:02:00.000Z"),
    createdAt: new Date("2026-07-14T10:02:30.000Z"),
    updatedAt: new Date("2026-07-14T10:05:00.000Z"),
    tagsJson: [],
    technicalFactorsJson: { lifecycle: "active" },
    impactJson: null,
    casualtiesJson: null,
    ...overrides,
  };
}

beforeEach(() => {
  reportFindManyMock.mockResolvedValue([]);
  helpRequestFindManyMock.mockResolvedValue([]);
  externalEventFindManyMock.mockResolvedValue([]);
  externalEventGroupByMock.mockResolvedValue([]);
  ingestionRunFindManyMock.mockResolvedValue([]);
  knowledgeIncidentFindManyMock.mockResolvedValue([]);
  preparednessReminderFindManyMock.mockResolvedValue([]);
  getCurrentUserMock.mockResolvedValue(null);
  getPredictiveNotificationPacketsMock.mockResolvedValue([]);
  getOrFetchUsgsEarthquakesMock.mockResolvedValue({ error: "blocked in tests" } as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("/api/notifications — Prompt 11 taxonomy end to end", () => {
  it("serializa category/verificationStatus/isOfficial en cada notificacion, sin requerir inferencia del cliente", async () => {
    knowledgeIncidentFindManyMock.mockResolvedValue([knowledgeIncidentRow()] as never);

    const response = await notificationsGet(new NextRequest("http://localhost/api/notifications"));
    const body = await response.json();

    expect(body.notifications.length).toBeGreaterThan(0);
    const senapred = body.notifications.find((n: { id: string }) => n.id === "knowledge-incident-ki-1");
    expect(senapred).toBeDefined();
    expect(senapred.category).toBe("official_alert");
    expect(senapred.verificationStatus).toBe("official");
    expect(senapred.isOfficial).toBe(true);
  });

  it("summary.byCategory refleja la clasificacion canonica y no depende de un segundo calculo", async () => {
    knowledgeIncidentFindManyMock.mockResolvedValue([knowledgeIncidentRow()] as never);

    const response = await notificationsGet(new NextRequest("http://localhost/api/notifications"));
    const body = await response.json();

    expect(body.summary.byCategory.official_alert).toBeGreaterThanOrEqual(1);
    expect(Object.keys(body.summary.byCategory)).toContain("prediction");
  });

  it("una prediccion critica no incrementa summary.critical (Prompt 11 §13)", async () => {
    getPredictiveNotificationPacketsMock.mockResolvedValue([
      {
        analysis: {
          id: "analysis-1",
          inputId: "input-1",
          title: "Escenario predictivo de inundacion",
          publicMessage: "Modelo ARGUS proyecta inundacion en las proximas 6h.",
          status: "pending_review",
          confidence: 82,
          primaryMode: "external_event",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        notification: { severity: "P0_CRITICAL", title: "Prediccion critica", body: "..." },
        mapFocus: null,
        fenixSeed: null,
      },
    ] as never);

    // Predictions are always `scope: "GLOBAL"` — the endpoint only surfaces
    // GLOBAL-scope items when `includeGlobal=true` (same as the real client).
    const response = await notificationsGet(
      new NextRequest("http://localhost/api/notifications?includeGlobal=true")
    );
    const body = await response.json();

    const prediction = body.notifications.find((n: { id: string }) => n.id.startsWith("predictive-"));
    expect(prediction).toBeDefined();
    expect(prediction.severity).toBe("P0_CRITICAL");
    expect(prediction.category).toBe("prediction");
    expect(prediction.isOfficial).toBe(false);
    expect(body.summary.critical).toBe(0);
  });

  it("un incidente confirmado oficial critico y vigente SI incrementa summary.critical", async () => {
    knowledgeIncidentFindManyMock.mockResolvedValue([knowledgeIncidentRow()] as never);

    const response = await notificationsGet(new NextRequest("http://localhost/api/notifications"));
    const body = await response.json();

    expect(body.summary.critical).toBeGreaterThanOrEqual(1);
  });

  it("un incidente oficial critico ya resuelto no cuenta en summary.critical", async () => {
    knowledgeIncidentFindManyMock.mockResolvedValue([
      knowledgeIncidentRow({ id: "ki-resolved", technicalFactorsJson: { lifecycle: "resolved" } }),
    ] as never);

    const response = await notificationsGet(new NextRequest("http://localhost/api/notifications"));
    const body = await response.json();

    const resolved = body.notifications.find((n: { id: string }) => n.id === "knowledge-incident-ki-resolved");
    expect(resolved.status).toBe("RESOLVED");
    expect(body.summary.critical).toBe(0);
  });

  it("?category=official_alert filtra usando el campo canonico serializado, no un recomputo del cliente", async () => {
    knowledgeIncidentFindManyMock.mockResolvedValue([knowledgeIncidentRow()] as never);
    reportFindManyMock.mockResolvedValue([
      {
        id: "report-1",
        title: "Reporte ciudadano",
        category: "Incendio",
        description: "Humo visible",
        latitude: -33.4,
        longitude: -70.6,
        severity: "MEDIUM",
        status: "NEW",
        createdAt: new Date(),
        updatedAt: new Date(),
        aiSummary: null,
        aiRecommendation: null,
        aiConfidence: 50,
        falseReportRisk: 10,
      },
    ] as never);

    const response = await notificationsGet(
      new NextRequest("http://localhost/api/notifications?category=official_alert")
    );
    const body = await response.json();

    expect(body.notifications.length).toBeGreaterThan(0);
    body.notifications.forEach((n: { category: string }) => expect(n.category).toBe("official_alert"));
  });

  it("produccion sin autorizacion demo: un item demo nunca llega serializado como official_alert", async () => {
    // `withEnv` restores env synchronously right after invoking its callback,
    // so it can't wrap an async request/response cycle — set/restore
    // directly around the awaited call instead.
    const prevVercelEnv = process.env.VERCEL_ENV;
    const prevAllowDemo = process.env.ARGUS_ALLOW_DEMO_DATA;
    process.env.VERCEL_ENV = "production";
    delete process.env.ARGUS_ALLOW_DEMO_DATA;
    try {
      // No persisted data at all -> demo fallback would normally kick in,
      // but must be fail-closed in production without explicit opt-in.
      const response = await notificationsGet(new NextRequest("http://localhost/api/notifications"));
      const body = await response.json();
      expect(body.notifications.some((n: { isDemo?: boolean }) => n.isDemo === true)).toBe(false);
    } finally {
      if (prevVercelEnv === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = prevVercelEnv;
      if (prevAllowDemo === undefined) delete process.env.ARGUS_ALLOW_DEMO_DATA;
      else process.env.ARGUS_ALLOW_DEMO_DATA = prevAllowDemo;
    }
  });
});

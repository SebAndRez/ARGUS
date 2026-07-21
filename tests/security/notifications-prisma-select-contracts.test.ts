import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Prueba de contrato para los 3 `select` Prisma agregados en la auditoria
 * Fase 2B a `/api/notifications` (regresion: antes `criticalPoiOperationalStatus.findMany`
 * usaba `include: { poi: true }`, trayendo el modelo completo — incluidas
 * operatorName/contactPhone/contactNotes — a memoria). Estas pruebas
 * inspeccionan el objeto exacto pasado a cada mock de Prisma, no solo el
 * resultado final mapeado: un `.map()` posterior que oculte campos no
 * demuestra que la consulta misma no los trajo.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: { findMany: vi.fn() },
    helpRequest: { findMany: vi.fn() },
    externalEvent: { findMany: vi.fn(), groupBy: vi.fn() },
    ingestionRun: { findMany: vi.fn() },
    knowledgeIncident: { findMany: vi.fn() },
    preparednessReminder: { findMany: vi.fn() },
    criticalPoiOperationalStatus: { findMany: vi.fn() },
    telecomConnectivityStatus: { findMany: vi.fn() },
    telecomConnectivityEvidence: { findFirst: vi.fn(), findMany: vi.fn() },
    criticalPoi: { findUnique: vi.fn() },
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

vi.mock("@/lib/connectivity/telecomConnectivityService", () => ({
  buildRegionKey: vi.fn(() => "CL-RM"),
  computeConnectivityStaleness: vi.fn(() => false),
}));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/services/authService";
import { getPredictiveNotificationPackets } from "@/lib/predictive-core/predictiveFeed";
import { getOrFetchUsgsEarthquakes } from "@/lib/ingestion/ingestUsgsEarthquakes";
import { GET as notificationsGet } from "@/app/api/notifications/route";

const criticalPoiOperationalStatusFindManyMock = vi.mocked(prisma.criticalPoiOperationalStatus.findMany);
const telecomConnectivityStatusFindManyMock = vi.mocked(prisma.telecomConnectivityStatus.findMany);
const telecomConnectivityEvidenceFindFirstMock = vi.mocked(prisma.telecomConnectivityEvidence.findFirst);
const telecomConnectivityEvidenceFindManyMock = vi.mocked(prisma.telecomConnectivityEvidence.findMany);

function baseRequest() {
  return new NextRequest("http://localhost/api/notifications");
}

beforeEach(() => {
  vi.mocked(prisma.report.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.helpRequest.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.externalEvent.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.externalEvent.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.ingestionRun.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.knowledgeIncident.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.preparednessReminder.findMany).mockResolvedValue([] as never);
  criticalPoiOperationalStatusFindManyMock.mockResolvedValue([]);
  telecomConnectivityStatusFindManyMock.mockResolvedValue([]);
  telecomConnectivityEvidenceFindFirstMock.mockResolvedValue(null);
  telecomConnectivityEvidenceFindManyMock.mockResolvedValue([]);
  vi.mocked(getCurrentUser).mockResolvedValue(null as never);
  vi.mocked(getPredictiveNotificationPackets).mockResolvedValue([] as never);
  vi.mocked(getOrFetchUsgsEarthquakes).mockResolvedValue({ error: "blocked in tests" } as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

const SENSITIVE_SHELTER_FIELDS = ["operatorName", "contactPhone", "contactNotes"];

describe("select Prisma contracts en /api/notifications", () => {
  it("criticalPoiOperationalStatus.findMany: select explicito, sin include, sin campos sensibles", async () => {
    const response = await notificationsGet(baseRequest());
    expect(response.status).toBe(200);
    expect(criticalPoiOperationalStatusFindManyMock).toHaveBeenCalledTimes(1);

    const args = criticalPoiOperationalStatusFindManyMock.mock.calls[0][0] as {
      select?: Record<string, unknown>;
      include?: unknown;
    };
    expect(args.include).toBeUndefined();
    expect(args.select).toEqual({
      poiId: true,
      shelterStatus: true,
      routeStatus: true,
      isStale: true,
      sourceType: true,
      sourceName: true,
      confidence: true,
      lastUpdatedAt: true,
      poi: {
        select: {
          category: true,
          name: true,
          latitude: true,
          longitude: true,
          countryCode: true,
        },
      },
    });
    const selectKeys = JSON.stringify(args.select);
    for (const field of SENSITIVE_SHELTER_FIELDS) {
      expect(selectKeys).not.toContain(field);
    }
  });

  it("telecomConnectivityEvidence.findFirst: select exacto { eventType: true }, sin payloadJson", async () => {
    telecomConnectivityStatusFindManyMock.mockResolvedValue([
      {
        regionKey: "CL-RM",
        isStale: false,
        lastUpdatedAt: new Date(),
        roamingType: "national",
        networkState: "normal",
        adminLevel1: "Metropolitana",
        adminLevel2: null,
        centroidLatitude: -33.45,
        centroidLongitude: -70.66,
        countryCode: "CL",
      },
    ] as never);

    const response = await notificationsGet(baseRequest());
    expect(response.status).toBe(200);
    expect(telecomConnectivityEvidenceFindFirstMock).toHaveBeenCalledTimes(1);

    const args = telecomConnectivityEvidenceFindFirstMock.mock.calls[0][0] as { select?: Record<string, unknown> };
    expect(args.select).toEqual({ eventType: true });
    expect(args.select).not.toHaveProperty("payloadJson");
  });

  it("telecomConnectivityEvidence.findMany (recentPointEvidence): select exacto, sin payloadJson", async () => {
    const response = await notificationsGet(baseRequest());
    expect(response.status).toBe(200);
    expect(telecomConnectivityEvidenceFindManyMock).toHaveBeenCalledTimes(1);

    const args = telecomConnectivityEvidenceFindManyMock.mock.calls[0][0] as { select?: Record<string, unknown> };
    expect(args.select).toEqual({
      poiId: true,
      sourceType: true,
      sourceName: true,
      confidenceScore: true,
      createdAt: true,
    });
    expect(args.select).not.toHaveProperty("payloadJson");
  });
});

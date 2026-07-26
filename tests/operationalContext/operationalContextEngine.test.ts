import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fase 1-8 + Fase 11 — orquestador de punta a punta. Mockea solo el límite
 * real de I/O (`getCriticalPoisNear`, respaldado por Prisma) — el resto
 * (trigger, matrix, impact area resolver contra los GeoJSON reales, scoring,
 * estado, activación de capas, cache) corre sin mockear, igual que
 * `notificationsEndpoint.test.ts` mockea solo Prisma y no la lógica del
 * engine.
 */
vi.mock("@/lib/criticalPoi/criticalPoiPersistenceService", () => ({
  getCriticalPoisNear: vi.fn(),
}));

import { getCriticalPoisNear } from "@/lib/criticalPoi/criticalPoiPersistenceService";
import { clearOperationalContextCache } from "@/lib/operationalContext/operationalContextCache";
import { resolveOperationalContextPackage } from "@/lib/operationalContext/operationalContextEngine";
import type { ModuleIncidentSummary } from "@/types/moduleOperationalContext";

const getCriticalPoisNearMock = vi.mocked(getCriticalPoisNear);

function summary(overrides: Partial<ModuleIncidentSummary> = {}): ModuleIncidentSummary {
  return {
    id: "incident-1",
    type: "EARTHQUAKE",
    title: "Sismo de prueba",
    summary: null,
    severity: "high",
    lifecycle: "active",
    verificationStatus: "official",
    confidence: "high",
    location: {
      latitude: -39.2827,
      longitude: -72.2274,
      geometry: { type: "point", coordinates: [-39.2827, -72.2274] },
      countryCode: "CL",
      regionCode: null,
    },
    timing: { startedAt: null, updatedAt: "2026-07-20T00:00:00.000Z", expiresAt: null },
    sourceSummary: { primarySource: "USGS", sourceCount: 1, isOfficial: true },
    isDemo: false,
    ...overrides,
  };
}

describe("resolveOperationalContextPackage", () => {
  beforeEach(() => {
    clearOperationalContextCache();
    getCriticalPoisNearMock.mockReset();
    getCriticalPoisNearMock.mockResolvedValue([]);
  });

  it("does not activate for low-severity, non-official incidents", async () => {
    const result = await resolveOperationalContextPackage(
      summary({ severity: "low", sourceSummary: { primarySource: "OSM", sourceCount: 1, isOfficial: false } })
    );
    expect(result).toEqual({ activated: false, reason: "trigger_not_matched" });
    expect(getCriticalPoisNearMock).not.toHaveBeenCalled();
  });

  it("reports insufficient_location when the incident has no coordinates", async () => {
    const result = await resolveOperationalContextPackage(
      summary({ location: { latitude: null, longitude: null, geometry: { type: "point", coordinates: [0, 0] }, countryCode: "CL", regionCode: null } })
    );
    expect(result).toEqual({ activated: false, reason: "insufficient_location" });
  });

  it("activates and builds a full package for a high-severity earthquake with a known Chilean location", async () => {
    getCriticalPoisNearMock.mockResolvedValue([
      {
        id: "poi-hospital-1",
        source: "osm",
        name: "Hospital Villarrica",
        category: "hospital",
        priority: "P1",
        lat: -39.28,
        lng: -72.22,
        status: "active",
        confidence: 90,
        isPersistent: true,
        isVisibleByDefault: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const result = await resolveOperationalContextPackage(summary());

    expect(result.activated).toBe(true);
    if (!result.activated) throw new Error("expected activation");
    expect(result.contextPackage.threatProfileId).toBe("earthquake");
    expect(result.contextPackage.impactArea.commune).toBe("Villarrica");
    expect(result.contextPackage.cards.some((card) => card.category === "hospital")).toBe(true);
    expect(result.contextPackage.layerActivationPatch.medicalPoints).toBe(true);
    expect(result.contextPackage.responsePhase).toBe("active_response");
  });

  it("caches the resolved package and does not re-query CriticalPoi on an unchanged incident", async () => {
    const first = await resolveOperationalContextPackage(summary());
    const callsAfterFirst = getCriticalPoisNearMock.mock.calls.length;

    const second = await resolveOperationalContextPackage(summary());
    expect(getCriticalPoisNearMock.mock.calls.length).toBe(callsAfterFirst);
    expect(first).toEqual(second);
  });

  it("invalidates the cache when the incident actually changes (updatedAt fingerprint)", async () => {
    await resolveOperationalContextPackage(summary());
    const callsAfterFirst = getCriticalPoisNearMock.mock.calls.length;

    await resolveOperationalContextPackage(summary({ timing: { startedAt: null, updatedAt: "2026-07-21T00:00:00.000Z", expiresAt: null } }));
    expect(getCriticalPoisNearMock.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});

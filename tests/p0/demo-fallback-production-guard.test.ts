import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Closure audit (2026-09-21): module dashboards fell back to demo datasets on
 * the client whenever real data was empty — including in production. The
 * server now tells them (`demoFallbackAllowed` on /api/events) and the medical
 * points source is the real CriticalPoi catalogue; demo data is only served
 * where `isDemoDataAllowed()` is true. Only I/O boundaries are mocked.
 */

vi.mock("@/services/authService", () => ({ getCurrentUser: vi.fn(async () => null) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: { findMany: vi.fn(async () => []) },
    helpRequest: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock("@/lib/medical/realMedicalPoints", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/medical/realMedicalPoints")>();
  return { ...actual, getRealMedicalPointsNear: vi.fn() };
});

import { NextRequest } from "next/server";
import { GET as eventsGet } from "@/app/api/events/route";
import { GET as medicalPointsGet } from "@/app/api/medical-points/route";
import { GET as moduleIncidentsGet } from "@/app/api/modules/incidents/route";
import { getRealMedicalPointsNear } from "@/lib/medical/realMedicalPoints";
import { resetMemoryRateLimitBackendForTests } from "@/lib/security/rateLimitBackend";

const realPointsMock = vi.mocked(getRealMedicalPointsNear);

function production() {
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("ARGUS_ALLOW_DEMO_DATA", "");
}

beforeEach(() => {
  resetMemoryRateLimitBackendForTests();
  realPointsMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/events — demoFallbackAllowed", () => {
  it("is false in production (dashboards must not show demo data)", async () => {
    production();
    const body = await (await eventsGet(new NextRequest("http://localhost/api/events"))).json();
    expect(body.demoFallbackAllowed).toBe(false);
  });

  it("is true outside production", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const body = await (await eventsGet(new NextRequest("http://localhost/api/events"))).json();
    expect(body.demoFallbackAllowed).toBe(true);
  });
});

describe("GET /api/medical-points", () => {
  const request = (query = "?lat=-33.44&lng=-70.65") => new NextRequest(`http://localhost/api/medical-points${query}`);

  it("serves real CriticalPoi health facilities first", async () => {
    production();
    realPointsMock.mockResolvedValue([
      { id: "h1", name: "Hospital Real", type: "hospital", lat: -33.44, lng: -70.65, capabilities: ["Hospital"], availabilityStatus: "unknown", isDemo: false },
    ]);
    const body = await (await medicalPointsGet(request())).json();
    expect(body.source).toBe("critical_poi");
    expect(body.points[0].isDemo).toBe(false);
  });

  it("never serves the demo fixture in production, even with no real data", async () => {
    production();
    realPointsMock.mockResolvedValue([]);
    const body = await (await medicalPointsGet(request())).json();
    expect(body).toEqual({ source: "unavailable", count: 0, points: [] });
  });

  it("falls back to the labelled demo fixture only where demo data is allowed", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    realPointsMock.mockResolvedValue([]);
    const body = await (await medicalPointsGet(request())).json();
    expect(body.source).toBe("demo");
    expect(body.points.every((point: { isDemo: boolean }) => point.isDemo)).toBe(true);
  });
});

describe("GET /api/modules/incidents — module ids", () => {
  it.each(["argus-hermes", "argus-arca", "argus-aura"])("accepts %s as a list consumer (permission still resolved server-side)", async (moduleId) => {
    const response = await moduleIncidentsGet(new NextRequest(`http://localhost/api/modules/incidents?module=${moduleId}`));
    expect(response.status).not.toBe(400);
  });

  it("still rejects unknown modules", async () => {
    const response = await moduleIncidentsGet(new NextRequest("http://localhost/api/modules/incidents?module=argus-unknown"));
    expect(response.status).toBe(400);
  });
});

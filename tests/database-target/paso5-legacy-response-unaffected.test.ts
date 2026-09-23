import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * tests/database-target/paso5-legacy-response-unaffected.test.ts
 *
 * Drives the REAL route handlers (real RBAC, real DTO serializers, real
 * shadow-write and dual-read hooks) with only the I/O boundary mocked
 * (`@/lib/prisma`, `@/services/authService`), and proves the two statements
 * Paso 5 has to demonstrate at the request level:
 *
 *   * "legacy sigue respondiendo aunque target falle": with shadow-write and
 *     dual-read ON and NO usable target database, the response body and status
 *     are byte-identical to the flags-off response;
 *   * "shadow-write ON no puede afectar respuesta legacy" / "dual-read ON no
 *     cambia comportamiento del usuario": same bytes, same status, and the
 *     comparison result never appears in the payload.
 *
 * No target database is configured here on purpose — that IS the failure being
 * injected, and it is the state production is in today (all four flags off and
 * no TARGET_DATABASE_URL).
 */

vi.mock("@/services/authService", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    helpRequest: { findMany: vi.fn(), create: vi.fn() },
    report: { findMany: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

import { NextRequest } from "next/server";
import { getCurrentUser } from "@/services/authService";
import { prisma } from "@/lib/prisma";
import { GET as helpRequestsGet, POST as helpRequestsPost } from "@/app/api/help-requests/route";
import { resetMemoryRateLimitBackendForTests } from "@/lib/security/rateLimitBackend";
import { withEnv } from "../helpers/withEnv";

const getCurrentUserMock = vi.mocked(getCurrentUser);
const helpRequestFindManyMock = vi.mocked(prisma.helpRequest.findMany);
const helpRequestCreateMock = vi.mocked(prisma.helpRequest.create);
const auditCreateMock = vi.mocked(prisma.auditLog.create);

const OPERATOR = { id: "operator-1", role: "OPERATOR", accountStatus: "ACTIVE" };

const legacyRow = {
  id: "hr-1",
  userId: "citizen-owner",
  category: "medical",
  title: "Ayuda urgente",
  description: "Estoy en el segundo piso",
  latitude: -33.44891,
  longitude: -70.66932,
  locationText: "Calle Falsa 123",
  priority: "HIGH",
  status: "RECEIVED",
  restrictedMode: false,
  aiSummary: "resumen",
  aiRecommendation: "recomendacion",
  aiConfidence: 80,
  createdAt: new Date("2026-07-10T10:00:00.000Z"),
  updatedAt: new Date("2026-07-10T10:00:00.000Z"),
  user: { publicAlias: "Vecino-4821" },
};

/** Flags ON with no target database reachable — the hostile case. */
const SHADOW_AND_DUAL_READ_ON_TARGET_BROKEN = {
  ARGUS_TARGET_DB_SHADOW_WRITE_ENABLED: "true",
  ARGUS_TARGET_DB_DUAL_READ_ENABLED: "true",
  ARGUS_TARGET_DB_READ_ENABLED: "true",
  TARGET_DATABASE_URL: undefined,
};

const ALL_FLAGS_OFF = {
  ARGUS_TARGET_DB_SHADOW_WRITE_ENABLED: undefined,
  ARGUS_TARGET_DB_DUAL_READ_ENABLED: undefined,
  ARGUS_TARGET_DB_READ_ENABLED: undefined,
  TARGET_DATABASE_URL: undefined,
};

beforeEach(() => {
  resetMemoryRateLimitBackendForTests();
  getCurrentUserMock.mockResolvedValue(OPERATOR as never);
  helpRequestFindManyMock.mockResolvedValue([legacyRow] as never);
  helpRequestCreateMock.mockResolvedValue({ ...legacyRow, id: "hr-new" } as never);
  auditCreateMock.mockResolvedValue({ id: "audit-1" } as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

async function readGet(env: Record<string, string | undefined>) {
  return withEnv(env, async () => {
    const response = await helpRequestsGet(new NextRequest("http://localhost/api/help-requests"));
    return { status: response.status, body: await response.text() };
  });
}

async function createPost(env: Record<string, string | undefined>) {
  return withEnv(env, async () => {
    const response = await helpRequestsPost(
      new Request("http://localhost/api/help-requests", {
        method: "POST",
        body: JSON.stringify({
          category: "medical",
          title: "Ayuda urgente",
          description: "Estoy en el segundo piso",
          latitude: -33.44891,
          longitude: -70.66932,
        }),
      })
    );
    return { status: response.status, body: await response.text() };
  });
}

describe("GET /api/help-requests — dual-read never changes what the user gets", () => {
  it("returns the same status and bytes with dual-read ON and the target unreachable", async () => {
    const off = await readGet(ALL_FLAGS_OFF);
    const on = await readGet(SHADOW_AND_DUAL_READ_ON_TARGET_BROKEN);
    expect(on.status).toBe(off.status);
    expect(on.body).toBe(off.body);
  });

  it("never leaks a comparison result into the payload", async () => {
    const on = await readGet(SHADOW_AND_DUAL_READ_ON_TARGET_BROKEN);
    for (const marker of ["MISSING_TARGET", "VALUE_MISMATCH", "DEFERRED_EXPECTED", "dualRead", "mismatchedFields"]) {
      expect(on.body).not.toContain(marker);
    }
  });

  it("still serves the legacy rows the legacy database returned", async () => {
    const on = await readGet(SHADOW_AND_DUAL_READ_ON_TARGET_BROKEN);
    expect(JSON.parse(on.body).helpRequests).toHaveLength(1);
    expect(helpRequestFindManyMock).toHaveBeenCalled();
  });
});

describe("POST /api/help-requests — a failing shadow write cannot break the legacy write", () => {
  it("returns the same status and bytes with shadow-write ON and the target unreachable", async () => {
    const off = await createPost(ALL_FLAGS_OFF);
    const on = await createPost(SHADOW_AND_DUAL_READ_ON_TARGET_BROKEN);
    expect(off.status).toBe(200);
    expect(on.status).toBe(200);
    expect(on.body).toBe(off.body);
  });

  it("performs the legacy write exactly once per request, flags on or off", async () => {
    await createPost(ALL_FLAGS_OFF);
    expect(helpRequestCreateMock).toHaveBeenCalledTimes(1);
    vi.clearAllMocks();
    helpRequestCreateMock.mockResolvedValue({ ...legacyRow, id: "hr-new" } as never);
    auditCreateMock.mockResolvedValue({ id: "audit-1" } as never);
    getCurrentUserMock.mockResolvedValue(OPERATOR as never);
    await createPost(SHADOW_AND_DUAL_READ_ON_TARGET_BROKEN);
    expect(helpRequestCreateMock).toHaveBeenCalledTimes(1);
  });

  it("the audit event is still written (its own shadow write failing closed does not stop it)", async () => {
    await createPost(SHADOW_AND_DUAL_READ_ON_TARGET_BROKEN);
    expect(auditCreateMock).toHaveBeenCalledTimes(1);
  });
});

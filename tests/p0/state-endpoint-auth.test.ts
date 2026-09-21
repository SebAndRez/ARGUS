import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression suite for the closure-audit finding (2026-09-21): routes that
 * mutated shared state or queried Report/HelpRequest without any guard.
 *
 * - POST /api/predictive/run → operator-only; must not touch the DB for
 *   anonymous/citizen callers (it was an SOS-presence oracle).
 * - PATCH /api/mobile-safety/settings and /api/sensor-safety/settings →
 *   operator-only; the store is process-wide and shared by every visitor.
 *
 * Only the I/O boundary is mocked (session lookup and the predictive core),
 * so the real requireOperator()/hasAnyRole() logic runs.
 */

vi.mock("@/services/authService", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/predictive-core/predictiveFeed", () => ({
  runPredictiveFromBody: vi.fn(async () => ({ analysis: { id: "a1" } })),
}));

import { NextRequest } from "next/server";
import { getCurrentUser } from "@/services/authService";
import { runPredictiveFromBody } from "@/lib/predictive-core/predictiveFeed";
import { POST as predictiveRunPost } from "@/app/api/predictive/run/route";
import {
  GET as mobileSettingsGet,
  PATCH as mobileSettingsPatch,
} from "@/app/api/mobile-safety/settings/route";
import {
  GET as sensorSettingsGet,
  PATCH as sensorSettingsPatch,
} from "@/app/api/sensor-safety/settings/route";

const getCurrentUserMock = vi.mocked(getCurrentUser);
const runPredictiveMock = vi.mocked(runPredictiveFromBody);

const ANONYMOUS = null;
const CITIZEN = { id: "u1", role: "CITIZEN" };
const OPERATOR = { id: "u2", role: "OPERATOR" };

function jsonRequest(method: string, body: unknown) {
  return new NextRequest("http://localhost/test", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  runPredictiveMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/predictive/run", () => {
  it.each([
    ["anonymous", ANONYMOUS, 401],
    ["citizen", CITIZEN, 403],
  ])("rejects %s callers before running the predictive core", async (_label, user, status) => {
    getCurrentUserMock.mockResolvedValue(user as never);
    const response = await predictiveRunPost(jsonRequest("POST", { latitude: -33.4, longitude: -70.6 }));
    expect(response.status).toBe(status);
    expect(runPredictiveMock).not.toHaveBeenCalled();
  });

  it("lets an operator run it", async () => {
    getCurrentUserMock.mockResolvedValue(OPERATOR as never);
    const response = await predictiveRunPost(jsonRequest("POST", { latitude: -33.4, longitude: -70.6 }));
    expect(response.status).toBe(200);
    expect(runPredictiveMock).toHaveBeenCalledTimes(1);
  });
});

describe.each([
  ["mobile-safety", mobileSettingsGet, mobileSettingsPatch],
  ["sensor-safety", sensorSettingsGet, sensorSettingsPatch],
] as const)("PATCH /api/%s/settings", (_name, getSettings, patchSettings) => {
  it.each([
    ["anonymous", ANONYMOUS, 401],
    ["citizen", CITIZEN, 403],
  ])("rejects %s callers and leaves the shared settings untouched", async (_label, user, status) => {
    getCurrentUserMock.mockResolvedValue(user as never);
    const before = await (await getSettings()).json();
    const response = await patchSettings(jsonRequest("PATCH", { enabled: !before.settings.enabled, checkInTimeoutSeconds: 31 }));
    expect(response.status).toBe(status);
    const after = await (await getSettings()).json();
    expect(after.settings).toEqual(before.settings);
  });

  it("lets an operator change them", async () => {
    getCurrentUserMock.mockResolvedValue(OPERATOR as never);
    const response = await patchSettings(jsonRequest("PATCH", { checkInTimeoutSeconds: 45 }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.settings.checkInTimeoutSeconds).toBe(45);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * VESTA privacy (closure audit 2026-09-21): the legacy database has no RLS,
 * so free-text medical data must never be written or returned, values stored
 * before the fix must be purged on the next save, and the user must be able to
 * erase their own preparedness data. Only the I/O boundary is mocked.
 */

vi.mock("@/services/authService", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/services/auditService", () => ({ logAuditEvent: vi.fn(async () => ({})) }));
vi.mock("@/modules/vesta/vestaProfileStore", () => ({
  getOrCreateVestaProfile: vi.fn(async () => ({ id: "profile-1" })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    familyPlan: { upsert: vi.fn(), deleteMany: vi.fn(() => "familyPlan.deleteMany") },
    emergencyContact: { deleteMany: vi.fn(() => "emergencyContact.deleteMany") },
    preparednessChecklistItem: { deleteMany: vi.fn(() => "checklist.deleteMany") },
    preparednessReminder: { deleteMany: vi.fn(() => "reminder.deleteMany") },
    preparednessProfile: { findUnique: vi.fn(), delete: vi.fn(() => "profile.delete"), update: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));

import { NextRequest } from "next/server";
import { getCurrentUser } from "@/services/authService";
import { logAuditEvent } from "@/services/auditService";
import { prisma } from "@/lib/prisma";
import { PUT as familyPlanPut } from "@/app/api/vesta/family-plan/route";
import { DELETE as profileDelete } from "@/app/api/vesta/profile/route";

const getCurrentUserMock = vi.mocked(getCurrentUser);
const upsertMock = vi.mocked(prisma.familyPlan.upsert);
const findProfileMock = vi.mocked(prisma.preparednessProfile.findUnique);
const transactionMock = vi.mocked(prisma.$transaction);

const USER = { id: "user-1", role: "CITIZEN" };

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(USER as never);
  upsertMock.mockReset().mockImplementation((async (args: { create: Record<string, unknown> }) => ({
    ...args.create,
    updatedAt: new Date("2026-09-21T00:00:00Z"),
  })) as never);
  findProfileMock.mockReset();
  transactionMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

function putRequest(body: unknown) {
  return new NextRequest("http://localhost/api/vesta/family-plan", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/vesta/family-plan — medical free text is never persisted", () => {
  it("writes null for medicalNeedsNotes and drops members[].medicalNotes on create and update", async () => {
    const response = await familyPlanPut(
      putRequest({
        medicalNeedsNotes: "Insulina 2x día",
        primaryMeetingPoint: "Plaza",
        members: [{ name: "Ana", relationship: "hija", medicalNotes: "asma" }],
      })
    );
    expect(response.status).toBe(200);

    const args = upsertMock.mock.calls[0]![0] as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(args.create.medicalNeedsNotes).toBeNull();
    expect(args.update.medicalNeedsNotes).toBeNull(); // null (not undefined) purges legacy values
    expect(JSON.stringify(args.create.membersJson)).not.toContain("asma");
    expect(JSON.stringify(args.update.membersJson)).not.toContain("asma");
    expect(args.create.primaryMeetingPoint).toBe("Plaza");

    const body = await response.json();
    expect(body.medicalNeedsNotes).toBeNull();
    expect(JSON.stringify(body)).not.toContain("Insulina");
    expect(JSON.stringify(body)).not.toContain("asma");
  });

  it("rejects anonymous callers without touching the database", async () => {
    getCurrentUserMock.mockResolvedValue(null as never);
    const response = await familyPlanPut(putRequest({ medicalNeedsNotes: "x" }));
    expect(response.status).toBe(401);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/vesta/profile — right to erasure", () => {
  it("deletes only the session user's profile and every child row, and audits it", async () => {
    findProfileMock.mockResolvedValue({ id: "profile-1" } as never);
    const response = await profileDelete();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });

    expect(findProfileMock).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-1" } }));
    expect(prisma.familyPlan.deleteMany).toHaveBeenCalledWith({ where: { profileId: "profile-1" } });
    expect(prisma.emergencyContact.deleteMany).toHaveBeenCalledWith({ where: { profileId: "profile-1" } });
    expect(prisma.preparednessChecklistItem.deleteMany).toHaveBeenCalledWith({ where: { profileId: "profile-1" } });
    expect(prisma.preparednessReminder.deleteMany).toHaveBeenCalledWith({ where: { profileId: "profile-1" } });
    expect(prisma.preparednessProfile.delete).toHaveBeenCalledWith({ where: { id: "profile-1" } });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "VESTA_PROFILE_ERASED", actorUserId: "user-1" }));
  });

  it("is a no-op when the user has no VESTA data", async () => {
    findProfileMock.mockResolvedValue(null as never);
    const response = await profileDelete();
    expect(await response.json()).toEqual({ deleted: false, reason: "sin_datos" });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects anonymous callers", async () => {
    getCurrentUserMock.mockResolvedValue(null as never);
    const response = await profileDelete();
    expect(response.status).toBe(401);
    expect(findProfileMock).not.toHaveBeenCalled();
  });
});

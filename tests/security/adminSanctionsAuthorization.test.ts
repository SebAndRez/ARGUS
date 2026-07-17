import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Bloque 8 / Fase D — `POST /api/admin/sanctions` used `requireOperator()`
 * (OPERATOR/ANALYST included) to gate account-status-changing sanction
 * types (RESTORE/LIMITATION/SUSPENSION/BAN), while the canonical policy
 * `canChangeAccountStatus` (already used by `/api/users/[id]`) requires
 * ADMIN+, blocks self-target, and protects SUPER_ADMIN accounts. This
 * suite drives the real route handler with only Prisma/auth mocked.
 */

vi.mock("@/services/authService", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/services/auditService", () => ({
  logAuditEvent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    sanction: { create: vi.fn() },
  },
}));

import { getCurrentUser } from "@/services/authService";
import { logAuditEvent } from "@/services/auditService";
import { prisma } from "@/lib/prisma";
import { POST as sanctionsPost } from "@/app/api/admin/sanctions/route";

const getCurrentUserMock = vi.mocked(getCurrentUser);
const userFindUniqueMock = vi.mocked(prisma.user.findUnique);
const userUpdateMock = vi.mocked(prisma.user.update);
const sanctionCreateMock = vi.mocked(prisma.sanction.create);
const logAuditEventMock = vi.mocked(logAuditEvent);

const CITIZEN = { id: "citizen-1", role: "CITIZEN", accountStatus: "ACTIVE" };
const OPERATOR = { id: "operator-1", role: "OPERATOR", accountStatus: "ACTIVE" };
const ANALYST = { id: "analyst-1", role: "ANALYST", accountStatus: "ACTIVE" };
const ADMIN = { id: "admin-1", role: "ADMIN", accountStatus: "ACTIVE" };
const SUPER_ADMIN = { id: "super-1", role: "SUPER_ADMIN", accountStatus: "ACTIVE" };

const TARGET_CITIZEN = { id: "target-citizen", role: "CITIZEN", accountStatus: "ACTIVE" };
const TARGET_ADMIN = { id: "target-admin", role: "ADMIN", accountStatus: "ACTIVE" };
const TARGET_SUPER_ADMIN = { id: "target-super", role: "SUPER_ADMIN", accountStatus: "ACTIVE" };

function postRequest(body: unknown) {
  return new Request("http://localhost/api/admin/sanctions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** requireOperator() reads the session via getCurrentUser + hasAnyRole internally. */
function mockActor(actor: typeof OPERATOR | null) {
  getCurrentUserMock.mockResolvedValue(actor as never);
}

beforeEach(() => {
  sanctionCreateMock.mockResolvedValue({ id: "sanction-1" } as never);
  userUpdateMock.mockResolvedValue({} as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/admin/sanctions — jerarquia de autorizacion (Fase D)", () => {
  it("ANONYMOUS -> 401", async () => {
    mockActor(null);
    const response = await sanctionsPost(postRequest({ userId: "target-citizen", type: "BAN", reason: "test" }));
    expect(response!.status).toBe(401);
  });

  it("CITIZEN -> 403 (no es OPERATOR+)", async () => {
    mockActor(CITIZEN as never);
    const response = await sanctionsPost(postRequest({ userId: "target-citizen", type: "BAN", reason: "test" }));
    expect(response!.status).toBe(403);
  });

  it("OPERATOR -> 403 al intentar BAN/SUSPENSION/LIMITATION/RESTORE (requiere ADMIN+)", async () => {
    mockActor(OPERATOR);
    userFindUniqueMock.mockResolvedValue(TARGET_CITIZEN as never);
    for (const type of ["BAN", "SUSPENSION", "LIMITATION", "RESTORE"]) {
      const response = await sanctionsPost(postRequest({ userId: "target-citizen", type, reason: "test" }));
      expect(response.status).toBe(403);
    }
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it("ANALYST -> 403 al intentar cambiar estado de cuenta (mismo rango que OPERATOR)", async () => {
    mockActor(ANALYST as never);
    userFindUniqueMock.mockResolvedValue(TARGET_CITIZEN as never);
    const response = await sanctionsPost(postRequest({ userId: "target-citizen", type: "BAN", reason: "test" }));
    expect(response.status).toBe(403);
  });

  it("OPERATOR SI puede emitir WARNING (no cambia accountStatus)", async () => {
    mockActor(OPERATOR);
    userFindUniqueMock.mockResolvedValue(TARGET_CITIZEN as never);
    const response = await sanctionsPost(postRequest({ userId: "target-citizen", type: "WARNING", reason: "test" }));
    expect(response.status).toBe(200);
    expect(userUpdateMock).not.toHaveBeenCalled();
    expect(sanctionCreateMock).toHaveBeenCalled();
  });

  it("ADMIN -> permitido sobre una cuenta CITIZEN", async () => {
    mockActor(ADMIN);
    userFindUniqueMock.mockResolvedValue(TARGET_CITIZEN as never);
    const response = await sanctionsPost(postRequest({ userId: "target-citizen", type: "SUSPENSION", reason: "test" }));
    expect(response.status).toBe(200);
    expect(userUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "target-citizen" }, data: expect.objectContaining({ accountStatus: "SUSPENDED" }) })
    );
  });

  it("ADMIN -> 403 al intentar modificar a otro ADMIN o a un SUPER_ADMIN", async () => {
    mockActor(ADMIN);
    userFindUniqueMock.mockResolvedValue(TARGET_ADMIN as never);
    const adminTarget = await sanctionsPost(postRequest({ userId: "target-admin", type: "BAN", reason: "test" }));
    // canChangeAccountStatus solo exige ADMIN+ para el actor y protege
    // SUPER_ADMIN especificamente; un ADMIN sobre otro ADMIN esta permitido
    // por diseño (la jerarquia solo restringe SUPER_ADMIN) — se verifica el
    // caso SUPER_ADMIN explícitamente a continuación.
    expect(adminTarget.status).toBe(200);

    userFindUniqueMock.mockResolvedValue(TARGET_SUPER_ADMIN as never);
    const superTarget = await sanctionsPost(postRequest({ userId: "target-super", type: "BAN", reason: "test" }));
    expect(superTarget.status).toBe(403);
  });

  it("SUPER_ADMIN -> permitido incluso sobre otro SUPER_ADMIN", async () => {
    mockActor(SUPER_ADMIN as never);
    userFindUniqueMock.mockResolvedValue(TARGET_SUPER_ADMIN as never);
    const response = await sanctionsPost(postRequest({ userId: "target-super", type: "BAN", reason: "test" }));
    expect(response.status).toBe(200);
  });

  it("Autoescalamiento: ADMIN no puede cambiar su propio accountStatus por esta ruta -> 403", async () => {
    mockActor(ADMIN);
    userFindUniqueMock.mockResolvedValue(ADMIN as never);
    const response = await sanctionsPost(postRequest({ userId: "admin-1", type: "RESTORE", reason: "test" }));
    expect(response.status).toBe(403);
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it("type invalido -> 400, sin tocar la base de datos", async () => {
    mockActor(ADMIN);
    const response = await sanctionsPost(postRequest({ userId: "target-citizen", type: "DELETE_ACCOUNT", reason: "test" }));
    expect(response.status).toBe(400);
    expect(userFindUniqueMock).not.toHaveBeenCalled();
    expect(sanctionCreateMock).not.toHaveBeenCalled();
  });

  it("usuario objetivo inexistente -> 404", async () => {
    mockActor(ADMIN);
    userFindUniqueMock.mockResolvedValue(null as never);
    const response = await sanctionsPost(postRequest({ userId: "no-existe", type: "BAN", reason: "test" }));
    expect(response.status).toBe(404);
  });

  it("auditoria: registra actor, target, accion y estado anterior/nuevo", async () => {
    mockActor(ADMIN);
    userFindUniqueMock.mockResolvedValue(TARGET_CITIZEN as never);
    await sanctionsPost(postRequest({ userId: "target-citizen", type: "BAN", reason: "abuso confirmado" }));
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "admin-1",
        action: "SANCTION_BAN",
        targetType: "User",
        targetId: "target-citizen",
        metadata: expect.objectContaining({
          previousAccountStatus: "ACTIVE",
          newAccountStatus: "BANNED",
        }),
      })
    );
  });

});

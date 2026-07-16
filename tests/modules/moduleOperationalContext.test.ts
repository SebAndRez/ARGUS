import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ARGUS Prompt 17 §29 Caso 7 + §18 — permisos server-side del contexto
 * operacional compartido. Nunca confía en rol de cliente: la resolución de
 * acceso ocurre completamente server-side (`getCurrentUser` + `canAccessModule`),
 * y un usuario no autorizado nunca recibe datos ni dispara la consulta al
 * gateway canónico.
 */

vi.mock("@/services/authService", () => ({
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/modules/canonicalIncidentGateway", () => ({
  fetchCanonicalModuleIncidents: vi.fn(),
  fetchCanonicalModuleIncidentById: vi.fn(),
}));

import { getCurrentUser } from "@/services/authService";
import { fetchCanonicalModuleIncidents } from "@/lib/modules/canonicalIncidentGateway";
import { getModuleIncidentListContext } from "@/lib/modules/moduleOperationalContext";

const getCurrentUserMock = vi.mocked(getCurrentUser);
const fetchIncidentsMock = vi.mocked(fetchCanonicalModuleIncidents);

beforeEach(() => {
  getCurrentUserMock.mockReset();
  fetchIncidentsMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getModuleIncidentListContext — permisos server-side (Prompt 17 §18, Caso 7)", () => {
  it("usuario anónimo consultando ATLAS (institucional): unauthorized, sin llamar al gateway", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const result = await getModuleIncidentListContext("argus-atlas", {});
    expect(result.state).toBe("unauthorized");
    if (result.state !== "unauthorized") throw new Error("expected unauthorized");
    expect(result.error.code).toBe("UNAUTHORIZED");
    expect(fetchIncidentsMock).not.toHaveBeenCalled();
  });

  it("usuario CITIZEN autenticado pero sin rol institucional consultando ATLAS: forbidden, sin llamar al gateway", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "u1",
      name: "Test",
      email: "t@example.com",
      publicAlias: "tester",
      role: "CITIZEN",
      accountStatus: "ACTIVE",
      trustScore: 70,
      strikes: 0,
      emailVerifiedAt: null,
      governmentIdHash: null,
    } as never);
    const result = await getModuleIncidentListContext("argus-atlas", {});
    expect(result.state).toBe("unauthorized");
    if (result.state !== "unauthorized") throw new Error("expected unauthorized");
    expect(result.error.code).toBe("FORBIDDEN");
    expect(fetchIncidentsMock).not.toHaveBeenCalled();
  });

  it("VIGÍA es público: un anónimo sí puede consultar la lista (el gateway se invoca)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    fetchIncidentsMock.mockResolvedValue({ ok: true, page: { summaries: [], nextCursor: null } });
    const result = await getModuleIncidentListContext("argus-vigia", {});
    expect(result.state).toBe("empty");
    expect(fetchIncidentsMock).toHaveBeenCalledTimes(1);
  });

  it("ADMIN siempre autorizado independientemente del módulo", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "u2",
      name: "Admin",
      email: "admin@example.com",
      publicAlias: "admin",
      role: "ADMIN",
      accountStatus: "ACTIVE",
      trustScore: 100,
      strikes: 0,
      emailVerifiedAt: new Date(),
      governmentIdHash: "hash",
    } as never);
    fetchIncidentsMock.mockResolvedValue({ ok: true, page: { summaries: [], nextCursor: null } });
    const result = await getModuleIncidentListContext("argus-oraculo", {});
    expect(result.state).toBe("empty");
  });
});

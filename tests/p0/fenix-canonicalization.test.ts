import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withEnv } from "../helpers/withEnv";

/**
 * Reads actual source text from disk (not the Vite-transformed runtime
 * module, whose import specifiers get renamed to `__vite_ssr_import_N__`
 * during SSR transform) — this is what lets us assert the real import
 * wiring (which file imports which component) without a DOM renderer.
 */
function readSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, "../../", relativePath), "utf8");
}

/**
 * Regression suite for the Prompt 7 fix: FÉNIX must have a single canonical
 * entry point (`/modules/fenix`, rendering `FenixTwinPanel`), with
 * `/dashboard/fenix` as a non-looping legacy redirect, and
 * `/api/fenix/simulation`+`/api/fenix/action-plan` gated by real session
 * roles (never by `localStorage`/query params).
 */

vi.mock("@/services/authService", () => ({
  getCurrentUser: vi.fn(),
}));

import { getCurrentUser } from "@/services/authService";
import { getModuleById } from "@/data/argusModules";
import {
  canAccessModule,
  mapSessionUserToArgusRole,
  resolveEffectiveModuleRole,
} from "@/lib/modules/moduleAccess";
import { POST as simulationPost, GET as simulationGet } from "@/app/api/fenix/simulation/route";
import { POST as actionPlanPost } from "@/app/api/fenix/action-plan/route";
import DashboardFenixLegacyPage from "@/app/dashboard/fenix/page";

const getCurrentUserMock = vi.mocked(getCurrentUser);
const fenixModule = getModuleById("argus-fenix")!;

const ANONYMOUS = null;
const CITIZEN = { id: "u1", role: "CITIZEN" };
const OPERATOR = { id: "u2", role: "OPERATOR" };
const ADMIN = { id: "u3", role: "ADMIN" };

function jsonRequest(body: unknown) {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** next/navigation's redirect() throws a special NEXT_REDIRECT error instead of returning. */
async function captureRedirect(fn: () => unknown | Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    const digest = (error as { digest?: string })?.digest ?? String(error);
    return digest;
  }
  throw new Error("Expected a redirect to be thrown, but the function returned normally.");
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Caso 1 — el registro de modulos apunta a la ruta canonica", () => {
  it("argus-fenix.route es /modules/fenix (el menu siempre converge ahi)", () => {
    expect(fenixModule.route).toBe("/modules/fenix");
  });
});

describe("Caso 2 / Caso 10 — /dashboard/fenix redirige a /modules/fenix sin bucle", () => {
  it("redirige a /modules/fenix preservando query params, sin renderizar contenido antes", async () => {
    const digest = await captureRedirect(() =>
      DashboardFenixLegacyPage({
        searchParams: Promise.resolve({ lat: "-33.5", lng: "-70.7" }),
      })
    );
    expect(digest).toContain("NEXT_REDIRECT");
    expect(digest).toContain("/modules/fenix");
    expect(digest).toContain("lat=-33.5");
    expect(digest).toContain("lng=-70.7");
  });

  it("sin query params, redirige a /modules/fenix sin sufijo", async () => {
    const digest = await captureRedirect(() =>
      DashboardFenixLegacyPage({ searchParams: Promise.resolve({}) })
    );
    expect(digest).toContain("/modules/fenix");
  });

  it("el destino (/modules/fenix) nunca redirige de vuelta a /dashboard/fenix — sin bucle por construccion", () => {
    const canonicalSource = readSource("src/app/modules/fenix/page.tsx");
    expect(canonicalSource).not.toContain("dashboard/fenix");
    expect(canonicalSource).not.toContain("redirect(");
  });
});

const IMPORT_LINE_PATTERN = /^import .*from ["'].*$/m;

function importsIdentifier(source: string, identifier: string): boolean {
  return source
    .split("\n")
    .some((line) => IMPORT_LINE_PATTERN.test(line) && line.includes(identifier));
}

describe("Caso 8 — componente oficial vs demo (verificado sobre el codigo fuente real en disco)", () => {
  it("la pagina oficial importa FenixOfficialGate, no FenixDashboard directamente", () => {
    const pageSource = readSource("src/app/modules/fenix/page.tsx");
    expect(importsIdentifier(pageSource, "FenixOfficialGate")).toBe(true);
    expect(importsIdentifier(pageSource, "FenixDashboard")).toBe(false);
  });

  it("FenixOfficialGate importa y renderiza FenixTwinPanel (el motor mas maduro), no FenixDashboard", () => {
    const gateSource = readSource("src/modules/fenix/components/FenixOfficialGate.tsx");
    expect(importsIdentifier(gateSource, "FenixTwinPanel")).toBe(true);
    expect(importsIdentifier(gateSource, "FenixDashboard")).toBe(false);
  });

  it("FenixDashboard (legacy) fue retirado en Prompt 20 — cero importadores confirmados, no se mantienen dos dashboards completos", () => {
    expect(() => readSource("src/modules/fenix/components/FenixDashboard.tsx")).toThrow();
  });
});

describe("Caso 3/4/5/6/9 — acceso al modulo depende exclusivamente de la sesion real", () => {
  it("Caso 3 — sin sesion: PUBLIC, acceso denegado", () => {
    const role = mapSessionUserToArgusRole(null);
    expect(role).toBe("PUBLIC");
    const access = canAccessModule(role, fenixModule);
    expect(access.canEnter).toBe(false);
  });

  it("Caso 4 — ciudadano: acceso denegado, no es lo mismo que 'no autenticado' pero igual sin canEnter", () => {
    const role = mapSessionUserToArgusRole({ id: "u1", role: "CITIZEN", accountStatus: "ACTIVE" } as never);
    const access = canAccessModule(role, fenixModule);
    expect(access.canEnter).toBe(false);
  });

  it("Caso 5 — operador legitimo: acceso permitido (allowedRoles incluye ANALYST/ADMIN/SUPER_ADMIN/INSTITUTIONAL_ADMIN via canAccessModule admin override o rol explicito)", () => {
    const adminRole = mapSessionUserToArgusRole({ id: "u3", role: "ADMIN", accountStatus: "ACTIVE" } as never);
    expect(canAccessModule(adminRole, fenixModule).canEnter).toBe(true);
    const analystRole = mapSessionUserToArgusRole({ id: "u4", role: "ANALYST", accountStatus: "ACTIVE" } as never);
    expect(canAccessModule(analystRole, fenixModule).canEnter).toBe(true);
  });

  it("Caso 6 — rol demo (localStorage=AUTHORITY simulado) no altera el resultado: resolveEffectiveModuleRole lo ignora fuera de desarrollo autorizado", () => {
    withEnv({ NODE_ENV: "production", NEXT_PUBLIC_ARGUS_ENABLE_DEMO_ROLES: undefined }, () => {
      const sessionRole = mapSessionUserToArgusRole(null); // PUBLIC
      const effectiveRole = resolveEffectiveModuleRole(sessionRole, "AUTHORITY" as never);
      expect(effectiveRole).toBe("PUBLIC");
      expect(canAccessModule(effectiveRole, fenixModule).canEnter).toBe(false);
    });
  });

  it("Caso 9 — rol desconocido: fail-closed", () => {
    expect(canAccessModule("SOMETHING_MADE_UP" as never, fenixModule).canEnter).toBe(false);
  });
});

describe("Caso 7 — POST /api/fenix/simulation", () => {
  const validBody = { scenarioId: "fenix-wildfire-urban-edge", initialRadiusKm: 5, simulationMinutes: 60 };

  it("anonimo: 401", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    const response = await simulationPost(jsonRequest(validBody) as never);
    expect(response.status).toBe(401);
  });

  it("usuario sin privilegios (CITIZEN): 403", async () => {
    getCurrentUserMock.mockResolvedValue(CITIZEN as never);
    const response = await simulationPost(jsonRequest(validBody) as never);
    expect(response.status).toBe(403);
  });

  it("usuario valido (OPERATOR): supera autorizacion, 200", async () => {
    getCurrentUserMock.mockResolvedValue(OPERATOR as never);
    const response = await simulationPost(jsonRequest(validBody) as never);
    expect(response.status).toBe(200);
  });

  it("usuario valido con payload invalido: 400", async () => {
    getCurrentUserMock.mockResolvedValue(OPERATOR as never);
    const response = await simulationPost(
      jsonRequest({ ...validBody, initialRadiusKm: -5 }) as never
    );
    expect(response.status).toBe(400);
  });

  it("GET tambien exige autorizacion: anonimo 401, operador 200", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    expect((await simulationGet()).status).toBe(401);
    getCurrentUserMock.mockResolvedValue(ADMIN as never);
    expect((await simulationGet()).status).toBe(200);
  });
});

describe("Caso 7 (extendido) — POST /api/fenix/action-plan usa la misma politica", () => {
  it("anonimo: 401", async () => {
    getCurrentUserMock.mockResolvedValue(ANONYMOUS);
    const response = await actionPlanPost(jsonRequest({ scenarioId: "fenix-wildfire-urban-edge" }) as never);
    expect(response.status).toBe(401);
  });

  it("CITIZEN: 403", async () => {
    getCurrentUserMock.mockResolvedValue(CITIZEN as never);
    const response = await actionPlanPost(jsonRequest({ scenarioId: "fenix-wildfire-urban-edge" }) as never);
    expect(response.status).toBe(403);
  });

  it("ADMIN: 200", async () => {
    getCurrentUserMock.mockResolvedValue(ADMIN as never);
    const response = await actionPlanPost(jsonRequest({ scenarioId: "fenix-wildfire-urban-edge" }) as never);
    expect(response.status).toBe(200);
  });
});

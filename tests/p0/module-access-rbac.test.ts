import { afterEach, describe, expect, it } from "vitest";
import { withEnv } from "../helpers/withEnv";
import {
  DEMO_ROLE_STORAGE_KEY,
  canAccessModule,
  clearDemoRoleOverride,
  getVisibleModules,
  isDemoRoleOverrideAllowed,
  mapSessionUserToArgusRole,
  resolveEffectiveModuleRole,
} from "../../src/lib/modules/moduleAccess";
import { getModuleById } from "../../src/data/argusModules";
import type { SessionUser } from "../../src/types/crisis";
import type { ArgusRole } from "../../src/types/rbac";

/**
 * Regression suite for the Prompt 5 fix: no client-controlled value
 * (localStorage, a query param, or any other browser-side state) may ever
 * stand in for a verified session role once `isDemoRoleOverrideAllowed()`
 * is false — which it always is in production, regardless of any flag.
 *
 * Uses the REAL module registry (`src/data/argusModules.ts`) and the REAL
 * `canAccessModule`/`mapSessionUserToArgusRole` decision logic — no mocks —
 * so this tests actual authorization behavior, not a stand-in.
 */

const custosModule = getModuleById("argus-custos")!;
const nexusModule = getModuleById("argus-nexus")!;
const atlasModule = getModuleById("argus-atlas")!;

function baseUser(overrides: Partial<SessionUser>): SessionUser {
  return {
    id: "u1",
    name: "Test User",
    email: "test@example.com",
    publicAlias: "test-user",
    role: "CITIZEN",
    accountStatus: "ACTIVE",
    trustScore: 50,
    strikes: 0,
    ...overrides,
  } as SessionUser;
}

function citizenUser(): SessionUser {
  return baseUser({ id: "u1", role: "CITIZEN" });
}

function operatorUser(): SessionUser {
  return baseUser({ id: "u2", role: "OPERATOR" });
}

function adminUser(): SessionUser {
  return baseUser({ id: "u3", role: "ADMIN" });
}

describe("isDemoRoleOverrideAllowed (fail-closed gate)", () => {
  it("Caso 1 — produccion, variable ausente: deshabilitado", () => {
    withEnv({ NODE_ENV: "production", NEXT_PUBLIC_ARGUS_ENABLE_DEMO_ROLES: undefined }, () => {
      expect(isDemoRoleOverrideAllowed()).toBe(false);
    });
  });

  it("Caso 2 — produccion, variable=true: sigue deshabilitado (NODE_ENV manda)", () => {
    withEnv({ NODE_ENV: "production", NEXT_PUBLIC_ARGUS_ENABLE_DEMO_ROLES: "true" }, () => {
      expect(isDemoRoleOverrideAllowed()).toBe(false);
    });
  });

  it("Caso 4 — desarrollo, sin variable: deshabilitado", () => {
    withEnv({ NODE_ENV: "development", NEXT_PUBLIC_ARGUS_ENABLE_DEMO_ROLES: undefined }, () => {
      expect(isDemoRoleOverrideAllowed()).toBe(false);
    });
  });

  it.each(["1", "yes", "TRUE", "on"])("desarrollo, valor ambiguo '%s': deshabilitado", (value) => {
    withEnv({ NODE_ENV: "development", NEXT_PUBLIC_ARGUS_ENABLE_DEMO_ROLES: value }, () => {
      expect(isDemoRoleOverrideAllowed()).toBe(false);
    });
  });

  it("Caso 5 — desarrollo, variable exacta 'true': habilitado", () => {
    withEnv({ NODE_ENV: "development", NEXT_PUBLIC_ARGUS_ENABLE_DEMO_ROLES: "true" }, () => {
      expect(isDemoRoleOverrideAllowed()).toBe(true);
    });
  });
});

describe("resolveEffectiveModuleRole (nunca concede permisos desde el cliente)", () => {
  it("Caso 1 — produccion: el rol efectivo es siempre el de sesion, sin leer el rol demo", () => {
    withEnv({ NODE_ENV: "production", NEXT_PUBLIC_ARGUS_ENABLE_DEMO_ROLES: undefined }, () => {
      expect(resolveEffectiveModuleRole("CITIZEN", "POLICE")).toBe("CITIZEN");
    });
  });

  it("Caso 2 — produccion con variable=true: override sigue bloqueado", () => {
    withEnv({ NODE_ENV: "production", NEXT_PUBLIC_ARGUS_ENABLE_DEMO_ROLES: "true" }, () => {
      expect(resolveEffectiveModuleRole("CITIZEN", "AUTHORITY")).toBe("CITIZEN");
    });
  });

  it("Caso 3 — produccion con 'localStorage=POLICE' simulado: valor ignorado, ciudadano no obtiene acceso", () => {
    withEnv({ NODE_ENV: "production" }, () => {
      const demoRoleFromStorage: ArgusRole = "POLICE"; // simula un valor leido de localStorage
      const effectiveRole = resolveEffectiveModuleRole("CITIZEN", demoRoleFromStorage);
      expect(effectiveRole).toBe("CITIZEN");
      expect(canAccessModule(effectiveRole, custosModule).canEnter).toBe(false);
    });
  });

  it("No-regresion — un parametro tipo '?role=AUTHORITY' tampoco altera el rol efectivo en produccion", () => {
    withEnv({ NODE_ENV: "production" }, () => {
      // El "candidato" puede venir de cualquier lado (localStorage, query
      // param, variable global) — resolveEffectiveModuleRole no distingue
      // el origen, solo si el override esta permitido. Simulamos aqui un
      // valor que habria venido de `new URLSearchParams(location.search)`.
      const roleFromQueryParam = "AUTHORITY" as ArgusRole;
      expect(resolveEffectiveModuleRole("CITIZEN", roleFromQueryParam)).toBe("CITIZEN");
    });
  });

  it("Caso 5 — desarrollo con variable explicita: el override SI cambia la vista previa", () => {
    withEnv({ NODE_ENV: "development", NEXT_PUBLIC_ARGUS_ENABLE_DEMO_ROLES: "true" }, () => {
      expect(resolveEffectiveModuleRole("CITIZEN", "POLICE")).toBe("POLICE");
    });
  });
});

describe("clearDemoRoleOverride (limpieza de localStorage)", () => {
  afterEach(() => {
    // vitest's `unstubAllGlobals` (configured in tests/setup.ts afterEach)
    // already restores `window`, but clear defensively in case a case fails
    // before that runs.
  });

  it("elimina la clave almacenada cuando existe un localStorage simulado", () => {
    const store = new Map<string, string>();
    store.set(DEMO_ROLE_STORAGE_KEY, "POLICE");
    const fakeWindow = {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
    };
    // @ts-expect-error — minimal stand-in for the browser global, not a full Window.
    globalThis.window = fakeWindow;

    expect(store.has(DEMO_ROLE_STORAGE_KEY)).toBe(true);
    clearDemoRoleOverride();
    expect(store.has(DEMO_ROLE_STORAGE_KEY)).toBe(false);

    // @ts-expect-error — cleanup of the manual stand-in.
    delete globalThis.window;
  });

  it("no lanza cuando no hay `window` (contexto de servidor/SSR)", () => {
    expect(() => clearDemoRoleOverride()).not.toThrow();
  });
});

describe("mapSessionUserToArgusRole + canAccessModule sobre el registro REAL de modulos", () => {
  it("Caso 6 — ciudadano navega directo a CUSTOS: acceso denegado, contenido no visible", () => {
    const role = mapSessionUserToArgusRole(citizenUser());
    const access = canAccessModule(role, custosModule);
    expect(access.canView).toBe(false);
    expect(access.canEnter).toBe(false);
  });

  it("Caso 7 — operador: entra a modulos cuya politica real incluye OPERATOR, pero NO a CUSTOS (police_only)", () => {
    const role = mapSessionUserToArgusRole(operatorUser());
    expect(role).toBe("OPERATOR");
    expect(canAccessModule(role, nexusModule).canEnter).toBe(true);
    expect(canAccessModule(role, custosModule).canEnter).toBe(false);
    // OPERATOR no hereda POLICE/AUTHORITY por analogia.
    expect(canAccessModule(role, custosModule).canView).toBe(false);
  });

  it("Caso 8 — administrador: conserva acceso administrativo legitimo a todos los modulos, sin transformarse en un rol institucional inventado", () => {
    const role = mapSessionUserToArgusRole(adminUser());
    expect(role).toBe("ADMIN");
    expect(canAccessModule(role, custosModule).canEnter).toBe(true);
    expect(canAccessModule(role, nexusModule).canEnter).toBe(true);
    expect(canAccessModule(role, atlasModule).canEnter).toBe(true);
  });

  it("Caso 9 — rol desconocido: fail-closed, sin acceso a modulos restringidos", () => {
    const unknownRole = "SOMETHING_MADE_UP" as ArgusRole;
    expect(canAccessModule(unknownRole, custosModule).canEnter).toBe(false);
    expect(canAccessModule(unknownRole, nexusModule).canEnter).toBe(false);
  });

  it("Caso 9 (mapSessionUserToArgusRole) — rol de sesion desconocido cae a CITIZEN, nunca a un rol institucional", () => {
    const weirdUser = { id: "u4", role: "SOMETHING_MADE_UP", accountStatus: "ACTIVE" } as unknown as SessionUser;
    const role = mapSessionUserToArgusRole(weirdUser);
    expect(["CITIZEN", "VERIFIED_CITIZEN"]).toContain(role);
  });

  it("Caso 10 — sin sesion: solo modulos publicos son realmente accesibles; CUSTOS queda completamente oculto", () => {
    const role = mapSessionUserToArgusRole(null);
    expect(role).toBe("PUBLIC");

    const visible = getVisibleModules(role);
    expect(visible.find((module) => module.id === "argus-custos")).toBeUndefined();

    // Los institucionales pueden aparecer como "teaser" (canView) pero jamas enterables.
    const nexusAccess = canAccessModule(role, nexusModule);
    expect(nexusAccess.canEnter).toBe(false);
    const atlasAccess = canAccessModule(role, atlasModule);
    expect(atlasAccess.canEnter).toBe(false);
  });

  it("cuentas suspendidas/baneadas se degradan a PUBLIC, nunca conservan un rol elevado", () => {
    const bannedUser = baseUser({ id: "u5", role: "ADMIN", accountStatus: "BANNED" });
    expect(mapSessionUserToArgusRole(bannedUser)).toBe("PUBLIC");
  });
});

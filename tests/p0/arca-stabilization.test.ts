import { describe, expect, it } from "vitest";
import { arcaDemoShelters } from "../../src/modules/arca/data";
import { canUseArcaFeature } from "../../src/modules/arca/arcaAccess";
import type { SessionUser } from "../../src/types/crisis";

/**
 * ARGUS Prompt 18 — ARCA stabilization.
 *
 * 1. Shelters are unconditionally demo data — every fixture must declare
 *    `isDemo: true` so no consumer can mistake it for a live feed.
 * 2. Regression test for the permission gap found in `ArcaDashboard.tsx`:
 *    `canPlanRoute` used to be hardcoded `true`, bypassing the
 *    `send_to_hermes` feature gate that `arcaAccess.ts` already defines.
 *    A role without that grant must now see `canPlanRoute === false`.
 */

function userWithRole(role: string): SessionUser {
  return {
    id: "u1",
    name: "Test",
    email: "t@example.com",
    publicAlias: "t",
    role: role as SessionUser["role"],
    accountStatus: "ACTIVE",
    trustScore: 50,
    strikes: 0,
  } as SessionUser;
}

describe("ARCA — los refugios son siempre datos demo, y lo declaran", () => {
  it("arcaDemoShelters no está vacío", () => {
    expect(arcaDemoShelters.length).toBeGreaterThan(0);
  });

  it("cada refugio demo declara isDemo: true", () => {
    for (const shelter of arcaDemoShelters) {
      expect(shelter.isDemo).toBe(true);
    }
  });
});

describe("ARCA — send_to_hermes ahora sí controla quién puede pedir una ruta (regresión)", () => {
  it("un ciudadano no verificado no puede planificar ruta a un refugio", () => {
    const citizen = userWithRole("CITIZEN");
    expect(canUseArcaFeature(citizen, "send_to_hermes")).toBe(false);
  });

  it("un usuario sin sesión tampoco puede planificar ruta", () => {
    expect(canUseArcaFeature(null, "send_to_hermes")).toBe(false);
  });

  it("un operador institucional sí puede planificar ruta", () => {
    const operator = userWithRole("OPERATOR");
    expect(canUseArcaFeature(operator, "send_to_hermes")).toBe(true);
  });

  it("un administrador siempre puede planificar ruta", () => {
    const admin = userWithRole("ADMIN");
    expect(canUseArcaFeature(admin, "send_to_hermes")).toBe(true);
  });
});

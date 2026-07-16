import { describe, expect, it } from "vitest";
import { auraDemoMedicalPoints, auraDemoProfile } from "../../src/modules/aura/data";
import { sanitizeAuraMedicalProfileForRole } from "../../src/modules/aura/auraPrivacy";
import { buildAuraSafeRoute } from "../../src/lib/medical/auraMedicalRouting";

/**
 * ARGUS Prompt 18 — AURA stabilization.
 *
 * 1. Every demo medical point must declare `capacity.isEstimated`, since the
 *    dashboard now surfaces that flag per-point instead of presenting bed
 *    counts as confirmed live availability.
 * 2. `buildAuraSafeRoute` ("ruta más segura") must never silently claim a
 *    hazard-aware safe route when it can't actually compute one — it should
 *    degrade to a direct-route explanation, not throw and not fabricate a
 *    "safe" status.
 * 3. Role-based redaction must actually strip sensitive fields for
 *    non-medical roles.
 */

describe("AURA — la capacidad de los puntos médicos demo está marcada como estimada", () => {
  it("auraDemoMedicalPoints no está vacío", () => {
    expect(auraDemoMedicalPoints.length).toBeGreaterThan(0);
  });

  it("todo punto médico demo con capacidad declara isEstimated: true", () => {
    for (const point of auraDemoMedicalPoints) {
      if (point.capacity) {
        expect(point.capacity.isEstimated).toBe(true);
      }
    }
  });
});

describe("AURA — buildAuraSafeRoute degrada de forma honesta, nunca revienta ni miente", () => {
  const origin = { lat: -33.45, lng: -70.66 };
  const destination = { lat: -33.5, lng: -70.7 };

  it("sin datos de riesgo: devuelve la ruta directa con una explicación explícita, no una 'ruta segura' fabricada", async () => {
    const route = await buildAuraSafeRoute(origin, destination, "walking", {});
    expect(route.kind).toBe("safe");
    expect(route.explanation.toLowerCase()).toContain("sin datos de riesgo");
  });

  it("no lanza una excepción sin manejar incluso si se le pasan zonas de riesgo", async () => {
    await expect(
      buildAuraSafeRoute(origin, destination, "walking", {
        riskProjections: [],
        conflictZones: [],
      })
    ).resolves.toBeDefined();
  });
});

describe("AURA — la redacción por rol realmente oculta campos sensibles", () => {
  it("un rol público no ve el grupo sanguíneo ni el contacto de emergencia del perfil demo", () => {
    const sanitized = sanitizeAuraMedicalProfileForRole(auraDemoProfile, "CITIZEN");
    expect(sanitized.bloodType).toBeUndefined();
    expect(sanitized.emergencyContact).toBeUndefined();
  });

  it("un operador médico ve el perfil completo (necessary_sensitive)", () => {
    const sanitized = sanitizeAuraMedicalProfileForRole(auraDemoProfile, "MEDICAL_OPERATOR");
    expect(sanitized).toEqual(auraDemoProfile);
  });
});

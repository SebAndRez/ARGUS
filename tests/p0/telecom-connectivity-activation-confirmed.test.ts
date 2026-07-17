import { describe, expect, it } from "vitest";
import { deriveRegionalEventType } from "@/lib/connectivity/telecomConnectivityService";
import { canConfirmOfficialConnectivityStatus } from "@/lib/security/rbac";

/**
 * Activacion oficial confirmada de roaming de emergencia (ARGUS v1.0.3.6
 * §16/§21): primera activacion nacional -> eventType "activated", y solo
 * AUTHORITY/INSTITUTIONAL_ADMIN/ADMIN/SUPER_ADMIN pueden marcar
 * verificationStatus "official" (nunca requireOperator solo).
 */

describe("deriveRegionalEventType — activacion", () => {
  it("sin registro previo, nuevo roamingType activo -> 'activated'", () => {
    const result = deriveRegionalEventType(
      null,
      { roamingType: "roaming_emergencia", networkState: "degraded", endedAt: null },
      false
    );
    expect(result).toBe("activated");
  });

  it("registro previo inactivo ('none'), nuevo activo -> 'activated' (no 'expanded' si es la primera region)", () => {
    const previous = {
      roamingType: "none",
      networkState: "unknown",
      endedAt: null,
      sourceName: "subtel",
      confidence: 60,
      lastUpdatedAt: new Date(),
    };
    const result = deriveRegionalEventType(
      previous,
      { roamingType: "roaming_automatico_nacional", networkState: "normal", endedAt: null },
      false
    );
    expect(result).toBe("activated");
  });
});

describe("canConfirmOfficialConnectivityStatus", () => {
  it("OPERATOR y ANALYST no pueden confirmar 'official'", () => {
    expect(canConfirmOfficialConnectivityStatus({ role: "OPERATOR" })).toBe(false);
    expect(canConfirmOfficialConnectivityStatus({ role: "ANALYST" })).toBe(false);
  });

  it("AUTHORITY, INSTITUTIONAL_ADMIN, ADMIN y SUPER_ADMIN si pueden", () => {
    expect(canConfirmOfficialConnectivityStatus({ role: "AUTHORITY" })).toBe(true);
    expect(canConfirmOfficialConnectivityStatus({ role: "INSTITUTIONAL_ADMIN" })).toBe(true);
    expect(canConfirmOfficialConnectivityStatus({ role: "ADMIN" })).toBe(true);
    expect(canConfirmOfficialConnectivityStatus({ role: "SUPER_ADMIN" })).toBe(true);
  });

  it("sin usuario -> false", () => {
    expect(canConfirmOfficialConnectivityStatus(null)).toBe(false);
  });
});

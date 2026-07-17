import { describe, expect, it } from "vitest";
import { deriveRegionalEventType, type ConnectivitySnapshot } from "@/lib/connectivity/telecomConnectivityService";

/**
 * Fin de activacion de roaming de emergencia (spec ARGUS v1.0.3.6 §16/§20
 * escenario D): un registro previo activo que pasa a `endedAt` seteado (o
 * roamingType "none") produce eventType "ended", nunca se presenta como
 * activo despues de esto.
 */

function snapshot(overrides: Partial<ConnectivitySnapshot> = {}): ConnectivitySnapshot {
  return {
    roamingType: "roaming_emergencia",
    networkState: "normal",
    endedAt: null,
    sourceName: "subtel",
    confidence: 80,
    lastUpdatedAt: new Date(),
    ...overrides,
  };
}

describe("deriveRegionalEventType — fin de activacion", () => {
  it("activo -> endedAt seteado produce 'ended'", () => {
    const previous = snapshot();
    const result = deriveRegionalEventType(
      previous,
      { roamingType: "roaming_emergencia", networkState: "normal", endedAt: new Date() },
      false
    );
    expect(result).toBe("ended");
  });

  it("activo -> roamingType 'none' (sin endedAt) tambien produce 'ended'", () => {
    const previous = snapshot();
    const result = deriveRegionalEventType(previous, { roamingType: "none", networkState: "normal", endedAt: null }, false);
    expect(result).toBe("ended");
  });

  it("ya finalizado -> sigue finalizado no produce 'activated' de nuevo", () => {
    const previous = snapshot({ endedAt: new Date("2026-07-10") });
    const result = deriveRegionalEventType(previous, { roamingType: "roaming_emergencia", networkState: "normal", endedAt: new Date("2026-07-10") }, false);
    expect(result).not.toBe("activated");
  });
});

import { describe, expect, it } from "vitest";
import { deriveRegionalEventType, type ConnectivitySnapshot } from "@/lib/connectivity/telecomConnectivityService";

/**
 * Red degradada/interrumpida es un eje independiente de roamingType (spec
 * ARGUS v1.0.3.6 §3/§16): una region puede tener roaming de emergencia
 * activo con red normal, o red degradada sin ningun roaming activado.
 */

function snapshot(overrides: Partial<ConnectivitySnapshot> = {}): ConnectivitySnapshot {
  return {
    roamingType: "none",
    networkState: "normal",
    endedAt: null,
    sourceName: "senapred",
    confidence: 70,
    lastUpdatedAt: new Date(),
    ...overrides,
  };
}

describe("deriveRegionalEventType — degradacion de red independiente de roaming", () => {
  it("red normal -> degradada, sin ningun roaming activo, produce 'degraded'", () => {
    const previous = snapshot({ networkState: "normal", roamingType: "none" });
    const result = deriveRegionalEventType(previous, { roamingType: "none", networkState: "degraded", endedAt: null }, false);
    expect(result).toBe("degraded");
  });

  it("red degradada -> normal produce 'restored'", () => {
    const previous = snapshot({ networkState: "degraded" });
    const result = deriveRegionalEventType(previous, { roamingType: "none", networkState: "normal", endedAt: null }, false);
    expect(result).toBe("restored");
  });

  it("roaming de emergencia activo con red normal no se confunde con degradacion", () => {
    const previous = snapshot({ networkState: "normal", roamingType: "none" });
    const result = deriveRegionalEventType(
      previous,
      { roamingType: "roaming_emergencia", networkState: "normal", endedAt: null },
      false
    );
    expect(result).toBe("activated");
    expect(result).not.toBe("degraded");
  });

  it("outage tambien cuenta como degradacion para efectos de transicion", () => {
    const previous = snapshot({ networkState: "normal" });
    const result = deriveRegionalEventType(previous, { roamingType: "none", networkState: "outage", endedAt: null }, false);
    expect(result).toBe("degraded");
  });
});

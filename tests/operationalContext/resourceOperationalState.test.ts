import { describe, expect, it } from "vitest";
import { deriveOperationalState } from "@/lib/operationalContext/resourceOperationalState";
import type { ShelterOperationalStatus } from "@/lib/criticalPoi/shelterOperationalStatusTypes";

/**
 * Fase 8 — estado operacional. Nunca asume "operativo" solo porque el POI
 * existe: un `status: "unknown"` debe resolver a `unconfirmed`, no a
 * `operational`.
 */
describe("deriveOperationalState", () => {
  it("maps a full shelter to saturated", () => {
    const shelterStatus = { shelterStatus: "full" } as ShelterOperationalStatus;
    const state = deriveOperationalState({ category: "shelter", status: "active", confidence: 90 }, shelterStatus);
    expect(state).toBe("saturated");
  });

  it("maps an unknown-status POI to unconfirmed, never operational by default", () => {
    const state = deriveOperationalState({ category: "hospital", status: "unknown", confidence: 50 });
    expect(state).toBe("unconfirmed");
  });

  it("maps a closed POI to closed", () => {
    const state = deriveOperationalState({ category: "fire_station", status: "closed", confidence: 90 });
    expect(state).toBe("closed");
  });

  it("treats a low-confidence 'active' POI as unconfirmed rather than operational", () => {
    const state = deriveOperationalState({ category: "hospital", status: "active", confidence: 20 });
    expect(state).toBe("unconfirmed");
  });

  it("maps a high-confidence active POI to operational", () => {
    const state = deriveOperationalState({ category: "hospital", status: "active", confidence: 90 });
    expect(state).toBe("operational");
  });
});

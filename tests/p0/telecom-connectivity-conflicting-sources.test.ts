import { describe, expect, it } from "vitest";
import { isConflictingUpdate, shouldApplyConflictingUpdate, type ConnectivitySnapshot } from "@/lib/connectivity/telecomConnectivityService";

/**
 * Dos fuentes distintas reportando estados incompatibles para la misma
 * region (spec ARGUS v1.0.3.6 §16/§20 escenario "conflicto entre
 * operadores"): produce un conflicto detectado en vez de sobrescribir en
 * silencio, y la fuente de menor confianza no reemplaza al estado resuelto.
 */

function snapshot(overrides: Partial<ConnectivitySnapshot> = {}): ConnectivitySnapshot {
  return {
    roamingType: "roaming_emergencia",
    networkState: "normal",
    endedAt: null,
    sourceName: "subtel_communique",
    confidence: 80,
    lastUpdatedAt: new Date("2026-07-17T10:00:00Z"),
    ...overrides,
  };
}

describe("isConflictingUpdate", () => {
  it("misma fuente actualizando su propio reporte -> nunca es conflicto", () => {
    const previous = snapshot({ sourceName: "subtel_communique" });
    const next = snapshot({ sourceName: "subtel_communique", networkState: "degraded", lastUpdatedAt: new Date("2026-07-17T11:00:00Z") });
    expect(isConflictingUpdate(previous, next, new Date("2026-07-17T11:00:00Z"))).toBe(false);
  });

  it("fuentes distintas reportando estados incompatibles dentro de la ventana -> conflicto", () => {
    const previous = snapshot({ sourceName: "entel", networkState: "outage" });
    const next = snapshot({ sourceName: "movistar", networkState: "normal", lastUpdatedAt: new Date("2026-07-17T10:30:00Z") });
    expect(isConflictingUpdate(previous, next, new Date("2026-07-17T11:00:00Z"))).toBe(true);
  });

  it("fuentes distintas pero de acuerdo en el estado -> no es conflicto", () => {
    const previous = snapshot({ sourceName: "entel", networkState: "outage", roamingType: "roaming_emergencia" });
    const next = snapshot({ sourceName: "movistar", networkState: "outage", roamingType: "roaming_emergencia", lastUpdatedAt: new Date("2026-07-17T10:30:00Z") });
    expect(isConflictingUpdate(previous, next, new Date("2026-07-17T11:00:00Z"))).toBe(false);
  });

  it("fuera de la ventana de 6h -> ya no cuenta como conflicto (es una actualizacion legitima posterior)", () => {
    const previous = snapshot({ sourceName: "entel", networkState: "outage", lastUpdatedAt: new Date("2026-07-17T00:00:00Z") });
    const next = snapshot({ sourceName: "movistar", networkState: "normal", lastUpdatedAt: new Date("2026-07-17T10:00:00Z") });
    expect(isConflictingUpdate(previous, next, new Date("2026-07-17T10:00:00Z"))).toBe(false);
  });

  it("sin registro previo -> nunca es conflicto", () => {
    expect(isConflictingUpdate(null, snapshot())).toBe(false);
  });
});

describe("shouldApplyConflictingUpdate", () => {
  it("la fuente nueva con mayor o igual confianza reemplaza al estado resuelto", () => {
    const previous = snapshot({ confidence: 60 });
    const next = snapshot({ confidence: 80 });
    expect(shouldApplyConflictingUpdate(previous, next)).toBe(true);
  });

  it("la fuente nueva con menor confianza NO sobrescribe en silencio el estado resuelto", () => {
    const previous = snapshot({ confidence: 90 });
    const next = snapshot({ confidence: 40 });
    expect(shouldApplyConflictingUpdate(previous, next)).toBe(false);
  });
});

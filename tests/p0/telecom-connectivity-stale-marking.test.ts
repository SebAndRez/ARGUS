import { describe, expect, it } from "vitest";
import { computeConnectivityStaleness, CONNECTIVITY_STALE_AFTER_HOURS } from "@/lib/connectivity/telecomConnectivityService";

/**
 * Vigencia de conectividad de emergencia (spec ARGUS v1.0.3.6 §20 escenario
 * D): un dato no confirmado dentro de la ventana de TTL se marca
 * `isStale`, nunca se sigue presentando como estado actual confirmado.
 */

describe("computeConnectivityStaleness", () => {
  it("dentro de la ventana -> no vencido", () => {
    const now = new Date("2026-07-17T12:00:00Z");
    const lastUpdatedAt = new Date("2026-07-17T06:00:00Z"); // 6h antes
    expect(computeConnectivityStaleness({ lastUpdatedAt, now })).toBe(false);
  });

  it(`justo despues de ${CONNECTIVITY_STALE_AFTER_HOURS}h -> vencido`, () => {
    const now = new Date("2026-07-17T12:00:00Z");
    const lastUpdatedAt = new Date(now.getTime() - (CONNECTIVITY_STALE_AFTER_HOURS + 1) * 3_600_000);
    expect(computeConnectivityStaleness({ lastUpdatedAt, now })).toBe(true);
  });

  it(`justo antes de ${CONNECTIVITY_STALE_AFTER_HOURS}h -> aun vigente`, () => {
    const now = new Date("2026-07-17T12:00:00Z");
    const lastUpdatedAt = new Date(now.getTime() - (CONNECTIVITY_STALE_AFTER_HOURS - 1) * 3_600_000);
    expect(computeConnectivityStaleness({ lastUpdatedAt, now })).toBe(false);
  });
});

import { describe, expect, it, vi } from "vitest";

/**
 * Vigencia de datos operacionales de refugios (spec ARGUS v1.0.3.4 §17):
 * un dato vencido se marca `isStale`, nunca se borra ni se pone en 0/false.
 * Solo se ejercita la funcion pura `computeShelterStaleness` (no
 * `sweepShelterStaleness`, que si toca la base de datos); `@/lib/prisma`
 * se mockea porque el modulo lo importa a nivel de carga.
 */
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { computeShelterStaleness, FIELD_TTL_HOURS } from "@/lib/criticalPoi/shelterStatusLifecycle";

describe("computeShelterStaleness", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");

  it("dato recien actualizado: no esta vencido en ningun campo", () => {
    const result = computeShelterStaleness({ lastUpdatedAt: now, now });
    expect(result.isStale).toBe(false);
    expect(result.staleFields).toEqual([]);
  });

  it("pasada la ventana de ocupacion (6h) pero no la de estado (24h): isStale=true, solo occupancy en staleFields", () => {
    const lastUpdatedAt = new Date(now.getTime() - 8 * 60 * 60 * 1000);
    const result = computeShelterStaleness({ lastUpdatedAt, now });
    expect(result.isStale).toBe(true);
    expect(result.staleFields).toEqual(["occupancy"]);
  });

  it("pasada la ventana de capacidad (14 dias): todos los campos salvo direccion estan vencidos", () => {
    const lastUpdatedAt = new Date(now.getTime() - (FIELD_TTL_HOURS.capacity + 1) * 60 * 60 * 1000);
    const result = computeShelterStaleness({ lastUpdatedAt, now });
    expect(result.isStale).toBe(true);
    expect(result.staleFields).toEqual(
      expect.arrayContaining(["occupancy", "shelterStatus", "services", "capacity"])
    );
    expect(result.staleFields).not.toContain("address");
  });

  it("justo en el umbral (no superado) no cuenta como vencido", () => {
    const lastUpdatedAt = new Date(now.getTime() - FIELD_TTL_HOURS.occupancy * 60 * 60 * 1000);
    const result = computeShelterStaleness({ lastUpdatedAt, now });
    expect(result.staleFields).not.toContain("occupancy");
  });
});

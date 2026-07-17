import { describe, expect, it, vi } from "vitest";

/**
 * Estados de capacidad derivados (spec ARGUS v1.0.3.4 §6): disponible,
 * capacidad baja, lleno, sin informacion. Nunca se inventa un numero
 * cuando falta capacidad u ocupacion.
 *
 * `deriveCapacity` vive en `shelterOperationalStatusService.ts`, que
 * importa `@/lib/prisma` a nivel de modulo — se mockea para que este test
 * puramente funcional no dependa de `DATABASE_URL` ni de una conexion real.
 */
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { deriveCapacity } from "@/lib/criticalPoi/shelterOperationalStatusService";

describe("deriveCapacity", () => {
  it("sin capacidad ni ocupacion -> unknown, sin valores derivados", () => {
    const result = deriveCapacity(undefined, undefined);
    expect(result).toEqual({ capacityStatus: "unknown" });
  });

  it("con capacidad pero sin ocupacion -> unknown (nunca asume 0 ocupados)", () => {
    const result = deriveCapacity(100, undefined);
    expect(result.capacityStatus).toBe("unknown");
    expect(result.capacityAvailable).toBeUndefined();
  });

  it("ocupacion baja -> ok", () => {
    const result = deriveCapacity(100, 30);
    expect(result.capacityStatus).toBe("ok");
    expect(result.capacityAvailable).toBe(70);
    expect(result.occupancyPercentage).toBeCloseTo(0.3);
  });

  it("ocupacion >= 85% -> near_capacity", () => {
    const result = deriveCapacity(100, 85);
    expect(result.capacityStatus).toBe("near_capacity");
  });

  it("ocupacion >= 100% -> full, cupos disponibles nunca negativos", () => {
    const result = deriveCapacity(100, 130);
    expect(result.capacityStatus).toBe("full");
    expect(result.capacityAvailable).toBe(0);
  });

  it("capacidad total 0 -> unknown (dato invalido, no se usa para dividir)", () => {
    const result = deriveCapacity(0, 0);
    expect(result.capacityStatus).toBe("unknown");
  });
});

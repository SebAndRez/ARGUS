import { describe, expect, it } from "vitest";
import { computeOverallHealth, isStale, type ComponentHealth } from "../../src/lib/observability/healthStatus";

/**
 * ARGUS Prompt 19 §40 — 10 casos de salud. Los casos 8-10 (respuesta vacía
 * válida de una fuente, Source Health vencido, error de endpoint) se
 * ejercitan en `operationsSnapshot.test.ts` y en el propio endpoint, porque
 * dependen de I/O que `computeOverallHealth` — deliberadamente pura — no
 * conoce.
 */

function health(status: ComponentHealth["status"], component = "c"): ComponentHealth {
  return { component, status };
}

describe("computeOverallHealth — 10 casos (Prompt 19 §40)", () => {
  it("Caso 1 — sistema saludable: todos los componentes críticos recientes → healthy", () => {
    expect(computeOverallHealth([health("healthy", "persistence")], [health("healthy", "sources")])).toBe("healthy");
  });

  it("Caso 2 — base inaccesible (crítico unavailable) → unavailable", () => {
    expect(computeOverallHealth([health("unavailable", "persistence")], [health("healthy", "sources")])).toBe("unavailable");
  });

  it("Caso 3 — Redis ausente y crítico para jobs → degraded (importante unavailable degrada, no tumba)", () => {
    expect(computeOverallHealth([health("healthy", "persistence")], [health("unavailable", "distributed_backend")])).toBe(
      "degraded"
    );
  });

  it("Caso 4 — fuente secundaria caída (importante degraded) → degraded, no unavailable", () => {
    expect(computeOverallHealth([health("healthy", "persistence")], [health("degraded", "sources")])).toBe("degraded");
  });

  it("Caso 5 — fuente deshabilitada no se considera fallo → healthy si el resto está sano", () => {
    expect(computeOverallHealth([health("healthy", "persistence")], [health("disabled", "sources")])).toBe("healthy");
  });

  it("Caso 6 — sin evidencia suficiente → unknown, nunca healthy", () => {
    expect(computeOverallHealth([health("healthy", "persistence")], [health("unknown", "sources")])).toBe("unknown");
  });

  it("Caso 7 — job atrasado (crítico degraded, no unavailable) → degraded, problema activo", () => {
    expect(computeOverallHealth([health("degraded", "pipeline_global-watch")], [])).toBe("degraded");
  });

  it("componente crítico misconfigured → misconfigured (aunque otro crítico esté healthy)", () => {
    expect(computeOverallHealth([health("healthy", "persistence"), health("misconfigured", "platform")], [])).toBe(
      "misconfigured"
    );
  });

  it("unavailable crítico tiene precedencia sobre misconfigured crítico", () => {
    expect(computeOverallHealth([health("unavailable", "persistence"), health("misconfigured", "platform")], [])).toBe(
      "unavailable"
    );
  });

  it("sin componentes evaluados → unknown, nunca healthy por defecto", () => {
    expect(computeOverallHealth([], [])).toBe("unknown");
  });
});

describe("isStale", () => {
  it("sin último éxito registrado, siempre se considera vencido", () => {
    expect(isStale(null, 1000, new Date())).toBe(true);
  });

  it("dentro de la ventana no está vencido", () => {
    const now = new Date("2026-07-15T12:00:00.000Z");
    const lastSuccess = new Date("2026-07-15T11:50:00.000Z");
    expect(isStale(lastSuccess, 15 * 60_000, now)).toBe(false);
  });

  it("fuera de la ventana está vencido", () => {
    const now = new Date("2026-07-15T12:00:00.000Z");
    const lastSuccess = new Date("2026-07-15T11:00:00.000Z");
    expect(isStale(lastSuccess, 15 * 60_000, now)).toBe(true);
  });
});

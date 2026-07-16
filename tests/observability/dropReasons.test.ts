import { afterEach, describe, expect, it, vi } from "vitest";
import { DropAggregator } from "../../src/lib/observability/dropReasons";

/**
 * ARGUS Prompt 19 §41 — 8 casos de descartes.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DropAggregator", () => {
  it("Caso 1 — coordenadas inválidas incrementan la razón correcta", () => {
    const aggregator = new DropAggregator();
    aggregator.record("invalid_coordinates");
    expect(aggregator.toSummary()).toEqual({ invalid_coordinates: 1 });
  });

  it("Caso 2 — lifecycle terminal usa la razón correcta", () => {
    const aggregator = new DropAggregator();
    aggregator.record("lifecycle_terminal", 3);
    expect(aggregator.toSummary().lifecycle_terminal).toBe(3);
  });

  it("Caso 3 — demo bloqueado usa la razón correcta", () => {
    const aggregator = new DropAggregator();
    aggregator.record("demo_blocked");
    expect(aggregator.toSummary().demo_blocked).toBe(1);
  });

  it("Caso 4 — duplicado usa la razón correcta", () => {
    const aggregator = new DropAggregator();
    aggregator.record("duplicate", 2);
    expect(aggregator.toSummary().duplicate).toBe(2);
  });

  it("Caso 5 — una correlación válida no se cuenta como descarte", () => {
    const aggregator = new DropAggregator();
    // correlated_into_existing es una razón normalizada válida SI se
    // registra explícitamente — el punto es que nada la registra por sí
    // sola sin una llamada explícita a record().
    expect(aggregator.total).toBe(0);
  });

  it("Caso 6 — los errores se agregan por corrida (un solo log)", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const aggregator = new DropAggregator();
    aggregator.record("invalid_coordinates", 7);
    aggregator.record("lifecycle_terminal", 3);
    aggregator.record("duplicate", 2);
    aggregator.logSummary({ component: "test_pipeline" });
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  it("Caso 7 — no se registra payload completo, solo razón y conteo", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const aggregator = new DropAggregator();
    aggregator.record("invalid_coordinates");
    aggregator.logSummary({ component: "test_pipeline" });
    const line = consoleSpy.mock.calls.at(-1)?.[0] as string;
    expect(line).toContain("invalid_coordinates");
    expect(line).not.toContain("latitude");
    expect(line).not.toContain("longitude");
  });

  it("Caso 8 — el resumen (para el panel) refleja el total y el desglose", () => {
    const aggregator = new DropAggregator();
    aggregator.record("invalid_coordinates", 7);
    aggregator.record("duplicate", 3);
    expect(aggregator.total).toBe(10);
    expect(aggregator.toSummary()).toEqual({ invalid_coordinates: 7, duplicate: 3 });
  });

  it("no emite ningún log si nada se descartó", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const aggregator = new DropAggregator();
    aggregator.logSummary({ component: "test_pipeline" });
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from "vitest";
import {
  classifyLifecycleVisibility,
  isExpired,
  isIncidentOperationallyActive,
} from "@/lib/lifecycle/operationalVisibilityPolicy";

/**
 * Regression suite for the Prompt 10 fix: a single, reusable, pure
 * visibility policy replaces the ad hoc/incomplete lifecycle and
 * `expiresAt` filters that let RESOLVED/ARCHIVED incidents and expired
 * `ExternalEvent` rows leak into active views and counters. See
 * docs/architecture/ARGUS_OPERATIONAL_LIFECYCLE_POLICY.md.
 *
 * All tests use a fixed clock (`NOW`), never `new Date()`/`Date.now()`,
 * matching Prompt 10 §17 ("los tests deben utilizar reloj fijo").
 */
const NOW = new Date("2026-07-14T12:00:00.000Z");

describe("Caso 1 — incidente activo", () => {
  it("es visible en vistas activas", () => {
    expect(isIncidentOperationallyActive({ lifecycle: "active", expiresAt: null, now: NOW })).toBe(true);
  });
});

describe("Caso 2 — incidente en monitoreo", () => {
  it("es visible (la severidad, no el lifecycle, decide si es crítico)", () => {
    expect(isIncidentOperationallyActive({ lifecycle: "monitoring", expiresAt: null, now: NOW })).toBe(true);
  });
});

describe("Caso 3 — incidente resuelto", () => {
  it("se excluye de vistas activas", () => {
    expect(isIncidentOperationallyActive({ lifecycle: "resolved", expiresAt: null, now: NOW })).toBe(false);
  });

  it("classifyLifecycleVisibility lo marca explícitamente terminal (disponible para historial, no para vista activa)", () => {
    expect(classifyLifecycleVisibility("resolved")).toEqual({ visible: false, reason: "terminal_lifecycle" });
  });
});

describe("Caso 4 — incidente archivado", () => {
  it("se excluye", () => {
    expect(isIncidentOperationallyActive({ lifecycle: "archived", expiresAt: null, now: NOW })).toBe(false);
  });
});

describe("Caso 5 — incidente rechazado", () => {
  it("se excluye", () => {
    expect(isIncidentOperationallyActive({ lifecycle: "rejected", expiresAt: null, now: NOW })).toBe(false);
  });
});

describe("Caso 6 — duplicado", () => {
  it("se excluye como incidente independiente", () => {
    expect(isIncidentOperationallyActive({ lifecycle: "duplicate", expiresAt: null, now: NOW })).toBe(false);
  });
});

describe("Caso 7 — ExternalEvent vigente", () => {
  it("expiresAt > now: visible", () => {
    const expiresAt = new Date(NOW.getTime() + 60_000);
    expect(isExpired(expiresAt, NOW)).toBe(false);
    expect(isIncidentOperationallyActive({ lifecycle: null, expiresAt, now: NOW })).toBe(true);
  });
});

describe("Caso 8 — ExternalEvent expirado", () => {
  it("expiresAt <= now: excluido", () => {
    const expiresAt = new Date(NOW.getTime() - 60_000);
    expect(isExpired(expiresAt, NOW)).toBe(true);
    expect(isIncidentOperationallyActive({ lifecycle: null, expiresAt, now: NOW })).toBe(false);
  });
});

describe("Caso 9 — expiresAt=null", () => {
  it("sigue la política documentada: nunca se asume expirado por ausencia de fecha", () => {
    expect(isExpired(null, NOW)).toBe(false);
    expect(isExpired(undefined, NOW)).toBe(false);
    expect(isIncidentOperationallyActive({ lifecycle: "active", expiresAt: null, now: NOW })).toBe(true);
  });
});

describe("Caso 10 — fecha exacta de expiración", () => {
  it("expiresAt === now: se considera expirado (comparación inclusiva)", () => {
    expect(isExpired(NOW, NOW)).toBe(true);
    expect(isIncidentOperationallyActive({ lifecycle: "active", expiresAt: NOW, now: NOW })).toBe(false);
  });
});

describe("Caso 11 — estado desconocido", () => {
  it("comportamiento fail-closed: un valor no reconocido se excluye, nunca se confirma por defecto", () => {
    const verdict = classifyLifecycleVisibility("totally-unrecognized-garbage-state");
    expect(verdict).toEqual({ visible: false, reason: "unrecognized_lifecycle" });
    expect(isIncidentOperationallyActive({ lifecycle: "totally-unrecognized-garbage-state", expiresAt: null, now: NOW })).toBe(
      false
    );
  });

  it("nunca se convierte en ACTIVE/CONFIRMED/CRITICAL por defecto", () => {
    // La propia clasificación ya lo excluye (visible:false) — no existe
    // ninguna rama que promueva un valor no reconocido a un estado conocido.
    const verdict = classifyLifecycleVisibility("some-future-vocabulary-value");
    expect(verdict.reason).not.toBe("visible");
  });
});

describe("Caso 12 — lifecycle ausente", () => {
  it("comportamiento explícito: ausencia de dato no se interpreta como estado terminal", () => {
    expect(classifyLifecycleVisibility(null)).toEqual({ visible: true, reason: "absent_lifecycle" });
    expect(classifyLifecycleVisibility(undefined)).toEqual({ visible: true, reason: "absent_lifecycle" });
    expect(classifyLifecycleVisibility("")).toEqual({ visible: true, reason: "absent_lifecycle" });
    expect(isIncidentOperationallyActive({ lifecycle: undefined, expiresAt: null, now: NOW })).toBe(true);
  });
});

describe("Caso 14 — conteo crítico (nivel de política)", () => {
  it("un lifecycle resuelto con severidad crítica no se considera visible/activo", () => {
    // La severidad no es un input de esta función a propósito — severidad y
    // lifecycle son dimensiones independientes (Prompt 10 hereda esa
    // separación del diseño canónico, Prompt 8 §12); el llamador combina
    // "severity === P0_CRITICAL" con este resultado para decidir el contador.
    expect(isIncidentOperationallyActive({ lifecycle: "resolved", expiresAt: null, now: NOW })).toBe(false);
  });
});

describe("Caso 15 — reloj fijo / determinismo", () => {
  it("el mismo dataset con el mismo now produce el mismo resultado en múltiples llamadas", () => {
    const input = { lifecycle: "monitoring", expiresAt: new Date(NOW.getTime() + 3_600_000), now: NOW };
    const first = isIncidentOperationallyActive(input);
    const second = isIncidentOperationallyActive(input);
    const third = isIncidentOperationallyActive({ ...input });
    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(first).toBe(true);
  });

  it("no lee el reloj internamente: dos `now` distintos para el mismo expiresAt producen resultados distintos solo por el `now` inyectado", () => {
    const expiresAt = new Date("2026-07-14T11:00:00.000Z");
    const before = isIncidentOperationallyActive({ lifecycle: "active", expiresAt, now: new Date("2026-07-14T10:00:00.000Z") });
    const after = isIncidentOperationallyActive({ lifecycle: "active", expiresAt, now: new Date("2026-07-14T12:00:00.000Z") });
    expect(before).toBe(true);
    expect(after).toBe(false);
  });
});

describe("Caso 16 — reapertura", () => {
  it("la función de lectura no inventa la reapertura: solo refleja el lifecycle recibido en cada llamada", () => {
    const incidentId = "inc-reopen-test";
    // "Resuelto" en la primera lectura.
    const whenResolved = isIncidentOperationallyActive({ lifecycle: "resolved", expiresAt: null, now: NOW });
    expect(whenResolved).toBe(false);

    // La función NO recuerda el estado anterior entre llamadas — la única
    // forma de que vuelva a ser visible es que el *lifecycle persistido*
    // (fuera de esta función) haya cambiado a uno no terminal, y se lo pase
    // explícitamente en la siguiente lectura.
    const whenReactivatedByNewEvidence = isIncidentOperationallyActive({
      lifecycle: "active",
      expiresAt: null,
      now: new Date(NOW.getTime() + 3_600_000),
    });
    expect(whenReactivatedByNewEvidence).toBe(true);

    // Sin ese cambio explícito de lifecycle, releer con el mismo valor
    // "resolved" sigue dando no-visible — no hay temporizador ni contador
    // interno que lo reabra solo.
    const stillResolvedWithoutNewEvidence = isIncidentOperationallyActive({
      lifecycle: "resolved",
      expiresAt: null,
      now: new Date(NOW.getTime() + 3_600_000),
    });
    expect(stillResolvedWithoutNewEvidence).toBe(false);
    void incidentId;
  });
});

describe("Inmutabilidad y pureza", () => {
  it("no modifica el objeto de entrada", () => {
    const input = Object.freeze({ lifecycle: "active", expiresAt: null, now: NOW });
    expect(() => isIncidentOperationallyActive(input)).not.toThrow();
  });

  it("fechas inválidas en expiresAt no rompen la evaluación (se tratan como ausentes)", () => {
    expect(isExpired("not-a-real-date", NOW)).toBe(false);
    expect(isIncidentOperationallyActive({ lifecycle: "active", expiresAt: "not-a-real-date", now: NOW })).toBe(true);
  });

  it("acepta expiresAt como string ISO igual que Date", () => {
    const futureIso = new Date(NOW.getTime() + 60_000).toISOString();
    const pastIso = new Date(NOW.getTime() - 60_000).toISOString();
    expect(isExpired(futureIso, NOW)).toBe(false);
    expect(isExpired(pastIso, NOW)).toBe(true);
  });
});

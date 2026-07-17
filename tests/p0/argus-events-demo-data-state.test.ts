import { describe, expect, it } from "vitest";
import {
  ARGUS_EVENTS_LOADING_STATE,
  resolveArgusEventsDataState,
  type ArgusEventsSourceOutcome,
} from "@/lib/map/argusEventsDataState";
import type { ArgusEvent } from "@/types/argusEvent";

/**
 * DATA-FINAL-001 — the map's official-alerts layer (`argusEvents` in
 * `src/app/app/page.tsx`) used to seed its React state with `demoArgusEvents`
 * and fall back to it again on any fetch failure, bypassing
 * `isDemoDataAllowed()` entirely and sometimes concatenating real Chile
 * Alerts/VIGÍA events on top of that demo base. This suite locks in the
 * replacement state machine: demo can only ever come from the server's own
 * `source` field on `/api/argus/events`, real/demo never mix, and every
 * failure mode maps to an honest status instead of invented events.
 */

const SUCCESS = (events: ArgusEvent[]): ArgusEventsSourceOutcome => ({ status: "success", events });
const FAILED: ArgusEventsSourceOutcome = { status: "failed" };

function argusEvent(id: string, overrides: Partial<ArgusEvent> = {}): ArgusEvent {
  return {
    id,
    title: `Evento ${id}`,
    country: "CL",
    eventType: "WILDFIRE",
    severity: "high",
    status: "active",
    confidence: "high",
    sourceType: "official",
    sources: [],
    geometry: { type: "point", coordinates: [-33.45, -70.66] },
    geometryPrecision: "approximate_point",
    detectedAt: "2026-07-10T10:00:00.000Z",
    lastUpdated: "2026-07-10T10:00:00.000Z",
    attribution: "SENAPRED",
    operationalSummary: "Evento de prueba",
    isDemo: false,
    ...overrides,
  };
}

const demoEventFixture = argusEvent("demo-1", { isDemo: true });
const realArgusEvent = argusEvent("chile-alert-real-1");
const chileAlertEvent = argusEvent("chile-alert-real-2");
const vigiaEvent = argusEvent("vigia-real-1");

describe("ARGUS_EVENTS_LOADING_STATE", () => {
  it("Caso 1 — estado inicial: events vacío, status loading, nunca demo", () => {
    expect(ARGUS_EVENTS_LOADING_STATE.status).toBe("loading");
    expect(ARGUS_EVENTS_LOADING_STATE.events).toEqual([]);
    expect(ARGUS_EVENTS_LOADING_STATE.events.some((event) => event.isDemo)).toBe(false);
  });
});

describe("resolveArgusEventsDataState — producción (sin demo autorizada)", () => {
  it("Caso 2 — carga exitosa: solo eventos reales, status available", () => {
    const result = resolveArgusEventsDataState({
      base: { outcome: SUCCESS([realArgusEvent]), isDemo: false },
    });
    expect(result.status).toBe("available");
    expect(result.events).toEqual([realArgusEvent]);
    expect(result.events.some((event) => event.isDemo)).toBe(false);
  });

  it("Caso 3 — respuesta vacía válida: events vacío, status empty, no demo", () => {
    const result = resolveArgusEventsDataState({
      base: { outcome: SUCCESS([]), isDemo: false },
    });
    expect(result.status).toBe("empty");
    expect(result.events).toEqual([]);
  });

  it("Caso 4 — fallo total (las 3 fuentes fallan): events vacío, status unavailable, no demo", () => {
    const result = resolveArgusEventsDataState({
      base: { outcome: FAILED, isDemo: false },
      extras: [
        { label: "chile_alerts", outcome: FAILED },
        { label: "vigia_events", outcome: FAILED },
      ],
    });
    expect(result.status).toBe("unavailable");
    expect(result.events).toEqual([]);
    expect(result.failedSources).toEqual(["argus_events", "chile_alerts", "vigia_events"]);
  });

  it("fallo total sin siquiera intentar las fuentes adicionales también es unavailable", () => {
    const result = resolveArgusEventsDataState({ base: { outcome: FAILED, isDemo: false } });
    expect(result.status).toBe("unavailable");
    expect(result.events).toEqual([]);
  });

  it("Caso 5 — fallo parcial (Argus OK + Chile FAIL + VIGÍA OK): solo datos reales exitosos, status partial, no demo", () => {
    const result = resolveArgusEventsDataState({
      base: { outcome: SUCCESS([realArgusEvent]), isDemo: false },
      extras: [
        { label: "chile_alerts", outcome: FAILED },
        { label: "vigia_events", outcome: SUCCESS([vigiaEvent]) },
      ],
    });
    expect(result.status).toBe("partial");
    expect(result.events).toEqual([realArgusEvent, vigiaEvent]);
    expect(result.failedSources).toEqual(["chile_alerts"]);
    expect(result.events.some((event) => event.isDemo)).toBe(false);
  });

  it("fallo parcial con Argus caído pero Chile/VIGÍA reales disponibles: partial, nunca demo", () => {
    const result = resolveArgusEventsDataState({
      base: { outcome: FAILED, isDemo: false },
      extras: [
        { label: "chile_alerts", outcome: SUCCESS([chileAlertEvent]) },
        { label: "vigia_events", outcome: SUCCESS([vigiaEvent]) },
      ],
    });
    expect(result.status).toBe("partial");
    expect(result.events).toEqual([chileAlertEvent, vigiaEvent]);
    expect(result.failedSources).toEqual(["argus_events"]);
  });
});

describe("resolveArgusEventsDataState — demo", () => {
  it("Caso 6 — demo flag apagado (isDemo:false aunque el fixture exista en algún lado): no se usa, no se cuenta como demo", () => {
    const result = resolveArgusEventsDataState({
      base: { outcome: SUCCESS([realArgusEvent]), isDemo: false },
    });
    expect(result.status).not.toBe("demo");
    expect(result.events.every((event) => !event.isDemo)).toBe(true);
  });

  it("Caso 7 — demo flag encendido por el servidor: status demo, colección separada", () => {
    const result = resolveArgusEventsDataState({
      base: { outcome: SUCCESS([demoEventFixture]), isDemo: true },
    });
    expect(result.status).toBe("demo");
    expect(result.events).toEqual([demoEventFixture]);
    expect(result.failedSources).toEqual([]);
  });

  it("Caso 8 — demo + real: la implementación impide la mezcla automática (extras se ignoran cuando base es demo)", () => {
    const result = resolveArgusEventsDataState({
      base: { outcome: SUCCESS([demoEventFixture]), isDemo: true },
      extras: [
        { label: "chile_alerts", outcome: SUCCESS([chileAlertEvent]) },
        { label: "vigia_events", outcome: SUCCESS([vigiaEvent]) },
      ],
    });
    expect(result.status).toBe("demo");
    expect(result.events).toEqual([demoEventFixture]);
    expect(result.events.some((event) => event.id === chileAlertEvent.id)).toBe(false);
    expect(result.events.some((event) => event.id === vigiaEvent.id)).toBe(false);
  });
});

describe("Test de no mezcla (§26)", () => {
  it("en modo producción (isDemo:false) ningún evento demo puede aparecer en la colección final", () => {
    const result = resolveArgusEventsDataState({
      base: { outcome: FAILED, isDemo: false },
      extras: [
        { label: "chile_alerts", outcome: SUCCESS([chileAlertEvent]) },
        { label: "vigia_events", outcome: SUCCESS([vigiaEvent]) },
      ],
    });
    expect(result.events.some((event) => event.isDemo)).toBe(false);
    expect(result.events.some((event) => event.id === demoEventFixture.id)).toBe(false);
  });

  it("un fetch fallido de /api/argus/events nunca resuelve en status \"demo\" por sí solo", () => {
    const result = resolveArgusEventsDataState({ base: { outcome: FAILED, isDemo: false } });
    expect(result.status).not.toBe("demo");
  });
});

describe("Deduplicación", () => {
  it("no duplica IDs iguales entre la fuente base y las fuentes adicionales", () => {
    const shared = argusEvent("shared-id-1");
    const result = resolveArgusEventsDataState({
      base: { outcome: SUCCESS([shared]), isDemo: false },
      extras: [{ label: "chile_alerts", outcome: SUCCESS([shared, chileAlertEvent]) }],
    });
    expect(result.events.filter((event) => event.id === "shared-id-1")).toHaveLength(1);
    expect(result.events).toHaveLength(2);
  });
});

describe("Pureza (no muta entradas, determinista)", () => {
  it("no muta los arrays de entrada", () => {
    const baseEvents = [realArgusEvent];
    const extraEvents = [chileAlertEvent];
    const baseSnapshot = [...baseEvents];
    const extraSnapshot = [...extraEvents];
    resolveArgusEventsDataState({
      base: { outcome: SUCCESS(baseEvents), isDemo: false },
      extras: [{ label: "chile_alerts", outcome: SUCCESS(extraEvents) }],
    });
    expect(baseEvents).toEqual(baseSnapshot);
    expect(extraEvents).toEqual(extraSnapshot);
  });

  it("la misma entrada produce siempre el mismo resultado", () => {
    const input = {
      base: { outcome: SUCCESS([realArgusEvent]), isDemo: false } as const,
      extras: [{ label: "chile_alerts", outcome: SUCCESS([chileAlertEvent]) }],
    };
    const first = resolveArgusEventsDataState(input);
    const second = resolveArgusEventsDataState(input);
    expect(first).toEqual(second);
  });
});

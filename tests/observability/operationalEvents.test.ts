import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logOperationalEvent } from "../../src/lib/observability/operationalEvents";
import { getRecentIssues, resetRecentIssuesForTests } from "../../src/lib/observability/recentIssuesBuffer";

/**
 * ARGUS Prompt 19 §38 — 12 casos obligatorios del logger estructurado
 * central. Captura la salida real de `console.*` en vez de asumir el
 * formato, para que un cambio accidental de shape rompa el test.
 */

function captureConsole() {
  return {
    debug: vi.spyOn(console, "debug").mockImplementation(() => undefined),
    info: vi.spyOn(console, "info").mockImplementation(() => undefined),
    warn: vi.spyOn(console, "warn").mockImplementation(() => undefined),
    error: vi.spyOn(console, "error").mockImplementation(() => undefined),
  };
}

function lastLoggedPayload(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const call = spy.mock.calls.at(-1);
  const line = call?.[0] as string;
  const jsonStart = line.indexOf("{");
  return JSON.parse(line.slice(jsonStart));
}

beforeEach(() => {
  resetRecentIssuesForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetRecentIssuesForTests();
});

describe("logOperationalEvent — 12 casos (Prompt 19 §38)", () => {
  it("Caso 1 — formato estructurado (objeto serializable, no texto libre)", () => {
    const spies = captureConsole();
    logOperationalEvent({ event: "test_event", level: "info", component: "test" });
    const payload = lastLoggedPayload(spies.info);
    expect(payload).toMatchObject({ event: "test_event", component: "test" });
  });

  it("Caso 2 — timestamp válido ISO-8601", () => {
    const spies = captureConsole();
    logOperationalEvent({ event: "e", level: "info", component: "c" });
    const payload = lastLoggedPayload(spies.info);
    expect(Number.isFinite(new Date(payload.timestamp as string).getTime())).toBe(true);
  });

  it("Caso 3 — nivel válido (info/warn/error enrutan al console.* correcto)", () => {
    const spies = captureConsole();
    logOperationalEvent({ event: "e", level: "warn", component: "c" });
    logOperationalEvent({ event: "e", level: "error", component: "c" });
    expect(spies.warn).toHaveBeenCalledTimes(1);
    expect(spies.error).toHaveBeenCalledTimes(1);
    expect(spies.info).not.toHaveBeenCalled();
  });

  it("Caso 4 — requestId propagado", () => {
    const spies = captureConsole();
    logOperationalEvent({ event: "e", level: "info", component: "c", requestId: "req-123" });
    expect(lastLoggedPayload(spies.info).requestId).toBe("req-123");
  });

  it("Caso 5 — runId propagado", () => {
    const spies = captureConsole();
    logOperationalEvent({ event: "e", level: "info", component: "c", runId: "run-abc" });
    expect(lastLoggedPayload(spies.info).runId).toBe("run-abc");
  });

  it("Caso 6 — campos undefined se omiten (no aparecen como null ni como clave)", () => {
    const spies = captureConsole();
    logOperationalEvent({ event: "e", level: "info", component: "c", requestId: undefined, sourceId: undefined });
    const payload = lastLoggedPayload(spies.info);
    expect("requestId" in payload).toBe(false);
    expect("sourceId" in payload).toBe(false);
  });

  it("Caso 7 — secretos redactados en `detail`", () => {
    const spies = captureConsole();
    logOperationalEvent({ event: "e", level: "info", component: "c", detail: { password: "hunter2", secret: "abc" } });
    const payload = lastLoggedPayload(spies.info);
    expect((payload.detail as Record<string, unknown>).password).toBe("[redacted]");
    expect((payload.detail as Record<string, unknown>).secret).toBe("[redacted]");
  });

  it("Caso 8 — tokens no aparecen en el texto emitido", () => {
    const spies = captureConsole();
    logOperationalEvent({ event: "e", level: "info", component: "c", detail: { token: "eyJraddasd", apiKey: "sk-live-123" } });
    const line = spies.info.mock.calls.at(-1)?.[0] as string;
    expect(line).not.toContain("eyJraddasd");
    expect(line).not.toContain("sk-live-123");
  });

  it("Caso 9 — correos no aparecen completos", () => {
    const spies = captureConsole();
    logOperationalEvent({ event: "e", level: "info", component: "c", detail: { email: "user@example.com" } });
    const line = spies.info.mock.calls.at(-1)?.[0] as string;
    expect(line).not.toContain("user@example.com");
  });

  it("Caso 10 — payloads grandes/anidados no se serializan sin límite", () => {
    const spies = captureConsole();
    const bigArray = Array.from({ length: 500 }, (_, i) => i);
    logOperationalEvent({ event: "e", level: "info", component: "c", detail: { items: bigArray } });
    const payload = lastLoggedPayload(spies.info);
    expect((payload.detail as { items: number[] }).items.length).toBeLessThanOrEqual(50);
  });

  it("Caso 11 — errorCode normalizado viaja como campo propio", () => {
    const spies = captureConsole();
    logOperationalEvent({ event: "e", level: "error", component: "c", errorCode: "DATA_UNAVAILABLE" });
    expect(lastLoggedPayload(spies.error).errorCode).toBe("DATA_UNAVAILABLE");
  });

  it("Caso 12 — no muta el objeto de entrada", () => {
    captureConsole();
    const input = { event: "e", level: "info" as const, component: "c", detail: { password: "x" } };
    const snapshot = JSON.parse(JSON.stringify(input));
    logOperationalEvent(input);
    expect(input).toEqual(snapshot);
  });
});

describe("logOperationalEvent — efectos secundarios de nivel warn/error", () => {
  it("empuja a recentIssuesBuffer en warn/error, no en info/debug", () => {
    captureConsole();
    logOperationalEvent({ event: "info_event", level: "info", component: "c" });
    logOperationalEvent({ event: "warn_event", level: "warn", component: "c" });
    logOperationalEvent({ event: "error_event", level: "error", component: "c" });
    const recent = getRecentIssues();
    expect(recent.map((e) => e.event)).toEqual(["warn_event", "error_event"]);
  });
});

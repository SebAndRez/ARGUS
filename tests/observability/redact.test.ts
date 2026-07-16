import { describe, expect, it } from "vitest";
import { redactForLog } from "../../src/lib/observability/redact";

describe("redactForLog", () => {
  it("redacta claves sensibles conocidas, sin importar el valor", () => {
    const input = {
      password: "hunter2",
      token: "abc",
      secret: "xyz",
      apiKey: "sk-123",
      authorization: "Bearer abc",
      cookie: "session=abc",
      governmentId: "12.345.678-9",
      email: "user@example.com",
      phone: "+56912345678",
      medical: "bloodType=O+",
    };
    const output = redactForLog(input) as Record<string, unknown>;
    for (const key of Object.keys(input)) {
      expect(output[key]).toBe("[redacted]");
    }
  });

  it("no redacta identificadores internos comunes (id, sourceId, runId, requestId, incidentId, moduleId)", () => {
    const input = { id: "a1", sourceId: "usgs", runId: "run-1", requestId: "req-1", incidentId: "inc-1", moduleId: "argus-hermes" };
    expect(redactForLog(input)).toEqual(input);
  });

  it("redacta recursivamente dentro de objetos anidados", () => {
    const input = { user: { credentials: { password: "hunter2" } } };
    const output = redactForLog(input) as { user: { credentials: { password: string } } };
    expect(output.user.credentials.password).toBe("[redacted]");
  });

  it("redacta dentro de arreglos de objetos", () => {
    const input = [{ token: "a" }, { token: "b" }];
    const output = redactForLog(input) as Array<{ token: string }>;
    expect(output[0].token).toBe("[redacted]");
    expect(output[1].token).toBe("[redacted]");
  });

  it("acota arreglos grandes en vez de redactarlos por completo", () => {
    const input = Array.from({ length: 100 }, (_, i) => i);
    const output = redactForLog(input) as number[];
    expect(output.length).toBeLessThanOrEqual(50);
  });

  it("acota la profundidad de recursión", () => {
    let deep: Record<string, unknown> = { leaf: "value" };
    for (let i = 0; i < 10; i += 1) deep = { nested: deep };
    const output = redactForLog(deep);
    expect(JSON.stringify(output)).toContain("max-depth");
  });

  it("no muta el objeto de entrada", () => {
    const input = { password: "hunter2", nested: { token: "abc" } };
    const snapshot = JSON.parse(JSON.stringify(input));
    redactForLog(input);
    expect(input).toEqual(snapshot);
  });

  it("preserva valores primitivos y null/undefined tal cual", () => {
    expect(redactForLog(42)).toBe(42);
    expect(redactForLog("hello")).toBe("hello");
    expect(redactForLog(null)).toBe(null);
    expect(redactForLog(undefined)).toBe(undefined);
  });

  it("convierte instancias de Date a ISO string", () => {
    const date = new Date("2026-07-15T12:00:00.000Z");
    expect(redactForLog(date)).toBe("2026-07-15T12:00:00.000Z");
  });
});

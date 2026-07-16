import { describe, expect, it } from "vitest";
import { classifySeverityFromLevel } from "@/lib/weather/severeWeatherClassifier";
import { severityFromTipoAlerta } from "@/lib/adapters/senapred/senapredEventosAdapter";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/weather/__tests__/severeWeatherClassifier.test.ts` (a
 * `runSevereWeatherClassifierTest()` export Vitest never ran).
 *
 * Covers audit P0-4: `senapredEventosAdapter` (live map path,
 * `/api/argus/events`) and `alertPromotionEngine` (via
 * `classifySeverityFromLevel` directly) must never classify the same
 * SENAPRED `tipoAlerta.nombre` text with two different severities.
 *
 * Also covers the follow-up review: "Alerta Naranja" defaults to `high`
 * (same tier as "Alerta Amarilla"), NOT `critical` — there is no product
 * sign-off yet on which additional-context keywords (evacuación, personas
 * atrapadas, daño estructural, amenaza directa, instrucción oficial crítica)
 * would justify escalating a specific Naranja alert, and the classifier only
 * receives the short level label here, not the alert body, so it can't
 * check for them anyway.
 */
describe("classifySeverityFromLevel", () => {
  it("Alerta Roja is critical", () => {
    expect(classifySeverityFromLevel("Alerta Roja")).toBe("critical");
  });

  it("Alerta Naranja is high (not critical)", () => {
    expect(classifySeverityFromLevel("Alerta Naranja")).toBe("high");
  });

  it("Alerta Amarilla is also high (same tier as Naranja)", () => {
    expect(classifySeverityFromLevel("Alerta Amarilla")).toBe("high");
  });

  it("Alerta Temprana Preventiva is medium", () => {
    expect(classifySeverityFromLevel("Alerta Temprana Preventiva")).toBe("medium");
  });

  it("Alerta Verde is low", () => {
    expect(classifySeverityFromLevel("Alerta Verde")).toBe("low");
  });
});

describe("severityFromTipoAlerta — parity with classifySeverityFromLevel", () => {
  it.each([
    ["Alerta Roja", "critical"],
    ["Alerta Naranja", "high"],
    ["Alerta Amarilla", "high"],
    ["Alerta Temprana Preventiva", "medium"],
    ["Alerta Verde", "low"],
  ] as const)("%s → %s, matching the classifier exactly", (level, expected) => {
    expect(severityFromTipoAlerta(level)).toBe(expected);
    expect(severityFromTipoAlerta(level)).toBe(classifySeverityFromLevel(level));
  });
});

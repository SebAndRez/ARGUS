import { describe, expect, it } from "vitest";
import { calculateHermesRoutes } from "../../src/modules/hermes/hermesRouting";
import { hermesDemoBlockages } from "../../src/modules/hermes/data";
import type { HermesRoutingInput } from "../../src/modules/hermes/types";

/**
 * ARGUS Prompt 18 — HERMES stabilization. HERMES's routing *geometry* is
 * always simulated (reuses `getMockRoutes`), regardless of how real the
 * blockage/risk-zone input is — the module must never let that fact go
 * unlabeled, and the demo blockage fallback must be visible, not silent.
 */

function baseInput(overrides: Partial<HermesRoutingInput> = {}): HermesRoutingInput {
  return {
    origin: { lat: -33.45, lng: -70.66 },
    destination: { lat: -33.5, lng: -70.7 },
    mobilityMode: "car",
    purpose: "safe_navigation",
    ...overrides,
  };
}

describe("HERMES — la geometría de ruta siempre queda marcada como demo", () => {
  it("cada ruta devuelta trae isDemo: true, sin importar si hay bloqueos reales", async () => {
    const routes = await calculateHermesRoutes(baseInput({ blockages: [] }));
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(route.isDemo).toBe(true);
    }
  });

  it("con bloqueos reales de VIGÍA como input, la geometría sigue siendo demo (solo el scoring cambia)", async () => {
    const routes = await calculateHermesRoutes(
      baseInput({
        blockages: [
          {
            id: "vigia-blockage-1",
            type: "flood",
            status: "confirmed",
            severity: "high",
            location: { lat: -33.46, lng: -70.67 },
            sourceModule: "VIGIA",
            sourceId: "report-1",
            confidence: "verified",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      })
    );
    expect(routes.every((route) => route.isDemo === true)).toBe(true);
  });
});

describe("HERMES — el fallback a bloqueos demo es real, y el propio fixture está marcado como tal", () => {
  it("hermesDemoBlockages no está vacío (existe algo con lo que caer)", () => {
    expect(hermesDemoBlockages.length).toBeGreaterThan(0);
  });

  it("los bloqueos demo declaran su propia fuente como MANUAL, nunca se hacen pasar por VIGÍA/ORÁCULO reales", () => {
    for (const blockage of hermesDemoBlockages) {
      expect(blockage.sourceModule).toBe("MANUAL");
    }
  });
});

describe("HERMES — el scoring/explicación es determinístico (no Math.random)", () => {
  it("la misma entrada produce el mismo puntaje y explicación en dos llamadas sucesivas", async () => {
    const input = baseInput({ blockages: hermesDemoBlockages });
    const [first] = await calculateHermesRoutes(input);
    const [second] = await calculateHermesRoutes(input);
    expect(first.routeScore).toBe(second.routeScore);
    expect(first.safetyScore).toBe(second.safetyScore);
    expect(first.explanation).toBe(second.explanation);
  });
});

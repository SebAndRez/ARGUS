import { describe, expect, it } from "vitest";
import { withEnv } from "../helpers/withEnv";
import { getCommandCenterIncidents } from "../../src/lib/command/incidentBuilder";
import { buildIncidentFromSensorSafetyDetection } from "../../src/lib/sensor-safety/sensorSafetyIncidentAdapter";
import type { SensorSafetyDetection } from "../../src/types/sensorSafety";

/**
 * Regression suite for the Prompt 6 fix: `/api/incidents` and
 * `/api/command/overview` (and the client-rendered `CommandCenterPanel`)
 * have no real operational incident source connected — everything they can
 * return is demo/synthetic/in-memory. `getCommandCenterIncidents()` is the
 * single fail-closed choke point, reusing `isDemoDataAllowed()`
 * (src/lib/security/productionGuard.ts) rather than a second variable.
 *
 * No mocks of Prisma/network needed: none of the sources involved touch
 * either (confirmed by reading src/lib/quakesense/quakesenseMemoryStore.ts,
 * src/lib/sensor-safety/sensorSafetyStore.ts, src/lib/mobile-safety/
 * mobileSafetyService.ts — all `globalThis`-backed, no I/O).
 */

function neutralDetection(): SensorSafetyDetection {
  return {
    id: "detection-neutral-1",
    deviceSessionIdHash: "hash-1",
    module: "SAFETY_CHECK",
    type: "HARD_FALL",
    status: "CHECK_IN_REQUIRED",
    detectedAt: new Date().toISOString(),
    confidence: 70,
    severity: "critical",
    appState: "OPEN",
    platform: "WEB_PWA",
    approximateLat: -33.4,
    approximateLng: -70.6,
    accuracyBand: "district",
    isDemo: false,
    argusSummary: "Reporte de verificacion interna sin palabras sensibles.",
    recommendedAction: "Revisar estado y confirmar con protocolo humano.",
  } as SensorSafetyDetection;
}

describe("getCommandCenterIncidents (Prompt 6 fail-closed Command Center gate)", () => {
  it("Caso 1 — produccion sin demo autorizado: incidents=[], operational=false, respuesta valida", () => {
    withEnv({ VERCEL_ENV: "production", NODE_ENV: undefined, ARGUS_ALLOW_DEMO_DATA: undefined }, () => {
      const result = getCommandCenterIncidents();
      expect(result.operational).toBe(false);
      expect(result.mode).toBe("demo-disabled");
      expect(result.incidents).toEqual([]);
      expect(typeof result.message).toBe("string");
    });
  });

  it("Caso 2 — aunque existan datos sinteticos internamente, no llegan a la respuesta en produccion", () => {
    withEnv({ VERCEL_ENV: "production" }, () => {
      // buildDemoIncidents()/las tiendas en memoria SI producirian datos si
      // se llamaran — la prueba es que el resultado publico sigue vacio.
      const result = getCommandCenterIncidents();
      expect(result.incidents.length).toBe(0);
    });
  });

  it("Caso 3 — demo explicitamente autorizado: datos disponibles, dataMode presente, nunca 'operational'", () => {
    withEnv({ VERCEL_ENV: "production", ARGUS_ALLOW_DEMO_DATA: "true" }, () => {
      const result = getCommandCenterIncidents();
      expect(result.mode).toBe("demo");
      expect(result.operational).toBe(false);
      expect(result.incidents.length).toBeGreaterThan(0);
      result.incidents.forEach((incident) => {
        expect(incident.dataMode).not.toBe("operational");
        expect(["synthetic", "demo", "runtime_placeholder"]).toContain(incident.dataMode);
        expect(incident.persistent).toBe(false);
        expect(incident.severityMode).toBe("simulated");
      });
    });
  });

  it("Caso 4 — clasificacion no depende de la palabra 'demo' en el texto", () => {
    const neutral = buildIncidentFromSensorSafetyDetection(neutralDetection());
    expect(neutral).not.toBeNull();
    // El titulo/summary no contienen "demo" en absoluto, y la clasificacion
    // sigue siendo runtime_placeholder porque el ORIGEN (store en memoria)
    // lo determina, no el texto.
    expect(neutral!.title.toLowerCase()).not.toContain("demo");
    expect(neutral!.argusSummary.toLowerCase()).not.toContain("demo");
    expect(neutral!.dataMode).toBe("runtime_placeholder");
    expect(neutral!.persistent).toBe(false);
  });

  it("Caso 5 — sin datos: coleccion vacia valida, sin excepciones", () => {
    withEnv({ VERCEL_ENV: "production" }, () => {
      expect(() => getCommandCenterIncidents()).not.toThrow();
      const result = getCommandCenterIncidents();
      expect(Array.isArray(result.incidents)).toBe(true);
    });
  });

  it("Caso 6 — elementos derivados de stores en memoria declaran persistent:false y dataMode runtime_placeholder", () => {
    withEnv({ ARGUS_ALLOW_DEMO_DATA: "true" }, () => {
      const result = getCommandCenterIncidents();
      const fromMemoryStores = result.incidents.filter((incident) => incident.type === "earthquake_sensor" || incident.type === "mobile_safety");
      fromMemoryStores.forEach((incident) => {
        expect(incident.persistent).toBe(false);
        expect(incident.dataMode).toBe("runtime_placeholder");
      });
    });
  });

  it("Caso 7 — sin acciones mutantes: las rutas de incidentes no exponen POST/PATCH/PUT/DELETE", async () => {
    const listRoute: Record<string, unknown> = await import("../../src/app/api/incidents/route");
    const idRoute: Record<string, unknown> = await import("../../src/app/api/incidents/[id]/route");
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(listRoute[method]).toBeUndefined();
      expect(idRoute[method]).toBeUndefined();
    }
  });

  it("Caso 8 — contadores: datos sinteticos bloqueados no aumentan indicadores", () => {
    withEnv({ VERCEL_ENV: "production" }, () => {
      const { incidents } = getCommandCenterIncidents();
      const priorityCounts = {
        P0_CRITICAL: incidents.filter((i) => i.priority === "P0_CRITICAL").length,
        P1_HIGH: incidents.filter((i) => i.priority === "P1_HIGH").length,
      };
      expect(incidents.length).toBe(0);
      expect(priorityCounts.P0_CRITICAL).toBe(0);
      expect(priorityCounts.P1_HIGH).toBe(0);
    });
  });

  it("Caso 9 — la politica depende del modo de datos, no del rol: la funcion no acepta ni consulta ningun rol", () => {
    // getCommandCenterIncidents() no recibe parametros — no hay forma de que
    // un operador/administrador pase un rol para saltarse la politica.
    expect(getCommandCenterIncidents.length).toBe(0);
    withEnv({ VERCEL_ENV: "production" }, () => {
      const asIfOperator = getCommandCenterIncidents();
      const asIfCitizen = getCommandCenterIncidents();
      expect(asIfOperator).toEqual(asIfCitizen);
      expect(asIfOperator.operational).toBe(false);
    });
  });
});

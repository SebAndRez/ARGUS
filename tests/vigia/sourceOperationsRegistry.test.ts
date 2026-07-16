import { describe, expect, it } from "vitest";
import {
  ARGUS_SOURCE_OPERATIONS_REGISTRY,
  BROKEN_CONSECUTIVE_FAILURES_THRESHOLD,
  EMPTY_HEALTH_SIGNAL,
  deriveSourceOperationalStatus,
  getSourceDefinition,
  toOperatorSourceHealth,
  toPublicSourceHealth,
  type ArgusSourceDefinition,
  type SourceHealthSignal,
} from "@/lib/vigia/sourceOperationsRegistry";

/**
 * ARGUS Prompt 16 — 20 casos obligatorios (§28), parte 1: taxonomía de
 * estado, derivación dinámica y proyecciones público/operador.
 */

const NOW = new Date("2026-07-14T12:00:00.000Z");

function definition(overrides: Partial<ArgusSourceDefinition> = {}): ArgusSourceDefinition {
  return {
    id: "fixture-source",
    name: "Fixture Source",
    category: "test",
    coverage: "global",
    role: "detection",
    executionMode: "scheduled",
    adapterStatus: "implemented",
    isOfficial: true,
    reliabilityScore: 80,
    requiredEnv: [],
    endpoint: "https://example.invalid/fixture",
    timeoutMs: 20_000,
    scheduler: { intervalMinutes: 15, owner: "test" },
    consumer: "KnowledgeIncident",
    notes: "fixture",
    ...overrides,
  };
}

function signal(overrides: Partial<SourceHealthSignal> = {}): SourceHealthSignal {
  return { ...EMPTY_HEALTH_SIGNAL, ...overrides };
}

describe("ARGUS_SOURCE_OPERATIONS_REGISTRY — inventario estructural", () => {
  it("no tiene ids duplicados", () => {
    const ids = ARGUS_SOURCE_OPERATIONS_REGISTRY.map((source) => source.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("toda fuente scheduled define scheduler.intervalMinutes", () => {
    for (const source of ARGUS_SOURCE_OPERATIONS_REGISTRY) {
      if (source.executionMode === "scheduled") {
        expect(source.scheduler, `${source.id} debería tener scheduler`).toBeDefined();
        expect(source.scheduler!.intervalMinutes).toBeGreaterThan(0);
      }
    }
  });

  it("ninguna fuente stub/disabled declara executionMode scheduled", () => {
    for (const source of ARGUS_SOURCE_OPERATIONS_REGISTRY) {
      if (source.adapterStatus === "stub") {
        expect(source.executionMode).not.toBe("scheduled");
      }
    }
  });
});

describe("deriveSourceOperationalStatus — 20 casos obligatorios (Prompt 16 §28)", () => {
  it("Caso 1 — fuente operativa: configurada + programada + ejecución exitosa reciente → operational", () => {
    const verdict = deriveSourceOperationalStatus(
      definition({ executionMode: "scheduled", scheduler: { intervalMinutes: 15, owner: "x" } }),
      signal({ lastAttemptAt: new Date(NOW.getTime() - 5 * 60_000), lastSuccessAt: new Date(NOW.getTime() - 5 * 60_000), consecutiveFailures: 0 }),
      NOW
    );
    expect(verdict.status).toBe("operational");
  });

  it("Caso 2 — adaptador implementado sin scheduler, nunca invocado → configured_not_scheduled (nunca operational)", () => {
    const verdict = deriveSourceOperationalStatus(
      definition({ executionMode: "manual", scheduler: undefined }),
      signal({ lastAttemptAt: null }),
      NOW
    );
    expect(verdict.status).toBe("configured_not_scheduled");
    expect(verdict.status).not.toBe("operational");
  });

  it("Caso 3 — manual only: adaptador implementado, ejecutado antes solo manualmente → manual_only", () => {
    const verdict = deriveSourceOperationalStatus(
      definition({ executionMode: "manual", scheduler: undefined }),
      signal({ lastAttemptAt: new Date(NOW.getTime() - 60 * 60_000) }),
      NOW
    );
    expect(verdict.status).toBe("manual_only");
  });

  it("Caso 4 — credencial ausente: el adaptador no se ejecuta → missing_credentials", () => {
    const verdict = deriveSourceOperationalStatus(
      definition({ requiredEnv: ["SOME_REQUIRED_KEY"] }),
      signal({ credentialsConfigured: false }),
      NOW
    );
    expect(verdict.status).toBe("missing_credentials");
    expect(verdict.reason).toContain("SOME_REQUIRED_KEY");
  });

  it("Caso 5 — stub: no existe implementación real → stub", () => {
    const verdict = deriveSourceOperationalStatus(definition({ adapterStatus: "stub", executionMode: "disabled" }), signal(), NOW);
    expect(verdict.status).toBe("stub");
  });

  it("Caso 6 — integración rota (adapterStatus broken) → broken", () => {
    const verdict = deriveSourceOperationalStatus(definition({ adapterStatus: "broken" }), signal(), NOW);
    expect(verdict.status).toBe("broken");
  });

  it("Caso 6b — integración rota por fallos consecutivos en runtime → broken", () => {
    const verdict = deriveSourceOperationalStatus(
      definition(),
      signal({ lastAttemptAt: NOW, consecutiveFailures: BROKEN_CONSECUTIVE_FAILURES_THRESHOLD }),
      NOW
    );
    expect(verdict.status).toBe("broken");
  });

  it("Caso 7 — respuesta vacía válida: ejecución exitosa, cero registros, fuente saludable", () => {
    const verdict = deriveSourceOperationalStatus(
      definition(),
      signal({
        lastAttemptAt: new Date(NOW.getTime() - 5 * 60_000),
        lastSuccessAt: new Date(NOW.getTime() - 5 * 60_000),
        lastRecordCount: 0,
        consecutiveFailures: 0,
      }),
      NOW
    );
    expect(verdict.status).toBe("operational");
  });

  it("Caso 8 — timeout reciente cuenta como fallo: degrada la fuente, no la rompe de inmediato", () => {
    const verdict = deriveSourceOperationalStatus(
      definition(),
      signal({ lastAttemptAt: NOW, lastErrorCode: "TIMEOUT", consecutiveFailures: 1 }),
      NOW
    );
    expect(verdict.status).toBe("degraded");
  });

  it("Caso 9 — fallos consecutivos bajo el umbral → degraded; sobre el umbral → broken", () => {
    const belowThreshold = deriveSourceOperationalStatus(definition(), signal({ lastAttemptAt: NOW, consecutiveFailures: BROKEN_CONSECUTIVE_FAILURES_THRESHOLD - 1 }), NOW);
    const atThreshold = deriveSourceOperationalStatus(definition(), signal({ lastAttemptAt: NOW, consecutiveFailures: BROKEN_CONSECUTIVE_FAILURES_THRESHOLD }), NOW);
    expect(belowThreshold.status).toBe("degraded");
    expect(atThreshold.status).toBe("broken");
  });

  it("Caso 10 — recuperación: una ejecución exitosa posterior vuelve a operational", () => {
    const verdict = deriveSourceOperationalStatus(
      definition(),
      signal({ lastAttemptAt: new Date(NOW.getTime() - 60_000), lastSuccessAt: new Date(NOW.getTime() - 60_000), consecutiveFailures: 0 }),
      NOW
    );
    expect(verdict.status).toBe("operational");
  });

  it("Caso 14 — fuente de contexto (Open-Meteo): nunca se considera fallida solo por no tener historial de ejecución", () => {
    const openMeteo = getSourceDefinition("open-meteo")!;
    expect(openMeteo.role).toBe("context");
    expect(openMeteo.executionMode).toBe("context_only");
    const verdict = deriveSourceOperationalStatus(openMeteo, signal(), NOW);
    expect(verdict.status).toBe("operational");
  });

  it("Caso 15 — fuentes históricas no están programadas para cadencia live", () => {
    const historical = ARGUS_SOURCE_OPERATIONS_REGISTRY.filter((source) => source.role === "historical");
    expect(historical.length).toBeGreaterThan(0);
    for (const source of historical) {
      expect(source.executionMode).not.toBe("scheduled");
    }
  });

  it("Caso 16 — GDELT: aunque el adaptador es funcional, sin scheduler nunca se declara operational", () => {
    const gdelt = getSourceDefinition("gdelt")!;
    expect(gdelt.executionMode).not.toBe("scheduled");
    const verdictNeverRun = deriveSourceOperationalStatus(gdelt, signal({ lastAttemptAt: null }), NOW);
    const verdictRunBefore = deriveSourceOperationalStatus(gdelt, signal({ lastAttemptAt: NOW }), NOW);
    expect(verdictNeverRun.status).not.toBe("operational");
    expect(verdictRunBefore.status).not.toBe("operational");
  });

  it("GDELT tiene rol context, nunca detection (Prompt 16 §20)", () => {
    expect(getSourceDefinition("gdelt")!.role).toBe("context");
  });

  it("Caso 17 — Source Health público nunca expone datos sensibles", () => {
    const source = definition();
    const verdict = deriveSourceOperationalStatus(source, signal({ lastErrorCode: "AUTH_INVALID" }), NOW);
    const publicEntry = toPublicSourceHealth(source, verdict);
    const serialized = JSON.stringify(publicEntry);
    expect(Object.keys(publicEntry).sort()).toEqual(["category", "id", "level", "role"].sort());
    expect(serialized).not.toContain("AUTH_INVALID");
    expect(serialized).not.toContain(source.endpoint);
  });

  it("Caso 18 — Source Health de operador entrega datos operacionales permitidos", () => {
    const source = definition();
    const sig = signal({
      lastAttemptAt: NOW,
      lastSuccessAt: NOW,
      lastDurationMs: 1234,
      lastRecordCount: 7,
      lastErrorCode: null,
    });
    const verdict = deriveSourceOperationalStatus(source, sig, NOW);
    const operatorEntry = toOperatorSourceHealth(source, sig, verdict);
    expect(operatorEntry.lastDurationMs).toBe(1234);
    expect(operatorEntry.lastRecordCount).toBe(7);
    expect(operatorEntry.operationalStatus).toBe(verdict.status);
    expect(operatorEntry.credentialsConfigured).toBe(true);
    expect(operatorEntry.schedulerConfigured).toBe(true);
  });

  it("Caso 19 — las credenciales nunca se serializan (solo nombres de variable y booleano configurado)", () => {
    const secretValue = "super-secret-token-value-should-never-leak";
    process.env.FIXTURE_TEST_SECRET = secretValue;
    try {
      const source = definition({ requiredEnv: ["FIXTURE_TEST_SECRET"] });
      const sig = signal({ credentialsConfigured: true });
      const verdict = deriveSourceOperationalStatus(source, sig, NOW);
      const operatorEntry = toOperatorSourceHealth(source, sig, verdict);
      const publicEntry = toPublicSourceHealth(source, verdict);
      expect(JSON.stringify(operatorEntry)).not.toContain(secretValue);
      expect(JSON.stringify(publicEntry)).not.toContain(secretValue);
      expect(JSON.stringify(source)).not.toContain(secretValue);
    } finally {
      delete process.env.FIXTURE_TEST_SECRET;
    }
  });
});

describe("determinismo y pureza de deriveSourceOperationalStatus", () => {
  it("misma entrada produce siempre el mismo resultado", () => {
    const source = definition();
    const sig = signal({ lastAttemptAt: NOW, lastSuccessAt: NOW });
    const first = deriveSourceOperationalStatus(source, sig, NOW);
    const second = deriveSourceOperationalStatus(source, sig, NOW);
    expect(second).toEqual(first);
  });
});

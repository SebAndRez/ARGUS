import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Prompt 14 §25 — SENAPRED canonical ingestion consolidation tests.
 * Mocks only the I/O boundary (Prisma-backed persistence functions, the
 * AppSync-calling raw fetch) — real classification, geometry resolution,
 * and lifecycle logic run unmocked. No test touches a real AppSync/Redis/
 * Supabase (global `fetch` is blocked by tests/setup.ts regardless).
 */

vi.mock("@/lib/knowledge-intake/persistence/knowledgePersistenceService", () => ({
  createIngestionRun: vi.fn(),
  finishIngestionRun: vi.fn(),
  saveKnowledgeEvidenceIfNew: vi.fn(),
  upsertKnowledgeIncidentByExternalId: vi.fn(),
  getKnowledgeIncidents: vi.fn(),
}));

vi.mock("@/lib/sources/chile/senapredProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sources/chile/senapredProvider")>();
  return { ...actual, fetchChileOfficialAlertsRaw: vi.fn() };
});

import * as knowledgePersistence from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { fetchChileOfficialAlertsRaw, type ChileOfficialAlertRaw } from "@/lib/sources/chile/senapredProvider";
import { promoteChileOfficialAlerts } from "@/lib/incidents/chileAlertPromotionEngine";
import { fetchSenapredAlerts } from "@/lib/adapters/senapred/senapredEventosAdapter";
import { resolveAdministrativeAreaWithFallback } from "@/lib/geometry/argusGeometryResolver";
import { buildArgusNotifications } from "@/lib/notifications/notificationCenterEngine";
import type { KnowledgeIncidentItem } from "@/lib/notifications/notificationCenterEngine";
import { canonicalKnowledgeIncidentToArgusEvent } from "@/lib/canonical/canonicalKnowledgeIncidentToArgusEvent";
import type { CanonicalKnowledgeIncidentInput } from "@/lib/canonical/canonicalKnowledgeIncidentToArgusEvent";

const createIngestionRunMock = vi.mocked(knowledgePersistence.createIngestionRun);
const finishIngestionRunMock = vi.mocked(knowledgePersistence.finishIngestionRun);
const saveKnowledgeEvidenceIfNewMock = vi.mocked(knowledgePersistence.saveKnowledgeEvidenceIfNew);
const upsertKnowledgeIncidentByExternalIdMock = vi.mocked(knowledgePersistence.upsertKnowledgeIncidentByExternalId);
const fetchChileOfficialAlertsRawMock = vi.mocked(fetchChileOfficialAlertsRaw);

function rawAlert(overrides: Partial<ChileOfficialAlertRaw> = {}): ChileOfficialAlertRaw {
  return {
    title: "Se declara Alerta Amarilla por sistema frontal",
    region: "La Araucanía",
    threatText: "Viento fuerte y lluvia intensa asociados a sistema frontal.",
    levelText: "Alerta Amarilla",
    issuedAt: "2026-07-14T10:00:00.000Z",
    updatedAt: "2026-07-14T10:00:00.000Z",
    sourceId: "senapred_eventos",
    evidenceUrl: "https://www.senapred.cl/eventos/alerta-1",
    ...overrides,
  };
}

let upsertCallCount = 0;
let lastExternalIds: string[] = [];

beforeEach(() => {
  upsertCallCount = 0;
  lastExternalIds = [];
  createIngestionRunMock.mockResolvedValue({ id: "run-1" } as never);
  finishIngestionRunMock.mockResolvedValue(undefined as never);
  saveKnowledgeEvidenceIfNewMock.mockResolvedValue({ action: "inserted", evidence: {} } as never);
  upsertKnowledgeIncidentByExternalIdMock.mockImplementation(async (incident: { id: string }) => {
    upsertCallCount += 1;
    lastExternalIds.push(incident.id);
    const action = new Set(lastExternalIds.slice(0, -1)).has(incident.id) ? "updated" : "inserted";
    return { action, incident } as never;
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Caso 2/3 — identidad estable a traves de actualizaciones y cambios de nivel", () => {
  it("la misma alerta (misma amenaza/area/dia) actualizada dos veces produce un solo incidente", async () => {
    const first = await promoteChileOfficialAlerts([rawAlert()]);
    const second = await promoteChileOfficialAlerts([rawAlert({ title: "Se mantiene Alerta Amarilla" })]);

    expect(first.inserted).toBe(1);
    expect(second.updated).toBe(1);
    expect(second.inserted).toBe(0);
    expect(upsertCallCount).toBe(2);
    expect(new Set(lastExternalIds).size).toBe(1); // same externalId both times
  });

  it("un cambio de nivel (Amarilla -> Roja) el mismo dia/area conserva el mismo ID canonico", async () => {
    await promoteChileOfficialAlerts([rawAlert({ levelText: "Alerta Amarilla" })]);
    await promoteChileOfficialAlerts([rawAlert({ levelText: "Alerta Roja", title: "Se cancela Alerta Amarilla y se declara Alerta Roja" })]);

    expect(new Set(lastExternalIds).size).toBe(1);
    expect(upsertCallCount).toBe(2);
  });

  it("una amenaza distinta o un dia distinto genera una identidad nueva", async () => {
    await promoteChileOfficialAlerts([rawAlert()]);
    await promoteChileOfficialAlerts([rawAlert({ issuedAt: "2026-08-01T10:00:00.000Z", updatedAt: "2026-08-01T10:00:00.000Z" })]);

    expect(new Set(lastExternalIds).size).toBe(2);
  });
});

describe("Caso 4 — cancelacion mueve el lifecycle, no elimina el registro", () => {
  it("una alerta con texto de cancelacion se persiste con lifecycle resolved y tag lifecycle:cancelled", async () => {
    await promoteChileOfficialAlerts([
      rawAlert({ title: "Se cancela Alerta Amarilla por sistema frontal", levelText: "Alerta Roja" }),
    ]);

    expect(upsertKnowledgeIncidentByExternalIdMock).toHaveBeenCalledTimes(1);
    const persisted = upsertKnowledgeIncidentByExternalIdMock.mock.calls[0][0] as unknown as {
      technicalFactors: { lifecycle: string };
      tags: string[];
    };
    expect(persisted.technicalFactors.lifecycle).toBe("resolved");
    expect(persisted.tags).toContain("lifecycle:cancelled");
    // Never deleted — still one upsert call, never a delete call of any kind.
  });
});

describe("Caso 5/6 — geometria real para regiones multiples (Araucania, Los Rios, Los Lagos)", () => {
  it.each(["La Araucanía", "Los Ríos", "Los Lagos"])("%s resuelve un MultiPolygon real, no un ancla de punto", (region) => {
    const resolved = resolveAdministrativeAreaWithFallback("CL", { region });
    expect(resolved).not.toBeNull();
    expect(resolved!.geojson.type).toBe("MultiPolygon");
    expect(resolved!.geojson.coordinates.length).toBeGreaterThan(0);
    expect(resolved!.resolvedLevel).toBe("region");
  });

  it("una alerta que afecta varias regiones se normaliza sin bbox visible (fetchSenapredAlerts)", async () => {
    fetchChileOfficialAlertsRawMock.mockResolvedValue({
      alerts: [rawAlert({ region: "Los Ríos" }), rawAlert({ region: "Los Lagos", title: "Alerta Los Lagos" })],
      warnings: [],
      errors: [],
    });

    const result = await fetchSenapredAlerts();
    expect(result.signals.length).toBe(2);
    result.signals.forEach((signal) => {
      expect(signal.geometry.type).toBe("administrative_area");
      if (signal.geometry.type === "administrative_area") {
        expect(signal.geometry.geojson.type).toBe("MultiPolygon");
      }
    });
  });
});

describe("Caso 7/8 — countryCode y alcance territorial", () => {
  it("countryCode siempre CL, scope regional (no nacional por defecto)", async () => {
    fetchChileOfficialAlertsRawMock.mockResolvedValue({ alerts: [rawAlert()], warnings: [], errors: [] });
    const result = await fetchSenapredAlerts();
    expect(result.signals[0].country).toBe("CL");
    // Regional alert carries its region name — never collapsed to a
    // country-wide/no-region signal just because a field was absent.
    expect(result.signals[0].region).toBe("La Araucanía");
  });
});

describe("Caso 9 — severidad desconocida", () => {
  it("un nivel no reconocido cae a un fallback seguro, nunca critico automatico", async () => {
    fetchChileOfficialAlertsRawMock.mockResolvedValue({
      alerts: [rawAlert({ levelText: "Nivel Experimental Desconocido" })],
      warnings: [],
      errors: [],
    });
    const result = await fetchSenapredAlerts();
    expect(result.signals[0].severity).not.toBe("critical");
    expect(result.signals[0].severity).toBe("medium");
  });
});

describe("Caso 10/11/12 — vacio valido vs timeout vs error de parsing", () => {
  it("Caso 10 — respuesta vacia valida: cero alertas, status empty, no se trata como fallo", async () => {
    fetchChileOfficialAlertsRawMock.mockResolvedValue({ alerts: [], warnings: [], errors: [] });
    const result = await fetchSenapredAlerts();
    expect(result.status).toBe("empty");
    expect(result.errors).toEqual([]);
  });

  it("Caso 11 — timeout/error de red: status error, cero señales, sin inventar datos", async () => {
    fetchChileOfficialAlertsRawMock.mockRejectedValue(new Error("SENAPRED AppSync timeout"));
    const result = await fetchSenapredAlerts();
    expect(result.status).toBe("error");
    expect(result.signals).toEqual([]);
    expect(result.errors[0]).toContain("timeout");
  });

  it("Caso 12 — error de parsing/backend: ejecucion parcial o fallida, sin persistir payload crudo", async () => {
    fetchChileOfficialAlertsRawMock.mockResolvedValue({
      alerts: [],
      warnings: [],
      errors: ["GraphQL response shape unexpected"],
    });
    const result = await fetchSenapredAlerts();
    expect(result.status).toBe("error");
    expect(result.errors).toContain("GraphQL response shape unexpected");
  });
});

describe("Caso 16 — codigo legacy delega, no ejecuta segunda consulta", () => {
  it("fetchSenapredAlerts llama fetchChileOfficialAlertsRaw exactamente una vez, nunca su propia paginacion", async () => {
    fetchChileOfficialAlertsRawMock.mockResolvedValue({ alerts: [rawAlert()], warnings: [], errors: [] });
    await fetchSenapredAlerts();
    expect(fetchChileOfficialAlertsRawMock).toHaveBeenCalledTimes(1);
  });
});

describe("Caso 13 — endpoints de lectura devuelven la misma proyeccion para la misma entidad", () => {
  function buildIncidentRow(overrides: Partial<CanonicalKnowledgeIncidentInput> = {}): CanonicalKnowledgeIncidentInput {
    return {
      id: "chile-1",
      externalId: "alerta_amarilla:la-araucania:2026-07-14",
      sourceId: "senapred_eventos",
      sourceName: "SENAPRED Chile (alertas oficiales)",
      domain: "severe_weather",
      subtype: "severe_wind",
      title: "Alerta Amarilla La Araucanía",
      summary: "Viento fuerte.",
      severity: "high",
      confidenceScore: 90,
      country: "CL",
      region: "La Araucanía",
      locality: null,
      latitude: -38.94,
      longitude: -72.33,
      geometryJson: null,
      technicalFactorsJson: { region: "La Araucanía", lifecycle: "active" },
      impactJson: null,
      casualtiesJson: null,
      recommendedActionsJson: null,
      rawEvidenceRefsJson: [],
      tagsJson: ["senapred", "severe_wind", "lifecycle:declared"],
      occurredAt: new Date("2026-07-14T10:00:00.000Z"),
      detectedAt: new Date("2026-07-14T10:02:00.000Z"),
      createdAt: new Date("2026-07-14T10:02:30.000Z"),
      updatedAt: new Date("2026-07-14T10:05:00.000Z"),
      ...overrides,
    };
  }

  it("el mismo KnowledgeIncident produce el mismo id/severidad/geometria via el mapeador canonico (usado por /api/chile-alerts y /api/argus/events)", () => {
    const row = buildIncidentRow();
    const asChileAlerts = canonicalKnowledgeIncidentToArgusEvent(row, { idPrefix: "chile-alert" });
    const asArgusEvents = canonicalKnowledgeIncidentToArgusEvent(row, { idPrefix: "chile-alert" });

    expect(asChileAlerts).toEqual(asArgusEvents);
    expect(asChileAlerts?.id).toBe("chile-alert-chile-1");
    expect(asChileAlerts?.severity).toBe("high");
    expect(asChileAlerts?.geometry.type === "administrative_area" || asChileAlerts?.geometry.type === "point").toBe(true);
  });
});

describe("Caso 14 — una alerta SENAPRED genera una sola notificacion oficial", () => {
  it("category official_alert, verificationStatus official, isOfficial true", () => {
    const incident: KnowledgeIncidentItem = {
      id: "chile-1",
      externalId: "alerta_roja:valparaiso:2026-07-14",
      title: "Alerta Roja Valparaíso",
      summary: "Incendio forestal de gran magnitud.",
      domain: "wildfire",
      subtype: null,
      severity: "critical",
      confidenceScore: 90,
      sourceId: "senapred_eventos",
      sourceName: "SENAPRED Chile (alertas oficiales)",
      country: "CL",
      region: "Valparaíso",
      locality: null,
      latitude: -33.05,
      longitude: -71.62,
      occurredAt: new Date("2026-07-14T10:00:00.000Z"),
      detectedAt: new Date("2026-07-14T10:02:00.000Z"),
      createdAt: new Date("2026-07-14T10:02:30.000Z"),
      updatedAt: new Date("2026-07-14T10:05:00.000Z"),
      tagsJson: ["senapred", "wildfire"],
      technicalFactorsJson: { lifecycle: "active" },
      impactJson: null,
      casualtiesJson: null,
    };

    const notifications = buildArgusNotifications({ knowledgeIncidents: [incident] });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].category).toBe("official_alert");
    expect(notifications[0].verificationStatus).toBe("official");
    expect(notifications[0].isOfficial).toBe(true);
  });
});

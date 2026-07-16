import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ARGUS Prompt 15 §27 — prueba de integración ligera: confirma que tres
 * señales correlacionadas (NASA FIRMS + Copernicus EFFIS + Copernicus EMS
 * del mismo incendio) producen UN `KnowledgeIncident` con MÚLTIPLES
 * evidencias en una sola corrida de `runGlobalWatch`, no tres incidentes
 * separados. Solo se mockean los límites de I/O reales (adaptadores de red +
 * capa de persistencia Prisma + el sweep de lifecycle, que toca Prisma
 * directamente) — la lógica real de promoción, correlación y persistencia
 * (`evaluateIncidentPromotion`, `correlateWildfireEvents`,
 * `evaluateWildfireCorrelation`) corre sin mockear. Cero red real, cero
 * Supabase, cero Redis de producción (el lock de SENAPRED ni se alcanza:
 * `senapred_eventos` queda fuera de `onlySources`).
 */

vi.mock("@/lib/knowledge-intake/adapters/firmsAdapter", () => ({
  fetchFirmsActiveFires: vi.fn(),
}));
vi.mock("@/lib/vigia/adapters/effisAdapter", () => ({
  fetchEffisWildfires: vi.fn(),
}));
vi.mock("@/lib/vigia/adapters/copernicusEmsAdapter", () => ({
  fetchCopernicusEmsActivations: vi.fn(),
}));
vi.mock("@/lib/vigia/incidentLifecycle", () => ({
  sweepIncidentLifecycles: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/knowledge-intake/persistence/knowledgePersistenceService", () => ({
  createIngestionRun: vi.fn().mockResolvedValue({ id: "run-1" }),
  finishIngestionRun: vi.fn().mockResolvedValue(undefined),
  saveKnowledgeEvidenceIfNew: vi.fn().mockResolvedValue({ action: "inserted", evidence: {} }),
  upsertKnowledgeIncidentByExternalId: vi.fn(),
  findWildfireCorrelationCandidates: vi.fn().mockResolvedValue([]),
  attachWildfireEvidenceToExistingIncident: vi.fn(),
  // Prompt 16: sin corridas previas registradas → shouldRunSource() ve
  // lastAttemptAt=null para las tres fuentes → "never_run" → siempre se
  // ejecutan, preservando el comportamiento que este test ya verificaba.
  getRecentIngestionRunsBySource: vi.fn().mockResolvedValue(new Map()),
}));

import { fetchFirmsActiveFires } from "@/lib/knowledge-intake/adapters/firmsAdapter";
import { fetchEffisWildfires } from "@/lib/vigia/adapters/effisAdapter";
import { fetchCopernicusEmsActivations } from "@/lib/vigia/adapters/copernicusEmsAdapter";
import {
  saveKnowledgeEvidenceIfNew,
  upsertKnowledgeIncidentByExternalId,
} from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { runGlobalWatch } from "@/lib/vigia/globalWatchEngine";
import type { ArgusIncidentKnowledge } from "@/types/knowledgeIntake";

const fetchFirmsMock = vi.mocked(fetchFirmsActiveFires);
const fetchEffisMock = vi.mocked(fetchEffisWildfires);
const fetchEmsMock = vi.mocked(fetchCopernicusEmsActivations);
const upsertMock = vi.mocked(upsertKnowledgeIncidentByExternalId);
const saveEvidenceMock = vi.mocked(saveKnowledgeEvidenceIfNew);

const REF_TIME = "2026-07-14T12:00:00.000Z";

function firmsRawPoint(id: string, lat: number, lng: number): ArgusIncidentKnowledge {
  return {
    id: `firms-raw-${id}`,
    title: "Foco termico detectado por NASA FIRMS",
    summary: "NASA FIRMS thermal anomaly.",
    domain: "wildfire",
    subtype: "active_fire_detection",
    severity: "low",
    confidenceScore: 68,
    actionabilityScore: 48,
    sourceReliabilityScore: 90,
    evidenceCount: 1,
    sourceIds: ["nasa_firms"],
    sourceNames: ["NASA FIRMS"],
    occurredAt: REF_TIME,
    detectedAt: REF_TIME,
    latitude: lat,
    longitude: lng,
    geometry: { type: "Point", coordinates: [lng, lat] },
    technicalFactors: { frp: 40 } as unknown as ArgusIncidentKnowledge["technicalFactors"],
    causes: [],
    contributingFactors: [],
    responseActions: [],
    lessonsLearned: [],
    recommendedActions: [],
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: [],
    rawEvidenceRefs: [],
    createdAt: REF_TIME,
    updatedAt: REF_TIME,
  };
}

const EFFIS_POLYGON = {
  type: "Polygon",
  coordinates: [[[-70.62, -33.42], [-70.58, -33.42], [-70.58, -33.38], [-70.62, -33.38], [-70.62, -33.42]]],
};

function effisIncident(): ArgusIncidentKnowledge {
  return {
    id: "effis-emsr-fixture",
    title: "Incendio forestal en Valparaíso (~800 ha)",
    summary: "Copernicus EFFIS reporta un área quemada.",
    domain: "wildfire",
    subtype: "forest_fire",
    severity: "high",
    confidenceScore: 85,
    actionabilityScore: 75,
    sourceReliabilityScore: 90,
    evidenceCount: 1,
    sourceIds: ["copernicus_effis"],
    sourceNames: ["Copernicus EFFIS"],
    occurredAt: REF_TIME,
    detectedAt: REF_TIME,
    country: "CL",
    region: "Valparaíso",
    latitude: -33.4,
    longitude: -70.6,
    geometry: EFFIS_POLYGON,
    technicalFactors: { areaHa: 800 } as unknown as ArgusIncidentKnowledge["technicalFactors"],
    causes: [],
    contributingFactors: [],
    responseActions: [],
    lessonsLearned: [],
    recommendedActions: [],
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: [],
    rawEvidenceRefs: [],
    createdAt: REF_TIME,
    updatedAt: REF_TIME,
  };
}

function emsIncident(): ArgusIncidentKnowledge {
  return {
    id: "copernicus-ems-emsr999-fixture",
    title: "EMSR999: Incendio Valparaíso",
    summary: "Activación de mapeo rápido Copernicus EMS.",
    domain: "wildfire",
    subtype: "wildfire",
    severity: "high",
    confidenceScore: 88,
    actionabilityScore: 80,
    sourceReliabilityScore: 91,
    evidenceCount: 1,
    sourceIds: ["copernicus_ems"],
    sourceNames: ["Copernicus EMS"],
    occurredAt: REF_TIME,
    detectedAt: REF_TIME,
    country: "CL",
    latitude: -33.405,
    longitude: -70.605,
    geometry: { type: "Point", coordinates: [-70.605, -33.405] },
    technicalFactors: { activationCode: "EMSR999" } as unknown as ArgusIncidentKnowledge["technicalFactors"],
    causes: [],
    contributingFactors: [],
    responseActions: [],
    lessonsLearned: [],
    recommendedActions: [],
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: [],
    rawEvidenceRefs: [],
    createdAt: REF_TIME,
    updatedAt: REF_TIME,
  };
}

describe("runGlobalWatch — correlación de incendios (integración ligera, sin red/DB reales)", () => {
  beforeEach(() => {
    vi.stubEnv("NASA_FIRMS_MAP_KEY", "test-key");
    fetchFirmsMock.mockReset();
    fetchEffisMock.mockReset();
    fetchEmsMock.mockReset();
    upsertMock.mockReset();
    saveEvidenceMock.mockClear();

    // Tres focos FIRMS en la misma celda de 0.2° → el clusterer del propio
    // motor los agrupa en 1 cluster con fociCount=3 (umbral de incidente).
    fetchFirmsMock
      .mockResolvedValueOnce({
        adapterId: "firmsAdapter",
        sourceId: "nasa_firms",
        sourceName: "NASA FIRMS",
        status: "ready",
        fetchedAt: REF_TIME,
        count: 3,
        incidents: [
          firmsRawPoint("a", -33.401, -70.601),
          firmsRawPoint("b", -33.402, -70.602),
          firmsRawPoint("c", -33.403, -70.603),
        ],
      })
      .mockResolvedValueOnce({
        adapterId: "firmsAdapter",
        sourceId: "nasa_firms",
        sourceName: "NASA FIRMS",
        status: "ready",
        fetchedAt: REF_TIME,
        count: 0,
        incidents: [],
      });

    fetchEffisMock.mockResolvedValue({
      adapterId: "effisAdapter",
      sourceId: "copernicus_effis",
      sourceName: "Copernicus EFFIS",
      status: "ready",
      fetchedAt: REF_TIME,
      fetched: 1,
      count: 1,
      incidents: [effisIncident()],
      warnings: [],
      errors: [],
    });

    fetchEmsMock.mockResolvedValue({
      adapterId: "copernicusEmsAdapter",
      sourceId: "copernicus_ems",
      sourceName: "Copernicus EMS",
      status: "ready",
      fetchedAt: REF_TIME,
      fetched: 1,
      count: 1,
      incidents: [emsIncident()],
      warnings: [],
      errors: [],
    });

    upsertMock.mockImplementation(async (incident: ArgusIncidentKnowledge) => ({
      action: "inserted" as const,
      incident: { ...incident, id: `persisted-${incident.id}` } as never,
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("tres señales correlacionadas producen un único KnowledgeIncident con evidencia de las tres fuentes", async () => {
    const summary = await runGlobalWatch({ onlySources: ["nasa_firms", "copernicus_effis", "copernicus_ems"] });

    expect(summary.status).not.toBe("failed");
    // Un solo upsert de incidente para el grupo correlacionado (no tres).
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const persistedIncident = upsertMock.mock.calls[0][0] as ArgusIncidentKnowledge;
    expect(new Set(persistedIncident.sourceIds)).toEqual(new Set(["nasa_firms", "copernicus_effis", "copernicus_ems"]));

    // Evidencia guardada por cada una de las tres fuentes del grupo.
    const evidenceSourceIds = saveEvidenceMock.mock.calls.map((call) => call[0].sourceId);
    expect(new Set(evidenceSourceIds)).toEqual(new Set(["nasa_firms", "copernicus_effis", "copernicus_ems"]));
    expect(saveEvidenceMock).toHaveBeenCalledTimes(3);
  });

  it("no realiza ninguna llamada de red real (fetch global sigue bloqueado por tests/setup.ts)", async () => {
    await runGlobalWatch({ onlySources: ["nasa_firms", "copernicus_effis", "copernicus_ems"] });
    // Los tres adaptadores están mockeados; si alguno hubiera intentado
    // fetch() real, tests/setup.ts lo habría hecho fallar con "Network call
    // blocked" y esta prueba habría lanzado antes de llegar aquí.
    expect(fetchFirmsMock).toHaveBeenCalled();
    expect(fetchEffisMock).toHaveBeenCalled();
    expect(fetchEmsMock).toHaveBeenCalled();
  });
});

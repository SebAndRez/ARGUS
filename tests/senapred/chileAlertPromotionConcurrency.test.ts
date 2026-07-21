import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit 2026-07-21 — second confirmed contributor to the Global Watch 300s
 * timeout: `promoteChileOfficialAlerts()` used to persist promotable
 * (high/critical) alerts one at a time in a plain `for` loop (upsert +
 * evidence save per alert, awaited sequentially). During an active
 * severe-weather period, dozens of high/critical alerts turn into that many
 * sequential remote-DB round trips. This suite proves the real
 * implementation (only the Prisma-backed persistence functions are mocked)
 * now persists with bounded concurrency instead.
 */

vi.mock("@/lib/knowledge-intake/persistence/knowledgePersistenceService", () => ({
  createIngestionRun: vi.fn(),
  finishIngestionRun: vi.fn(),
  saveKnowledgeEvidenceIfNew: vi.fn(),
  upsertKnowledgeIncidentByExternalId: vi.fn(),
}));

import * as knowledgePersistence from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { promoteChileOfficialAlerts } from "@/lib/incidents/chileAlertPromotionEngine";
import type { ChileOfficialAlertRaw } from "@/lib/sources/chile/senapredProvider";

const createIngestionRunMock = vi.mocked(knowledgePersistence.createIngestionRun);
const finishIngestionRunMock = vi.mocked(knowledgePersistence.finishIngestionRun);
const saveKnowledgeEvidenceIfNewMock = vi.mocked(knowledgePersistence.saveKnowledgeEvidenceIfNew);
const upsertKnowledgeIncidentByExternalIdMock = vi.mocked(knowledgePersistence.upsertKnowledgeIncidentByExternalId);

const TOTAL_ALERTS = 18;
const UPSERT_DELAY_MS = 20;

function rawAlert(i: number): ChileOfficialAlertRaw {
  return {
    title: `Se declara Alerta Roja por incendio forestal en comuna ${i}`,
    region: "Región de Coquimbo",
    commune: `Comuna ${i}`,
    threatText: "Incendio forestal de gran magnitud.",
    levelText: "Alerta Roja",
    issuedAt: "2026-07-20T10:00:00.000Z",
    updatedAt: "2026-07-20T10:00:00.000Z",
    sourceId: "senapred_eventos",
    evidenceUrl: `https://www.senapred.cl/eventos/alerta-${i}`,
  };
}

let inFlight = 0;
let maxInFlight = 0;

beforeEach(() => {
  inFlight = 0;
  maxInFlight = 0;
  createIngestionRunMock.mockResolvedValue({ id: "run-1" } as never);
  finishIngestionRunMock.mockResolvedValue(undefined as never);
  saveKnowledgeEvidenceIfNewMock.mockResolvedValue({ action: "inserted", evidence: {} } as never);
  upsertKnowledgeIncidentByExternalIdMock.mockImplementation(async (incident: { id: string }) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, UPSERT_DELAY_MS));
    inFlight -= 1;
    return { action: "inserted", incident } as never;
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("promoteChileOfficialAlerts — concurrencia acotada de la persistencia", () => {
  it("persiste con concurrencia acotada (no una escritura a la vez, no ilimitada)", async () => {
    const alerts = Array.from({ length: TOTAL_ALERTS }, (_, i) => rawAlert(i));
    const result = await promoteChileOfficialAlerts(alerts);

    expect(upsertKnowledgeIncidentByExternalIdMock).toHaveBeenCalledTimes(TOTAL_ALERTS);
    expect(result.inserted).toBe(TOTAL_ALERTS);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(6);
  });

  it("es sustancialmente más rápido que el equivalente estrictamente secuencial", async () => {
    const alerts = Array.from({ length: TOTAL_ALERTS }, (_, i) => rawAlert(i));
    const start = Date.now();
    await promoteChileOfficialAlerts(alerts);
    const elapsed = Date.now() - start;
    const sequentialWorstCase = TOTAL_ALERTS * UPSERT_DELAY_MS;

    expect(elapsed).toBeLessThan(sequentialWorstCase);
  });

  it("alertas de severidad baja/media nunca tocan la DB (siguen contando como notPromoted, sin I/O)", async () => {
    const result = await promoteChileOfficialAlerts([
      { ...rawAlert(0), levelText: "Alerta Verde", title: "Monitoreo Alerta Verde" },
    ]);

    expect(upsertKnowledgeIncidentByExternalIdMock).not.toHaveBeenCalled();
    expect(result.notPromoted).toBe(1);
    expect(result.inserted).toBe(0);
  });
});

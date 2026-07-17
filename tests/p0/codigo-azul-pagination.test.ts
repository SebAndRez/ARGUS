import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Orquestacion de `runCodigoAzulIngestion` (spec ARGUS v1.0.3.5 §6/§12/§30):
 * paginacion secuencial, terminacion por pagina vacia, tope de seguridad,
 * tolerancia a fallas parciales de pagina, deteccion de cambio estructural,
 * salvaguarda anti-archivado-masivo. Prisma se mockea por completo — este
 * test es sobre el flujo de control del orquestador, no sobre persistencia
 * fila-por-fila (eso ya lo cubren `codigo-azul-dedup.test.ts` y la corrida
 * real de verificacion). `fetch` global se reemplaza por un stub controlado
 * (nunca red real — `tests/setup.ts` bloquea cualquier fetch sin mockear).
 */

const criticalPoiFindMany = vi.fn().mockResolvedValue([]);
const criticalPoiCreate = vi.fn().mockImplementation((args: { data: { externalId?: string } }) =>
  Promise.resolve({ id: `poi-${args.data.externalId ?? "x"}` })
);
const criticalPoiUpdate = vi.fn().mockResolvedValue({ id: "poi-updated" });
const operationalStatusUpsert = vi.fn().mockResolvedValue({
  id: "status-1",
  poiId: "poi-1",
  shelterStatus: "unknown",
  capacityStatus: "unknown",
  capacityTotal: null,
  occupancyCurrent: null,
  capacityDeclared: null,
  hasWater: null,
  hasElectricity: null,
  hasFood: null,
  hasMedical: null,
  hasHeating: null,
  hasBathrooms: null,
  hasShowers: null,
  isAccessible: null,
  allowsPets: null,
  hasConnectivity: null,
  operatorName: null,
  contactPhone: null,
  contactNotes: null,
  operatingHours: null,
  routeStatus: null,
  sourceType: "codigo_azul",
  sourceName: "Código Azul",
  sourceUrl: null,
  sourcePublishedAt: null,
  confidence: 75,
  verificationStatus: "candidate",
  lastUpdatedAt: new Date(),
  lastVerifiedAt: null,
  isStale: false,
  linkedIncidentId: null,
  publicationStatus: "active",
  createdAt: new Date(),
});
const operationalStatusFindUnique = vi.fn().mockResolvedValue(null);
const evidenceCreate = vi.fn().mockResolvedValue({});
const ingestionRunFindFirst = vi.fn().mockResolvedValue(null);
const transactionMock = vi.fn((ops: Promise<unknown>[]) => Promise.all(ops));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    criticalPoi: { findMany: criticalPoiFindMany, create: criticalPoiCreate, update: criticalPoiUpdate },
    criticalPoiOperationalStatus: { upsert: operationalStatusUpsert, findUnique: operationalStatusFindUnique },
    criticalPoiStatusEvidence: { create: evidenceCreate },
    ingestionRun: { findFirst: ingestionRunFindFirst },
    $transaction: transactionMock,
  },
}));

import { runCodigoAzulIngestion } from "@/lib/criticalPoi/criticalPoiCodigoAzulSync";

const TABLE_HEADER = `<table class="table table-striped"><thead><tr>
  <th>Región</th><th>Tipo</th><th>Dirección</th><th>Componente</th><th>Comuna</th>
  <th>Nombre</th><th>Institución</th><th>Horario</th><th>Cupos</th><th>Mapa</th>
</tr></thead><tbody>`;

function buildRow(index: number): string {
  return `<tr>
    <td>Coquimbo</td><td>Albergue</td><td>Calle Falsa ${index}, Coquimbo</td><td>Plan Protege</td><td>Coquimbo</td>
    <td>${100000 + index}-Albergue Demo ${index}</td><td>Institución Demo</td><td>24 Horas</td><td>15</td>
    <td><a href="#" data-url="https://widget-codigoazul.ministeriodesarrollosocial.gob.cl/buscador-mapa/home?xy=-71.34,-29.95">Ver Mapa</a></td>
  </tr>`;
}

function buildPageHtml(rowCount: number): string {
  const rows = Array.from({ length: rowCount }, (_, index) => buildRow(index)).join("");
  return `${TABLE_HEADER}${rows}</tbody></table>`;
}

const EMPTY_PAGE_HTML = `${TABLE_HEADER}<tr><td colspan="9" class="text-center">Sin resultados</td></tr></tbody></table>`;
const STRUCTURAL_CHANGE_HTML = TABLE_HEADER.replace("<th>Cupos</th>", "<th>Plazas</th>") + buildRow(1) + "</tbody></table>";

function mockFetchByPage(pagesHtml: Record<number, string>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const match = /page=(\d+)/.exec(url);
      const page = match ? Number(match[1]) : 1;
      const html = pagesHtml[page] ?? EMPTY_PAGE_HTML;
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(html) });
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  criticalPoiFindMany.mockResolvedValue([]);
  ingestionRunFindFirst.mockResolvedValue(null);
});

describe("runCodigoAzulIngestion — paginacion", () => {
  it("se detiene en la primera pagina vacia (senal real de fin, no un conteo fijo)", async () => {
    mockFetchByPage({ 1: buildPageHtml(10), 2: buildPageHtml(9), 3: EMPTY_PAGE_HTML });
    const result = await runCodigoAzulIngestion();
    expect(result.pagesProcessed).toBe(3);
    expect(result.recordsFetched).toBe(19);
    expect(result.status).toBe("success");
  });

  it("nunca supera el tope de seguridad aunque el sitio nunca devuelva una pagina vacia", async () => {
    mockFetchByPage(Object.fromEntries(Array.from({ length: 50 }, (_, i) => [i + 1, buildPageHtml(10)])));
    const result = await runCodigoAzulIngestion({ maxPages: 5 });
    expect(result.pagesProcessed).toBe(5);
  });

  it("una pagina que falla por red se salta y la paginacion continua (no aborta lo ya obtenido)", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        const match = /page=(\d+)/.exec(url);
        const page = match ? Number(match[1]) : 1;
        callCount += 1;
        if (page === 2) return Promise.reject(new Error("network down"));
        if (page === 1) return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(buildPageHtml(10)) });
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(EMPTY_PAGE_HTML) });
      })
    );
    const result = await runCodigoAzulIngestion();
    expect(result.pageErrors).toBeGreaterThan(0);
    expect(result.recordsFetched).toBe(10);
    expect(callCount).toBeGreaterThan(2);
  });

  it("cambio estructural detiene la paginacion y no persiste nada (nunca ingiere con columnas movidas)", async () => {
    mockFetchByPage({ 1: buildPageHtml(10), 2: STRUCTURAL_CHANGE_HTML });
    const result = await runCodigoAzulIngestion();
    expect(result.status).toBe("schema_changed");
    expect(result.structuralChangeDetail).toBeDefined();
    expect(criticalPoiCreate).not.toHaveBeenCalled();
    expect(criticalPoiUpdate).not.toHaveBeenCalled();
  });

  it("una caida anomala de registros respecto de la corrida anterior se marca degraded y no toca la base", async () => {
    ingestionRunFindFirst.mockResolvedValue({ count: 89 });
    mockFetchByPage({ 1: buildPageHtml(3), 2: EMPTY_PAGE_HTML });
    const result = await runCodigoAzulIngestion();
    expect(result.status).toBe("degraded");
    expect(criticalPoiCreate).not.toHaveBeenCalled();
  });

  it("cero registros sin corrida previa no se trata como anomalia degradada (primera corrida real)", async () => {
    ingestionRunFindFirst.mockResolvedValue(null);
    mockFetchByPage({ 1: EMPTY_PAGE_HTML });
    const result = await runCodigoAzulIngestion();
    expect(result.status).toBe("success");
    expect(result.recordsFetched).toBe(0);
  });

  it("crea un CriticalPoi nuevo por cada fila cuando no hay coincidencia existente", async () => {
    criticalPoiFindMany.mockResolvedValue([]);
    mockFetchByPage({ 1: buildPageHtml(2), 2: EMPTY_PAGE_HTML });
    const result = await runCodigoAzulIngestion();
    expect(result.recordsCreated).toBe(2);
    expect(criticalPoiCreate).toHaveBeenCalledTimes(2);
  });
});

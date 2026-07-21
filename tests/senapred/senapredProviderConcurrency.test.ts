import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit 2026-07-21 — root cause of the Global Watch 300s Vercel timeout
 * (`504 FUNCTION_INVOCATION_TIMEOUT`): `fetchChileOfficialAlertsRaw()` used
 * to fetch full per-alert detail (`fetchAlertaDetail`) one at a time inside
 * a plain `for` loop. During an active severe-weather period many alerts
 * match `DETAIL_WORTHY_PATTERN`, turning into that many strictly sequential
 * AppSync round trips with zero concurrency — confirmed (via `vercel logs`
 * showing "decenas" of sequential calls to the AppSync endpoint) as the
 * single largest contributor to the timeout.
 *
 * This suite proves the fix at the real-implementation level (only the
 * AppSync-facing GraphQL client is mocked): the per-alert detail lookup now
 * runs with bounded concurrency, not one call at a time and not an
 * unbounded `Promise.all`.
 */

vi.mock("@/lib/adapters/senapred/senapredGraphqlClient", () => ({
  fetchSenapredReferenceTables: vi.fn(),
  fetchAlertasByDatePage: vi.fn(),
  fetchAlertaDetail: vi.fn(),
}));

import {
  fetchAlertaDetail,
  fetchAlertasByDatePage,
  fetchSenapredReferenceTables,
} from "@/lib/adapters/senapred/senapredGraphqlClient";
import { fetchChileOfficialAlertsRaw } from "@/lib/sources/chile/senapredProvider";

const fetchReferenceTablesMock = vi.mocked(fetchSenapredReferenceTables);
const fetchAlertasByDatePageMock = vi.mocked(fetchAlertasByDatePage);
const fetchAlertaDetailMock = vi.mocked(fetchAlertaDetail);

const TOTAL_ALERTS = 24;
const DETAIL_DELAY_MS = 20;

function makeAlerta(i: number) {
  return {
    id: `alert-${i}`,
    titulo: `Se declara Alerta Roja por evento ${i}`,
    contenido: "Lluvias intensas y viento fuerte.",
    fechaHora: "2026-07-20T10:00:00.000Z",
    autor: "SENAPRED",
    isActive: true,
    isDeleted: false,
    urlAccess: `alert-${i}`,
    regionesIds: [] as string[],
    variableRiesgo: { nombre: "Lluvia", codigo: "LLU", tipoAlerta: { nombre: "Alerta Roja", codigo: "ROJ" } },
  };
}

let inFlight = 0;
let maxInFlight = 0;
let totalCalls = 0;

beforeEach(() => {
  inFlight = 0;
  maxInFlight = 0;
  totalCalls = 0;
  fetchReferenceTablesMock.mockResolvedValue({ Region: [], Provincia: [], Comuna: [] });
  fetchAlertasByDatePageMock.mockResolvedValue({
    items: Array.from({ length: TOTAL_ALERTS }, (_, i) => makeAlerta(i)),
    nextToken: null,
    errors: [],
  });
  fetchAlertaDetailMock.mockImplementation(async (id: string) => {
    totalCalls += 1;
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, DETAIL_DELAY_MS));
    inFlight -= 1;
    return {
      id,
      titulo: "",
      fechaHora: "",
      isActive: true,
      isDeleted: false,
      regionesIds: [],
      provincias: [],
      comunas: [],
    } as never;
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("fetchChileOfficialAlertsRaw — concurrencia acotada del detalle por alerta", () => {
  it("nunca deja más de un puñado de llamadas AppSync en vuelo a la vez (acotado, no ilimitado)", async () => {
    await fetchChileOfficialAlertsRaw({
      fromDate: "2026-07-01T00:00:00.000Z",
      toDate: "2026-07-21T00:00:00.000Z",
    });

    expect(totalCalls).toBe(TOTAL_ALERTS);
    expect(maxInFlight).toBeLessThanOrEqual(8);
  });

  it("sí corre en paralelo (no una llamada a la vez como antes de la corrección)", async () => {
    await fetchChileOfficialAlertsRaw({
      fromDate: "2026-07-01T00:00:00.000Z",
      toDate: "2026-07-21T00:00:00.000Z",
    });

    expect(maxInFlight).toBeGreaterThan(1);
  });

  it("es sustancialmente más rápido que el equivalente estrictamente secuencial", async () => {
    const start = Date.now();
    await fetchChileOfficialAlertsRaw({
      fromDate: "2026-07-01T00:00:00.000Z",
      toDate: "2026-07-21T00:00:00.000Z",
    });
    const elapsed = Date.now() - start;
    const sequentialWorstCase = TOTAL_ALERTS * DETAIL_DELAY_MS;

    expect(elapsed).toBeLessThan(sequentialWorstCase);
  });
});

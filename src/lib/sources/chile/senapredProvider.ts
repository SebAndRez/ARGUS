import {
  fetchAlertaDetail,
  fetchAlertasByDatePage,
  fetchSenapredReferenceTables,
  type SenapredAlertaRecord,
} from "@/lib/adapters/senapred/senapredGraphqlClient";

/**
 * Raw SENAPRED alert, before classification/severity mapping — feeds
 * `severeWeatherClassifier`/`alertPromotionEngine`. Deliberately not
 * pre-classified here (unlike `senapredEventosAdapter`, which serves the
 * separate `ArgusEvent`/demo pipeline) so this pipeline applies its own
 * TORNADO/WATERSPOUT/SEVERE_WIND/... classification consistently.
 */
export type ChileOfficialAlertRaw = {
  title: string;
  region?: string;
  province?: string;
  commune?: string;
  /** variableRiesgo.nombre + a plain-text excerpt of contenido — classifier input. */
  threatText: string;
  /** tipoAlerta.nombre, e.g. "Alerta Roja" / "Alerta Amarilla" / "Alerta Verde". */
  levelText: string;
  issuedAt: string;
  updatedAt: string;
  validUntil?: string;
  sourceId: "senapred_eventos";
  evidenceUrl?: string;
  /** Full alert body, kept for DMC-mention extraction (see `dmcProvider.ts`). */
  contenido?: string;
};

const SENAPRED_EVENTOS_BASE_URL = "https://www.senapred.cl/eventos/";

/** Cheap pre-filter so we don't fetch full per-alert detail (comuna/provincia breakdown) for every routine green/monitoring alert — only for ones plausibly severe. Actual classification happens in `severeWeatherClassifier`. */
const DETAIL_WORTHY_PATTERN = /roja|naranja|tornado|tromba|viento|tormenta|el[ée]ctrica|remoci[oó]n|aluvi[oó]n|inundaci[oó]n|desborde/i;

/**
 * Confirmed root cause of the Global Watch 300s timeout (2026-07-21 audit):
 * this was previously a plain `for` loop doing `await fetchAlertaDetail(item.id)`
 * one at a time. During an active severe-weather period, dozens of alerts
 * match `DETAIL_WORTHY_PATTERN`, turning into that many strictly sequential
 * AppSync round trips with no concurrency — the single largest contributor
 * to the timeout. Bounded to a fixed worker-pool concurrency instead (same
 * queue-shift idiom already used by `globalWatchEngine.ts`'s
 * `PERSIST_CONCURRENCY`), not an unbounded `Promise.all`.
 */
const DETAIL_FETCH_CONCURRENCY = 8;

function stripHtml(value?: string): string {
  return (value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function toIsoDate(value: string): string {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : value;
}

export async function fetchChileOfficialAlertsRaw(params?: {
  fromDate?: string;
  toDate?: string;
  maxPages?: number;
}): Promise<{ alerts: ChileOfficialAlertRaw[]; warnings: string[]; errors: string[] }> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const now = new Date();
  const fromDate = params?.fromDate ?? new Date(now.getTime() - 30 * 24 * 60 * 60_000).toISOString();
  const toDate = params?.toDate ?? now.toISOString();
  const maxPages = params?.maxPages ?? 5;

  const referenceTables = await fetchSenapredReferenceTables();
  const regionById = new Map(referenceTables.Region.map((r) => [r.id, r.nombre]));
  const provinciaById = new Map(referenceTables.Provincia.map((p) => [p.id, p.nombre]));
  const comunaById = new Map(referenceTables.Comuna.map((c) => [c.id, c.nombre]));

  const allItems: SenapredAlertaRecord[] = [];
  let nextToken: string | null = null;
  let page = 0;
  do {
    const result = await fetchAlertasByDatePage({ fromDate, toDate, nextToken });
    if (result.errors.length > 0) {
      errors.push(...result.errors);
      break;
    }
    allItems.push(...result.items);
    nextToken = result.nextToken;
    page += 1;
  } while (nextToken && page < maxPages);
  if (nextToken) warnings.push(`Stopped after ${maxPages} pages; more SENAPRED alerts may exist in range.`);

  // Pass 1 (sync, cheap): derive per-item fields and decide which alerts
  // actually need a detail lookup — no network I/O yet.
  const prepared = allItems.map((item) => {
    const regionNames = item.regionesIds.map((id) => regionById.get(id)).filter((name): name is string => Boolean(name));
    const levelText = item.variableRiesgo?.tipoAlerta?.nombre ?? "";
    const threatTextBase = `${item.variableRiesgo?.nombre ?? ""} ${stripHtml(item.contenido)}`.trim();
    const needsDetail = DETAIL_WORTHY_PATTERN.test(`${item.titulo} ${levelText} ${threatTextBase}`);
    return { item, regionNames, levelText, threatTextBase, needsDetail };
  });

  // Pass 2 (network, bounded concurrency): fetch full detail only for the
  // alerts that need it, `DETAIL_FETCH_CONCURRENCY` at a time instead of one
  // at a time — same outcome per alert (best-effort, `null` on failure),
  // just no longer serialized behind each other's round-trip latency.
  const detailIds = prepared.filter((p) => p.needsDetail).map((p) => p.item.id);
  const detailById = new Map<string, Awaited<ReturnType<typeof fetchAlertaDetail>>>();
  const detailQueue = [...detailIds];
  async function detailWorker() {
    for (let id = detailQueue.shift(); id; id = detailQueue.shift()) {
      const detail = await fetchAlertaDetail(id).catch(() => null);
      if (detail) detailById.set(id, detail);
    }
  }
  await Promise.all(Array.from({ length: Math.min(DETAIL_FETCH_CONCURRENCY, detailIds.length) }, () => detailWorker()));

  // Pass 3 (sync): assemble the final alerts using the pre-fetched details.
  const alerts: ChileOfficialAlertRaw[] = prepared.map(({ item, regionNames, levelText, threatTextBase, needsDetail }) => {
    let province: string | undefined;
    let commune: string | undefined;
    if (needsDetail) {
      const detail = detailById.get(item.id);
      if (detail) {
        province = detail.provincias.map((id) => provinciaById.get(id)).find(Boolean);
        commune = detail.comunas.map((id) => comunaById.get(id)).find(Boolean);
      }
    }

    return {
      title: stripHtml(item.titulo),
      region: regionNames[0],
      province,
      commune,
      threatText: threatTextBase || item.titulo,
      levelText,
      issuedAt: toIsoDate(item.fechaHora),
      updatedAt: toIsoDate(item.fechaHora),
      sourceId: "senapred_eventos" as const,
      evidenceUrl: item.urlAccess ? `${SENAPRED_EVENTOS_BASE_URL}${item.urlAccess}` : SENAPRED_EVENTOS_BASE_URL,
      contenido: item.contenido,
    };
  });

  return { alerts, warnings, errors };
}

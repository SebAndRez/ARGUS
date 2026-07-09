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

  const alerts: ChileOfficialAlertRaw[] = [];
  for (const item of allItems) {
    const regionNames = item.regionesIds.map((id) => regionById.get(id)).filter((name): name is string => Boolean(name));
    const levelText = item.variableRiesgo?.tipoAlerta?.nombre ?? "";
    const threatTextBase = `${item.variableRiesgo?.nombre ?? ""} ${stripHtml(item.contenido)}`.trim();

    let province: string | undefined;
    let commune: string | undefined;
    if (DETAIL_WORTHY_PATTERN.test(`${item.titulo} ${levelText} ${threatTextBase}`)) {
      const detail = await fetchAlertaDetail(item.id).catch(() => null);
      if (detail) {
        province = detail.provincias.map((id) => provinciaById.get(id)).find(Boolean);
        commune = detail.comunas.map((id) => comunaById.get(id)).find(Boolean);
      }
    }

    alerts.push({
      title: stripHtml(item.titulo),
      region: regionNames[0],
      province,
      commune,
      threatText: threatTextBase || item.titulo,
      levelText,
      issuedAt: toIsoDate(item.fechaHora),
      updatedAt: toIsoDate(item.fechaHora),
      sourceId: "senapred_eventos",
      evidenceUrl: item.urlAccess ? `${SENAPRED_EVENTOS_BASE_URL}${item.urlAccess}` : SENAPRED_EVENTOS_BASE_URL,
      contenido: item.contenido,
    });
  }

  return { alerts, warnings, errors };
}

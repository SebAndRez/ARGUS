import { getAnonymousAwsCredentials, signAppSyncRequest } from "@/lib/adapters/senapred/senapredAwsAuth";

const APPSYNC_URL = "https://rz2uv7ifxbgflh2bqmp6kmh4le.appsync-api.us-east-1.amazonaws.com/graphql";
const REQUEST_TIMEOUT_MS = 10_000;

export type SenapredReferenceRecord = { id: string; nombre: string; codigo: string };

export type SenapredAlertaRecord = {
  id: string;
  titulo: string;
  contenido?: string;
  fechaHora: string;
  autor?: string;
  isActive: boolean;
  isDeleted: boolean;
  urlAccess?: string;
  regionesIds: string[];
  variableRiesgo?: {
    nombre?: string;
    codigo?: string;
    tipoAlerta?: { nombre?: string; codigo?: string };
  };
};

type GraphqlResponse<T> = { data?: T; errors?: Array<{ message: string }> };

async function executeSignedGraphql<T>(query: string, variables: Record<string, unknown>): Promise<GraphqlResponse<T>> {
  const credentials = await getAnonymousAwsCredentials();
  const body = JSON.stringify({ query, variables });
  const headers = signAppSyncRequest({ url: APPSYNC_URL, body, credentials });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(APPSYNC_URL, {
      method: "POST",
      cache: "no-store",
      headers,
      body,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`SENAPRED AppSync responded ${response.status}`);
    return (await response.json()) as GraphqlResponse<T>;
  } finally {
    clearTimeout(timeout);
  }
}

const ALERTAS_BY_DATE_QUERY = `
  query AlertasByDate(
    $type: String!
    $fechaHora: ModelStringKeyConditionInput
    $sortDirection: ModelSortDirection
    $filter: ModelAlertaFilterInput
    $limit: Int
    $nextToken: String
  ) {
    alertasByDate(type: $type, fechaHora: $fechaHora, sortDirection: $sortDirection, filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        titulo
        contenido
        fechaHora
        autor
        isActive
        isDeleted
        urlAccess
        regionesIds
        variableRiesgo {
          nombre
          codigo
          tipoAlerta {
            nombre
            codigo
          }
        }
      }
      nextToken
    }
  }
`;

const REFERENCE_TABLE_QUERIES: Record<"Region" | "Provincia" | "Comuna", string> = {
  Region: `
    query RegionesByCodigo($type: String!, $limit: Int, $nextToken: String) {
      regionesByCodigo(type: $type, limit: $limit, nextToken: $nextToken) {
        items { id nombre codigo }
        nextToken
      }
    }
  `,
  Provincia: `
    query ProvinciasByCodigo($type: String!, $limit: Int, $nextToken: String) {
      provinciasByCodigo(type: $type, limit: $limit, nextToken: $nextToken) {
        items { id nombre codigo }
        nextToken
      }
    }
  `,
  Comuna: `
    query ComunasByCodigo($type: String!, $limit: Int, $nextToken: String) {
      comunasByCodigo(type: $type, limit: $limit, nextToken: $nextToken) {
        items { id nombre codigo }
        nextToken
      }
    }
  `,
};

const REFERENCE_QUERY_ROOT_KEY: Record<"Region" | "Provincia" | "Comuna", string> = {
  Region: "regionesByCodigo",
  Provincia: "provinciasByCodigo",
  Comuna: "comunasByCodigo",
};

/** Fetches `alertasByDate(type: "Alerta", ...)`, paginating until `nextToken` is exhausted or `maxPages` is hit. */
export async function fetchAlertasByDatePage(params: {
  fromDate: string;
  toDate: string;
  onlyActive?: boolean;
  limit?: number;
  nextToken?: string | null;
}): Promise<{ items: SenapredAlertaRecord[]; nextToken: string | null; errors: string[] }> {
  const response = await executeSignedGraphql<{
    alertasByDate: { items: SenapredAlertaRecord[]; nextToken: string | null };
  }>(ALERTAS_BY_DATE_QUERY, {
    type: "Alerta",
    fechaHora: { between: [params.fromDate, params.toDate] },
    sortDirection: "DESC",
    filter: params.onlyActive === false ? undefined : { isActive: { eq: true }, isDeleted: { ne: true } },
    limit: params.limit ?? 100,
    nextToken: params.nextToken ?? null,
  });

  if (response.errors?.length) {
    return { items: [], nextToken: null, errors: response.errors.map((error) => error.message) };
  }
  return {
    items: response.data?.alertasByDate.items ?? [],
    nextToken: response.data?.alertasByDate.nextToken ?? null,
    errors: [],
  };
}

/** 24h in-module TTL cache — Chile's region/provincia/comuna reference tables are static data, same TTL-cache pattern as `iocSlsmfAdapter.ts`'s station list cache. */
const REFERENCE_TABLE_TTL_MS = 24 * 60 * 60_000;
let referenceTableCache: { fetchedAt: number; tables: Record<"Region" | "Provincia" | "Comuna", SenapredReferenceRecord[]> } | null = null;

type ReferenceTablePage = { items: SenapredReferenceRecord[]; nextToken: string | null };

async function fetchReferenceTable(kind: "Region" | "Provincia" | "Comuna"): Promise<SenapredReferenceRecord[]> {
  const rootKey = REFERENCE_QUERY_ROOT_KEY[kind];
  let items: SenapredReferenceRecord[] = [];
  let nextToken: string | null = null;
  let hasMore = true;
  while (hasMore) {
    const variables: Record<string, unknown> = { type: kind, limit: 200, nextToken };
    const response = await executeSignedGraphql<Record<string, ReferenceTablePage>>(REFERENCE_TABLE_QUERIES[kind], variables);
    if (response.errors?.length) throw new Error(`SENAPRED ${kind} reference fetch failed: ${response.errors[0].message}`);
    const page: ReferenceTablePage | undefined = response.data?.[rootKey];
    if (!page) break;
    items = items.concat(page.items);
    nextToken = page.nextToken;
    hasMore = Boolean(nextToken);
  }
  return items;
}

/** Region/provincia/comuna id -> nombre lookup tables, cached ~24h (this is static reference data, not live event data). */
export async function fetchSenapredReferenceTables(): Promise<Record<"Region" | "Provincia" | "Comuna", SenapredReferenceRecord[]>> {
  if (referenceTableCache && Date.now() - referenceTableCache.fetchedAt < REFERENCE_TABLE_TTL_MS) {
    return referenceTableCache.tables;
  }
  const [regiones, provincias, comunas] = await Promise.all([
    fetchReferenceTable("Region"),
    fetchReferenceTable("Provincia"),
    fetchReferenceTable("Comuna"),
  ]);
  const tables = { Region: regiones, Provincia: provincias, Comuna: comunas };
  referenceTableCache = { fetchedAt: Date.now(), tables };
  return tables;
}

export type SenapredAlertaDetail = SenapredAlertaRecord & {
  urlAccess?: string;
  provincias: string[]; // provinciaIds
  comunas: string[]; // comunaIds
};

const GET_ALERTA_QUERY = `
  query GetAlerta($id: ID!) {
    getAlerta(id: $id) {
      id
      titulo
      contenido
      fechaHora
      autor
      isActive
      isDeleted
      urlAccess
      regionesIds
      variableRiesgo {
        nombre
        codigo
        tipoAlerta {
          nombre
          codigo
        }
      }
      provincias {
        items { provinciaId }
      }
      comunas {
        items { comunaId }
      }
    }
  }
`;

/** Full alert detail, including comuna/provincia breakdown (not present in the `alertasByDate` list query) — used only for alerts that already passed severity filtering, to avoid an N+1 fetch across every fetched alert. */
export async function fetchAlertaDetail(id: string): Promise<SenapredAlertaDetail | null> {
  const response = await executeSignedGraphql<{
    getAlerta:
      | (SenapredAlertaRecord & {
          provincias: { items: Array<{ provinciaId: string }> };
          comunas: { items: Array<{ comunaId: string }> };
        })
      | null;
  }>(GET_ALERTA_QUERY, { id });

  if (response.errors?.length || !response.data?.getAlerta) return null;
  const detail = response.data.getAlerta;
  return {
    ...detail,
    provincias: detail.provincias.items.map((item) => item.provinciaId),
    comunas: detail.comunas.items.map((item) => item.comunaId),
  };
}

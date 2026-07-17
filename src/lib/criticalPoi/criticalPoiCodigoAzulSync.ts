import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logOperationalEvent } from "@/lib/observability/operationalEvents";
import { getCriticalPoiCategory } from "@/lib/criticalPoi/criticalPoiCategoryRegistry";
import type { CriticalPoi, CriticalPriority } from "@/lib/criticalPoi/criticalPoiTypes";
import {
  inferShelterEventType,
  resolveShelterCandidateIdentity,
  shouldApplyShelterReport,
  type ShelterCandidateReport,
} from "@/lib/criticalPoi/shelterStatusDeduplication";
import {
  applyShelterStatusReport,
  getOperationalStatusByPoiId,
  recordShelterStatusEvidenceOnly,
} from "@/lib/criticalPoi/shelterOperationalStatusService";
import { DEFAULT_CONFIDENCE_BY_SOURCE_TYPE, type ShelterOperationalStatusReport } from "@/lib/criticalPoi/shelterOperationalStatusTypes";
import {
  CODIGO_AZUL_BASE_URL,
  CodigoAzulStructuralChangeError,
  extractLeadingNumericId,
  fetchAlberguesPage,
  parseAlberguesPage,
  type CodigoAzulRawRow,
} from "@/lib/criticalPoi/codigoAzul/codigoAzulHtmlParser";
import { normalizeCommune, normalizeRegionName } from "@/lib/criticalPoi/codigoAzul/chileRegionNormalizer";
import { mapAlbergueTipo } from "@/lib/criticalPoi/codigoAzul/codigoAzulTypeMap";
import { geocodeAddress } from "@/lib/geocoding/nominatimServerClient";

/**
 * Orquestador de la sincronizacion de albergues Codigo Azul
 * (`https://codigoazul.ministeriodesarrollosocial.gob.cl/albergues`).
 * Mismo patron fetch->normalizar->persistir que `criticalPoiOsmSync.ts`,
 * con paginacion secuencial, tolerancia a fallas parciales, deteccion de
 * cambio estructural y una salvaguarda anti-archivado-masivo (spec ARGUS
 * v1.0.3.5 §6/§12/§30). Nunca inventa coordenadas, ocupacion ni
 * disponibilidad — ver `shelterOperationalStatusTypes.ts`.
 */

const MAX_PAGES_SAFETY_CAP = 30;
const PAGE_FETCH_DELAY_MS = 700;
/** Caida de mas del 50% de registros respecto de la ultima corrida exitosa se trata como anomalia, nunca como "el resto se archivo". */
const ANOMALOUS_DROP_RATIO = 0.5;

/** Bbox laxo de Chile continental + insular cercano (excluye Rapa Nui/Isla de Pascua, que Codigo Azul no cubre). */
const CHILE_BBOX = { south: -56.0, north: -17.0, west: -76.0, east: -66.0 };

function isWithinChile(lat: number, lng: number): boolean {
  return lat >= CHILE_BBOX.south && lat <= CHILE_BBOX.north && lng >= CHILE_BBOX.west && lng <= CHILE_BBOX.east;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** id estable cuando la fuente no trae un identificador numerico confiable al inicio de "Nombre" — determinista a partir de nombre+comuna+region, nunca aleatorio. */
function buildFallbackExternalId(row: CodigoAzulRawRow): string {
  const basis = `${row.nombre}|${row.comuna}|${row.region}`.toLowerCase();
  let hash = 0;
  for (let index = 0; index < basis.length; index += 1) {
    hash = (hash * 31 + basis.charCodeAt(index)) >>> 0;
  }
  return `hash-${hash.toString(16)}`;
}

export interface NormalizedCodigoAzulRecord {
  externalId: string;
  isFallbackId: boolean;
  displayName: string;
  rawRow: CodigoAzulRawRow;
  region: { code: number; canonicalName: string } | null;
  commune?: string;
  coordinates: { lat: number; lng: number } | null;
  locationAccuracy: "precise" | "approximate" | "commune_centroid" | "unresolved";
  capacityDeclared?: number;
}

/** Extrae y limpia los campos de una fila cruda; no resuelve coordenadas todavia (ver `resolveCoordinates`). */
function normalizeRow(row: CodigoAzulRawRow): Omit<NormalizedCodigoAzulRecord, "coordinates" | "locationAccuracy"> {
  const numericId = extractLeadingNumericId(row.nombre);
  const displayName = row.nombre.replace(/^\d{5,7}\s*-\s*/, "").trim() || row.nombre;
  const cuposNumber = Number(row.cuposRaw);
  const capacityDeclared = Number.isFinite(cuposNumber) && Number.isInteger(cuposNumber) && cuposNumber >= 0 ? cuposNumber : undefined;

  return {
    externalId: numericId ?? buildFallbackExternalId(row),
    isFallbackId: !numericId,
    displayName,
    rawRow: row,
    region: normalizeRegionName(row.region),
    commune: normalizeCommune(row.comuna),
    capacityDeclared,
  };
}

/** Prioridad de georreferenciacion (spec §9): coordenadas de la fuente -> geocodificacion por direccion -> geocodificacion a nivel de comuna -> sin resolver. Nunca ubica en el centro de la comuna como si fuera la direccion exacta sin marcarlo como tal. */
async function resolveCoordinates(
  row: CodigoAzulRawRow,
  region: { canonicalName: string } | null,
  commune: string | undefined,
  geocodeCache: Map<string, { lat: number; lng: number } | null>
): Promise<{ coordinates: { lat: number; lng: number } | null; locationAccuracy: NormalizedCodigoAzulRecord["locationAccuracy"] }> {
  if (row.sourceCoordinates && isWithinChile(row.sourceCoordinates.lat, row.sourceCoordinates.lng)) {
    return { coordinates: row.sourceCoordinates, locationAccuracy: "precise" };
  }

  const addressQuery = [row.direccion, commune, region?.canonicalName, "Chile"].filter(Boolean).join(", ");
  if (row.direccion) {
    const cached = geocodeCache.get(addressQuery);
    if (cached !== undefined) {
      if (cached) return { coordinates: cached, locationAccuracy: "approximate" };
    } else {
      try {
        const [best] = await geocodeAddress(addressQuery, { limit: 1 });
        const resolved = best && isWithinChile(best.lat, best.lng) ? { lat: best.lat, lng: best.lng } : null;
        geocodeCache.set(addressQuery, resolved);
        if (resolved) return { coordinates: resolved, locationAccuracy: "approximate" };
      } catch {
        geocodeCache.set(addressQuery, null);
      }
    }
  }

  const communeQuery = [commune, region?.canonicalName, "Chile"].filter(Boolean).join(", ");
  if (commune) {
    const cached = geocodeCache.get(communeQuery);
    if (cached !== undefined) {
      if (cached) return { coordinates: cached, locationAccuracy: "commune_centroid" };
    } else {
      try {
        const [best] = await geocodeAddress(communeQuery, { limit: 1 });
        const resolved = best && isWithinChile(best.lat, best.lng) ? { lat: best.lat, lng: best.lng } : null;
        geocodeCache.set(communeQuery, resolved);
        if (resolved) return { coordinates: resolved, locationAccuracy: "commune_centroid" };
      } catch {
        geocodeCache.set(communeQuery, null);
      }
    }
  }

  return { coordinates: null, locationAccuracy: "unresolved" };
}

export type CodigoAzulIngestionStatus = "success" | "partial_success" | "degraded" | "schema_changed" | "failed";

export interface CodigoAzulIngestionResult {
  status: CodigoAzulIngestionStatus;
  pagesProcessed: number;
  pageErrors: number;
  recordsFetched: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsUnchanged: number;
  recordsAmbiguous: number;
  /** No georreferenciable con ninguna fuente disponible — no se crea CriticalPoi (nunca se inventa una coordenada), pero queda contabilizado para revision (spec §14). */
  recordsUnresolved: number;
  recordsInvalid: number;
  structuralChangeDetail?: string;
  durationMs: number;
}

const SOURCE_ID = "codigo_azul" as const;
const SOURCE_NAME = "Código Azul — Ministerio de Desarrollo Social y Familia";

export async function runCodigoAzulIngestion(options: { maxPages?: number } = {}): Promise<CodigoAzulIngestionResult> {
  const startedAt = Date.now();
  const maxPages = options.maxPages ?? MAX_PAGES_SAFETY_CAP;

  const rows: CodigoAzulRawRow[] = [];
  let pagesProcessed = 0;
  let pageErrors = 0;
  let structuralChangeDetail: string | undefined;

  for (let page = 1; page <= maxPages; page += 1) {
    if (page > 1) await sleep(PAGE_FETCH_DELAY_MS);

    let parsed;
    try {
      const { html } = await fetchAlberguesPage(page);
      parsed = parseAlberguesPage(html);
    } catch (error) {
      if (error instanceof CodigoAzulStructuralChangeError) {
        structuralChangeDetail = error.message;
        logOperationalEvent({
          event: "codigo_azul_schema_changed",
          level: "error",
          component: "codigo-azul-shelter-sync",
          sourceId: SOURCE_ID,
          detail: { page, message: error.message },
        });
        break;
      }
      pageErrors += 1;
      logOperationalEvent({
        event: "codigo_azul_page_fetch_failed",
        level: "warn",
        component: "codigo-azul-shelter-sync",
        sourceId: SOURCE_ID,
        detail: { page, message: error instanceof Error ? error.message : "unknown" },
      });
      continue;
    }

    pagesProcessed += 1;
    if (parsed.isEmptyResultsPage) break;
    rows.push(...parsed.rows);
  }

  const previousRun = await prisma.ingestionRun.findFirst({
    where: { sourceId: SOURCE_ID, status: "success" },
    orderBy: { fetchedAt: "desc" },
    select: { count: true },
  });
  const previousCount = previousRun?.count ?? null;
  const anomalousDrop =
    !structuralChangeDetail &&
    previousCount !== null &&
    previousCount > 0 &&
    (rows.length === 0 || rows.length < previousCount * ANOMALOUS_DROP_RATIO);

  if (structuralChangeDetail || anomalousDrop) {
    if (anomalousDrop) {
      logOperationalEvent({
        event: "codigo_azul_anomalous_drop",
        level: "error",
        component: "codigo-azul-shelter-sync",
        sourceId: SOURCE_ID,
        count: rows.length,
        detail: { previousCount, currentCount: rows.length },
      });
    }
    return {
      status: structuralChangeDetail ? "schema_changed" : "degraded",
      pagesProcessed,
      pageErrors,
      recordsFetched: rows.length,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsUnchanged: 0,
      recordsAmbiguous: 0,
      recordsUnresolved: 0,
      recordsInvalid: 0,
      structuralChangeDetail,
      durationMs: Date.now() - startedAt,
    };
  }

  let recordsCreated = 0;
  let recordsUpdated = 0;
  let recordsUnchanged = 0;
  let recordsAmbiguous = 0;
  let recordsUnresolved = 0;
  let recordsInvalid = 0;
  const geocodeCache = new Map<string, { lat: number; lng: number } | null>();
  const now = new Date();
  const categoryDef = getCriticalPoiCategory("shelter");
  const priority: CriticalPriority = categoryDef?.priority ?? "P3";

  for (const row of rows) {
    if (!row.nombre.trim() || !row.direccion.trim()) {
      recordsInvalid += 1;
      continue;
    }

    const normalized = normalizeRow(row);
    const { coordinates, locationAccuracy } = await resolveCoordinates(row, normalized.region, normalized.commune, geocodeCache);

    if (!coordinates) {
      recordsUnresolved += 1;
      logOperationalEvent({
        event: "codigo_azul_unresolved_location",
        level: "warn",
        component: "codigo-azul-shelter-sync",
        sourceId: SOURCE_ID,
        detail: { nombre: normalized.displayName, comuna: normalized.commune },
      });
      continue;
    }

    const typeMapping = mapAlbergueTipo(row.tipo);
    const candidate: ShelterCandidateReport = {
      name: normalized.displayName,
      commune: normalized.commune,
      lat: coordinates.lat,
      lng: coordinates.lng,
      externalId: normalized.externalId,
      source: "official_open_data",
    };

    const resolution = await resolveShelterCandidateIdentity(candidate);

    if (resolution.kind === "ambiguous") {
      recordsAmbiguous += 1;
      logOperationalEvent({
        event: "codigo_azul_ambiguous_match",
        level: "warn",
        component: "codigo-azul-shelter-sync",
        sourceId: SOURCE_ID,
        detail: { nombre: normalized.displayName, candidatePoiIds: resolution.candidates.map((poi: CriticalPoi) => poi.id) },
      });
      continue;
    }

    const poiFields = {
      name: normalized.displayName,
      category: "shelter" as const,
      priority,
      latitude: coordinates.lat,
      longitude: coordinates.lng,
      countryCode: "CL",
      adminLevel1: normalized.region?.canonicalName,
      city: normalized.commune,
      address: row.direccion,
      status: "active" as const,
      confidence: locationAccuracy === "precise" ? 85 : locationAccuracy === "approximate" ? 65 : 50,
      lastSeenAt: now,
      tagsJson: toJson({
        source: "codigo_azul",
        tipoOriginal: typeMapping.originalLabel,
        subtype: typeMapping.subtype,
        componente: row.componente,
        rawNombre: row.nombre,
        locationAccuracy,
      }),
      sourceUrl: CODIGO_AZUL_BASE_URL,
    };

    let poiId: string;
    if (resolution.kind === "new") {
      const created = await prisma.criticalPoi.create({
        data: {
          externalId: normalized.externalId,
          source: "official_open_data",
          name: poiFields.name,
          category: poiFields.category,
          priority: poiFields.priority,
          latitude: poiFields.latitude,
          longitude: poiFields.longitude,
          countryCode: poiFields.countryCode,
          adminLevel1: poiFields.adminLevel1,
          city: poiFields.city,
          address: poiFields.address,
          status: poiFields.status,
          confidence: poiFields.confidence,
          lastSeenAt: poiFields.lastSeenAt,
          tagsJson: poiFields.tagsJson,
          sourceUrl: poiFields.sourceUrl,
          isPersistent: true,
          isVisibleByDefault: true,
        },
      });
      poiId = created.id;
      recordsCreated += 1;
    } else {
      poiId = resolution.poi.id;
      await prisma.criticalPoi.update({
        where: { id: poiId },
        data: {
          name: poiFields.name,
          adminLevel1: poiFields.adminLevel1,
          city: poiFields.city,
          address: poiFields.address,
          confidence: poiFields.confidence,
          lastSeenAt: poiFields.lastSeenAt,
          tagsJson: poiFields.tagsJson,
        },
      });
      recordsUpdated += 1;
    }

    const report: ShelterOperationalStatusReport = {
      capacityDeclared: normalized.capacityDeclared,
      operatingHours: row.horario || undefined,
      operatorName: row.institucion || undefined,
      contactNotes: row.componente ? `Componente: ${row.componente}` : undefined,
      verificationStatus: "candidate",
      sourceType: "codigo_azul",
      sourceName: SOURCE_NAME,
      sourceUrl: CODIGO_AZUL_BASE_URL,
      confidenceScore: DEFAULT_CONFIDENCE_BY_SOURCE_TYPE.codigo_azul,
    };

    const existingStatus = await getOperationalStatusByPoiId(poiId);
    const hasFieldChange =
      !existingStatus ||
      existingStatus.capacityDeclared !== report.capacityDeclared ||
      existingStatus.operatingHours !== report.operatingHours ||
      existingStatus.operatorName !== report.operatorName;

    if (!hasFieldChange) {
      recordsUnchanged += 1;
    } else {
      // Precedencia respetada aunque Codigo Azul solo reporte capacidad/
      // horario/operador (nunca shelterStatus/routeStatus/servicios): una
      // fuente de mayor autoridad ya vigente (p.ej. SENAPRED) no debe verse
      // degradada por un resync de Codigo Azul — ver shouldApplyShelterReport.
      const applies = shouldApplyShelterReport(existingStatus, report);
      const eventType = inferShelterEventType(existingStatus, report, applies);
      if (applies) {
        await applyShelterStatusReport(poiId, report, eventType);
        if (existingStatus) recordsUpdated += 1;
      } else {
        await recordShelterStatusEvidenceOnly(poiId, report, eventType);
        recordsUnchanged += 1;
      }
    }
  }

  const durationMs = Date.now() - startedAt;
  const status: CodigoAzulIngestionStatus = pageErrors > 0 ? "partial_success" : "success";

  return {
    status,
    pagesProcessed,
    pageErrors,
    recordsFetched: rows.length,
    recordsCreated,
    recordsUpdated,
    recordsUnchanged,
    recordsAmbiguous,
    recordsUnresolved,
    recordsInvalid,
    durationMs,
  };
}

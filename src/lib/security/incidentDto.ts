/**
 * ARGUS — DTOs públicos/operador para `Report` y `HelpRequest` (PRIV-FINAL-001).
 *
 * `GET /api/reports` y `GET /api/help-requests` devolvían filas Prisma
 * completas (descripción, coordenadas exactas, ubicación textual) a
 * cualquier llamador sin autenticación. La redacción debe ocurrir
 * server-side, antes de serializar — nunca "devolver todo y ocultar en el
 * frontend" — así que estas funciones son el único punto que decide qué
 * campos salen hacia un llamador público vs. un operador autenticado.
 *
 * Puras, deterministas, no mutan la entrada, y no dependen de Prisma ni de
 * una base real (aceptan objetos estructuralmente compatibles) para poder
 * testearse sin infraestructura.
 */

type AnyRecord = Record<string, unknown>;

/**
 * HelpRequest son solicitudes de auxilio (SOS): inherentemente más
 * sensibles que un reporte de riesgo general, así que su precisión pública
 * es más gruesa. ~11 km en el ecuador — suficiente para mostrar "hay una
 * emergencia en esta zona" sin acercarse a un domicilio.
 */
const HELP_REQUEST_PUBLIC_COORD_PRECISION = 1;

/**
 * Reportes ciudadanos (incendio, corte de ruta, etc.): ~1.1 km en el
 * ecuador. Suficiente para ubicar el evento en un barrio/sector sin exponer
 * la coordenada exacta que el usuario envió.
 */
const REPORT_PUBLIC_COORD_PRECISION = 2;

function roundCoordinate(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function toApproximateLocation(
  latitude: unknown,
  longitude: unknown,
  precision: number
): { lat: number; lng: number } | null {
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { lat: roundCoordinate(latitude, precision), lng: roundCoordinate(longitude, precision) };
}

function toIsoString(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function publicAliasOf(record: AnyRecord): string | null {
  const user = record.user as { publicAlias?: unknown } | null | undefined;
  return typeof user?.publicAlias === "string" ? user.publicAlias : null;
}

export interface PublicHelpRequest {
  id: string;
  status: string;
  category: string | null;
  priority: string | null;
  createdAt: string | null;
  approximateLocation: { lat: number; lng: number } | null;
  isRestricted: boolean;
  summary: string | null;
}

/**
 * Vista pública de un HelpRequest: sin descripción, sin ubicación exacta,
 * sin ubicación textual, sin contacto/identidad. `restrictedMode` (activado
 * por el estado de cuenta del solicitante, no por el contenido) oculta
 * además la ubicación aproximada — reduce la respuesta en vez de excluir el
 * registro completo, para que el mapa público siga pudiendo señalar que
 * existe una solicitud activa sin publicar su zona.
 */
export function toPublicHelpRequest(record: AnyRecord): PublicHelpRequest {
  const isRestricted = record.restrictedMode === true;
  return {
    id: String(record.id ?? ""),
    status: stringOrNull(record.status) ?? "UNKNOWN",
    category: stringOrNull(record.category),
    priority: stringOrNull(record.priority),
    createdAt: toIsoString(record.createdAt),
    approximateLocation: isRestricted
      ? null
      : toApproximateLocation(record.latitude, record.longitude, HELP_REQUEST_PUBLIC_COORD_PRECISION),
    isRestricted,
    // aiSummary es una plantilla generada por analyzeHelpRequest() (categoría +
    // prioridad), nunca un eco del texto libre del solicitante — seguro de exponer.
    summary: stringOrNull(record.aiSummary),
  };
}

export interface OperatorHelpRequest {
  id: string;
  userId: string | null;
  category: string | null;
  title: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  locationText: string | null;
  priority: string | null;
  status: string | null;
  restrictedMode: boolean;
  aiSummary: string | null;
  aiRecommendation: string | null;
  aiConfidence: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  author: string | null;
}

/** Vista de operador/administrador: detalle completo, sin filas Prisma crudas. */
export function toOperatorHelpRequest(record: AnyRecord): OperatorHelpRequest {
  return {
    id: String(record.id ?? ""),
    userId: stringOrNull(record.userId),
    category: stringOrNull(record.category),
    title: stringOrNull(record.title),
    description: stringOrNull(record.description),
    latitude: typeof record.latitude === "number" ? record.latitude : null,
    longitude: typeof record.longitude === "number" ? record.longitude : null,
    locationText: stringOrNull(record.locationText),
    priority: stringOrNull(record.priority),
    status: stringOrNull(record.status),
    restrictedMode: record.restrictedMode === true,
    aiSummary: stringOrNull(record.aiSummary),
    aiRecommendation: stringOrNull(record.aiRecommendation),
    aiConfidence: typeof record.aiConfidence === "number" ? record.aiConfidence : null,
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt),
    author: publicAliasOf(record),
  };
}

export interface PublicReport {
  id: string;
  category: string | null;
  severity: string | null;
  status: string;
  createdAt: string | null;
  approximateLocation: { lat: number; lng: number } | null;
  verified: boolean;
  summary: string | null;
}

/**
 * Vista pública de un Report: sin título/descripción libres (pueden
 * contener direcciones o nombres), sin ubicación textual, sin identidad del
 * reportante, sin metadata de moderación (`falseReportRisk`).
 */
export function toPublicReport(record: AnyRecord): PublicReport {
  return {
    id: String(record.id ?? ""),
    category: stringOrNull(record.category),
    severity: stringOrNull(record.severity),
    status: stringOrNull(record.status) ?? "UNKNOWN",
    createdAt: toIsoString(record.createdAt),
    approximateLocation: toApproximateLocation(record.latitude, record.longitude, REPORT_PUBLIC_COORD_PRECISION),
    verified: record.status === "VALIDATED",
    // aiSummary es una plantilla generada por analyzeReport() (categoría +
    // severidad), nunca un eco del texto libre del reportante.
    summary: stringOrNull(record.aiSummary),
  };
}

export interface OperatorReport {
  id: string;
  userId: string | null;
  category: string | null;
  title: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  locationText: string | null;
  severity: string | null;
  status: string | null;
  aiSummary: string | null;
  aiRecommendation: string | null;
  aiConfidence: number | null;
  falseReportRisk: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  author: string | null;
}

/** Vista de operador/administrador: detalle completo, sin filas Prisma crudas. */
export function toOperatorReport(record: AnyRecord): OperatorReport {
  return {
    id: String(record.id ?? ""),
    userId: stringOrNull(record.userId),
    category: stringOrNull(record.category),
    title: stringOrNull(record.title),
    description: stringOrNull(record.description),
    latitude: typeof record.latitude === "number" ? record.latitude : null,
    longitude: typeof record.longitude === "number" ? record.longitude : null,
    locationText: stringOrNull(record.locationText),
    severity: stringOrNull(record.severity),
    status: stringOrNull(record.status),
    aiSummary: stringOrNull(record.aiSummary),
    aiRecommendation: stringOrNull(record.aiRecommendation),
    aiConfidence: typeof record.aiConfidence === "number" ? record.aiConfidence : null,
    falseReportRisk: typeof record.falseReportRisk === "number" ? record.falseReportRisk : null,
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt),
    author: publicAliasOf(record),
  };
}

/**
 * `GET /api/events` (mapa 2D / VIGÍA / ATLAS) queries `Report`/`HelpRequest`
 * directly rather than consuming the two JSON endpoints above, so it is a
 * second surface with the exact same exposure (PRIV-FINAL-001 §11: "no cree
 * una segunda API insegura para mantener el mapa funcionando"). These two
 * functions produce a `CrisisEvent`-shaped object for public/citizen
 * viewers: every required field of that contract (`title`, `description`,
 * `latitude`, `longitude`) is still populated — never `null` — but with
 * safe, non-PII, approximate content, so existing map/VIGIA rendering code
 * (which expects those fields to always be present) keeps working without
 * change. Returning `null` signals "exclude this record from the public
 * feed": used for HelpRequests in `restrictedMode` (§4 — reduce further or
 * exclude entirely; excluding avoids emitting a fake/placeholder location)
 * and for any record whose coordinates can't be approximated at all.
 */
export interface PublicCrisisMapEvent {
  id: string;
  title: string;
  category: string | null;
  description: string;
  latitude: number;
  longitude: number;
  locationText: string | null;
  severity: string | null;
  priority: string | null;
  type: "REPORT" | "SOS";
  status: string;
  restrictedMode: boolean;
  aiSummary: string | null;
  aiRecommendation: string | null;
  aiConfidence: number | null;
  falseReportRisk: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  author: string | null;
  authorId: string | null;
  recordType: "Report" | "HelpRequest";
}

const DEFAULT_PUBLIC_REPORT_SUMMARY = "Reporte ciudadano en verificación, sin resumen disponible.";
const DEFAULT_PUBLIC_HELP_REQUEST_SUMMARY = "Solicitud de ayuda en verificación, sin resumen disponible.";

export function toPublicReportMapEvent(record: AnyRecord): PublicCrisisMapEvent | null {
  const location = toApproximateLocation(record.latitude, record.longitude, REPORT_PUBLIC_COORD_PRECISION);
  if (!location) return null;
  const category = stringOrNull(record.category);
  // aiSummary es una plantilla generada por analyzeReport(), nunca un eco
  // del título/descripción libres que envió el reportante.
  const summary = stringOrNull(record.aiSummary) ?? DEFAULT_PUBLIC_REPORT_SUMMARY;
  return {
    id: String(record.id ?? ""),
    title: category ?? "Reporte ciudadano",
    category,
    description: summary,
    latitude: location.lat,
    longitude: location.lng,
    locationText: null,
    severity: stringOrNull(record.severity),
    priority: null,
    type: "REPORT",
    status: stringOrNull(record.status) ?? "UNKNOWN",
    restrictedMode: false,
    aiSummary: summary,
    aiRecommendation: null,
    aiConfidence: typeof record.aiConfidence === "number" ? record.aiConfidence : null,
    falseReportRisk: null,
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt),
    author: publicAliasOf(record),
    authorId: null,
    recordType: "Report",
  };
}

export function toPublicHelpRequestMapEvent(record: AnyRecord): PublicCrisisMapEvent | null {
  if (record.restrictedMode === true) return null;
  const location = toApproximateLocation(record.latitude, record.longitude, HELP_REQUEST_PUBLIC_COORD_PRECISION);
  if (!location) return null;
  const category = stringOrNull(record.category);
  const priority = stringOrNull(record.priority);
  // aiSummary es una plantilla generada por analyzeHelpRequest(), nunca un
  // eco del título/descripción libres que envió el solicitante.
  const summary = stringOrNull(record.aiSummary) ?? DEFAULT_PUBLIC_HELP_REQUEST_SUMMARY;
  return {
    id: String(record.id ?? ""),
    title: category ? `Solicitud de ayuda: ${category}` : "Solicitud de ayuda",
    category,
    description: summary,
    latitude: location.lat,
    longitude: location.lng,
    locationText: null,
    severity: priority,
    priority,
    type: "SOS",
    status: stringOrNull(record.status) ?? "UNKNOWN",
    restrictedMode: false,
    aiSummary: summary,
    aiRecommendation: null,
    aiConfidence: typeof record.aiConfidence === "number" ? record.aiConfidence : null,
    falseReportRisk: null,
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt),
    author: publicAliasOf(record),
    authorId: null,
    recordType: "HelpRequest",
  };
}

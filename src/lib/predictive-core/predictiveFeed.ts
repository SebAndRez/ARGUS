import {
  analyzeExternalEvent,
  analyzeReport,
  analyzeSos,
  runArgusPredictiveCore,
} from "@/lib/predictive-core/argusPredictiveCore";
import { normalizeUnknownToPredictionInput } from "@/lib/predictive-core/inputNormalizer";
import { toPublicHelpRequest, toPublicReport } from "@/lib/security/incidentDto";
import { prisma } from "@/lib/prisma";
import type { ArgusDecisionPacket } from "@/types/predictiveCore";

type AnyRecord = Record<string, unknown>;

/**
 * Audiencia del llamador — decide, antes de construir cualquier
 * `ArgusPredictionInput`, si Predictive Core puede ver la fila cruda de
 * `Report`/`HelpRequest` o solo su proyección pública ya redactada.
 * "operator" = sesión OPERATOR/ANALYST/ADMIN/SUPER_ADMIN ya verificada por
 * el caller (mismo criterio que `OPERATOR_ROLES` en `/api/reports` y
 * `/api/help-requests`); "public" = cualquier otro caso, incluida ausencia
 * total de sesión. Es un parámetro obligatorio (sin valor por defecto) para
 * que ningún caller nuevo pueda omitirlo por accidente y exponer datos
 * crudos sin darse cuenta.
 */
export type PredictiveAudience = "public" | "operator";

/**
 * Fase B (cierre P0 privacidad Predictive Core). El límite de privacidad se
 * aplica AQUÍ — antes de que el `Report`/`HelpRequest` crudo entre al
 * pipeline de Predictive Core — nunca al final recortando un campo de la
 * respuesta ya armada. Reutiliza el mismo contrato público que ya protege
 * `/api/reports`/`/api/help-requests`/`/api/events` (`toPublicReport`/
 * `toPublicHelpRequest` en `src/lib/security/incidentDto.ts`): se construye
 * una fila sintética que conserva solo lo que ese DTO ya considera seguro
 * (categoría, severidad/prioridad, ubicación redondeada/aproximada) y omite
 * deliberadamente `title`/`description`/`locationText`/identidad. Con esos
 * campos ausentes, `inputNormalizer.ts` ya cae en su propio texto de
 * reemplazo seguro ("Reporte ciudadano en verificación" / "Solicitud SOS en
 * verificación") — por diseño, no por accidente — así que ningún texto
 * libre ni coordenada exacta llega a `ArgusPredictionResult.title` ni a la
 * frase de `hypothesis` que lo embebe. No se crea un segundo sistema de
 * redacción: esta función solo remapea la salida ya redactada de
 * `incidentDto.ts` a la forma de fila que `normalizeReportToPredictionInput`/
 * `normalizeSosToPredictionInput` esperan.
 */
function toPredictiveSafeReportRecord(report: AnyRecord): AnyRecord {
  const publicView = toPublicReport(report);
  return {
    id: publicView.id,
    category: publicView.category,
    severity: publicView.severity,
    latitude: publicView.approximateLocation?.lat,
    longitude: publicView.approximateLocation?.lng,
    createdAt: publicView.createdAt,
    updatedAt: publicView.createdAt,
  };
}

function toPredictiveSafeHelpRequestRecord(helpRequest: AnyRecord): AnyRecord {
  const publicView = toPublicHelpRequest(helpRequest);
  return {
    id: publicView.id,
    category: publicView.category,
    severity: publicView.priority,
    priority: publicView.priority,
    latitude: publicView.approximateLocation?.lat,
    longitude: publicView.approximateLocation?.lng,
    createdAt: publicView.createdAt,
    updatedAt: publicView.createdAt,
  };
}

function parseLimit(value: string | number | null | undefined, fallback = 30) {
  const limit = Number(value ?? fallback);
  return Number.isInteger(limit) ? Math.min(100, Math.max(1, limit)) : fallback;
}

export async function runPredictiveFromBody(body: unknown) {
  const input = normalizeUnknownToPredictionInput(body);
  return runArgusPredictiveCore(input);
}

export async function getPredictiveAnalyses(options: {
  inputId?: string | null;
  kind?: string | null;
  limit?: string | number | null;
  audience: PredictiveAudience;
}) {
  const limit = parseLimit(options.limit);
  const packets: ArgusDecisionPacket[] = [];
  const isPublic = options.audience === "public";

  if (options.inputId && options.kind) {
    const kind = options.kind;
    if (kind === "citizen_report") {
      const report = await prisma.report.findUnique({ where: { id: options.inputId } });
      if (report) packets.push(await analyzeReport(isPublic ? toPredictiveSafeReportRecord(report) : report));
    } else if (kind === "sos") {
      const sos = await prisma.helpRequest.findUnique({ where: { id: options.inputId } });
      if (sos) packets.push(await analyzeSos(isPublic ? toPredictiveSafeHelpRequestRecord(sos) : sos));
    } else {
      const external = await prisma.externalEvent.findUnique({ where: { id: options.inputId } });
      if (external) packets.push(await analyzeExternalEvent(external));
    }
    return packets.map((packet) => packet.analysis);
  }

  const [reports, helpRequests, externalEvents] = await Promise.all([
    !options.kind || options.kind === "citizen_report"
      ? prisma.report.findMany({ orderBy: { createdAt: "desc" }, take: Math.ceil(limit / 3) })
      : Promise.resolve([]),
    !options.kind || options.kind === "sos"
      ? prisma.helpRequest.findMany({ orderBy: { createdAt: "desc" }, take: Math.ceil(limit / 3) })
      : Promise.resolve([]),
    !options.kind || !["citizen_report", "sos"].includes(options.kind)
      ? prisma.externalEvent.findMany({
          orderBy: [{ occurredAt: "desc" }, { updatedAt: "desc" }],
          take: limit,
        })
      : Promise.resolve([]),
  ]);

  for (const report of reports) {
    packets.push(await analyzeReport(isPublic ? toPredictiveSafeReportRecord(report) : report));
  }
  for (const request of helpRequests) {
    packets.push(await analyzeSos(isPublic ? toPredictiveSafeHelpRequestRecord(request) : request));
  }
  for (const event of externalEvents) packets.push(await analyzeExternalEvent(event));

  return packets
    .map((packet) => packet.analysis)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit);
}

export async function getPredictiveNotificationPackets(options: {
  limit?: string | number | null;
  audience: PredictiveAudience;
}) {
  const limit = parseLimit(options.limit);
  const packets: ArgusDecisionPacket[] = [];
  const isPublic = options.audience === "public";

  const [reports, helpRequests, externalEvents] = await Promise.all([
    prisma.report.findMany({ orderBy: { createdAt: "desc" }, take: Math.ceil(limit / 3) }),
    prisma.helpRequest.findMany({ orderBy: { createdAt: "desc" }, take: Math.ceil(limit / 3) }),
    prisma.externalEvent.findMany({
      orderBy: [{ occurredAt: "desc" }, { updatedAt: "desc" }],
      take: limit,
    }),
  ]);

  for (const report of reports) {
    packets.push(await analyzeReport(isPublic ? toPredictiveSafeReportRecord(report) : report));
  }
  for (const request of helpRequests) {
    packets.push(await analyzeSos(isPublic ? toPredictiveSafeHelpRequestRecord(request) : request));
  }
  for (const event of externalEvents) packets.push(await analyzeExternalEvent(event));

  return packets
    .filter((packet) => packet.notification)
    .sort((a, b) => new Date(b.analysis.updatedAt).getTime() - new Date(a.analysis.updatedAt).getTime())
    .slice(0, limit);
}

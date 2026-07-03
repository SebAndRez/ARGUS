import {
  analyzeExternalEvent,
  analyzeReport,
  analyzeSos,
  runArgusPredictiveCore,
} from "@/lib/predictive-core/argusPredictiveCore";
import { normalizeUnknownToPredictionInput } from "@/lib/predictive-core/inputNormalizer";
import { prisma } from "@/lib/prisma";
import type { ArgusDecisionPacket } from "@/types/predictiveCore";

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
}) {
  const limit = parseLimit(options.limit);
  const packets: ArgusDecisionPacket[] = [];

  if (options.inputId && options.kind) {
    const kind = options.kind;
    if (kind === "citizen_report") {
      const report = await prisma.report.findUnique({ where: { id: options.inputId } });
      if (report) packets.push(await analyzeReport(report));
    } else if (kind === "sos") {
      const sos = await prisma.helpRequest.findUnique({ where: { id: options.inputId } });
      if (sos) packets.push(await analyzeSos(sos));
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

  for (const report of reports) packets.push(await analyzeReport(report));
  for (const request of helpRequests) packets.push(await analyzeSos(request));
  for (const event of externalEvents) packets.push(await analyzeExternalEvent(event));

  return packets
    .map((packet) => packet.analysis)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit);
}

export async function getPredictiveNotificationPackets(options: { limit?: string | number | null } = {}) {
  const limit = parseLimit(options.limit);
  const packets: ArgusDecisionPacket[] = [];

  const [reports, helpRequests, externalEvents] = await Promise.all([
    prisma.report.findMany({ orderBy: { createdAt: "desc" }, take: Math.ceil(limit / 3) }),
    prisma.helpRequest.findMany({ orderBy: { createdAt: "desc" }, take: Math.ceil(limit / 3) }),
    prisma.externalEvent.findMany({
      orderBy: [{ occurredAt: "desc" }, { updatedAt: "desc" }],
      take: limit,
    }),
  ]);

  for (const report of reports) packets.push(await analyzeReport(report));
  for (const request of helpRequests) packets.push(await analyzeSos(request));
  for (const event of externalEvents) packets.push(await analyzeExternalEvent(event));

  return packets
    .filter((packet) => packet.notification)
    .sort((a, b) => new Date(b.analysis.updatedAt).getTime() - new Date(a.analysis.updatedAt).getTime())
    .slice(0, limit);
}

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SEED_PATTERN = /\b(seed|demo|fixture|mock|qa)\b/i;

function containsSeedMarker(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return SEED_PATTERN.test(value);
  if (typeof value === "number" || typeof value === "boolean") return false;
  try {
    return SEED_PATTERN.test(JSON.stringify(value));
  } catch {
    return false;
  }
}

function printSection(title: string, rows: Array<{ id: string; source?: string | null; title?: string | null; reason: string }>) {
  console.log(`\n${title}: ${rows.length}`);
  rows.slice(0, 20).forEach((row) => {
    console.log(`- ${row.id} | ${row.source ?? "unknown"} | ${row.reason} | ${row.title ?? "(sin titulo)"}`);
  });
  if (rows.length > 20) console.log(`  ... ${rows.length - 20} mas no mostrados`);
}

async function main() {
  console.log("ARGUS seed/demo production audit");
  console.log("Mode: dry-run/read-only. No rows will be changed.");

  const [knowledgeIncidents, externalEvents, reports, helpRequests] = await Promise.all([
    prisma.knowledgeIncident.findMany({
      orderBy: { updatedAt: "desc" },
      take: 5000,
      select: {
        id: true,
        sourceId: true,
        title: true,
        summary: true,
        externalId: true,
        tagsJson: true,
        technicalFactorsJson: true,
        rawEvidenceRefsJson: true,
      },
    }),
    prisma.externalEvent.findMany({
      orderBy: { updatedAt: "desc" },
      take: 5000,
      select: {
        id: true,
        sourceId: true,
        externalId: true,
        title: true,
        description: true,
        raw: true,
        normalized: true,
      },
    }),
    prisma.report.findMany({
      orderBy: { updatedAt: "desc" },
      take: 1000,
      select: { id: true, title: true, description: true, category: true, aiSummary: true },
    }),
    prisma.helpRequest.findMany({
      orderBy: { updatedAt: "desc" },
      take: 1000,
      select: { id: true, title: true, description: true, category: true, aiSummary: true },
    }),
  ]);

  const incidentMatches = knowledgeIncidents
    .map((row) => {
      const seedFields = [
        row.externalId,
        row.title,
        row.summary,
        row.tagsJson,
        row.technicalFactorsJson,
        row.rawEvidenceRefsJson,
      ];
      return seedFields.some(containsSeedMarker)
        ? { id: row.id, source: row.sourceId, title: row.title, reason: "seed/demo marker in KnowledgeIncident" }
        : null;
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const externalMatches = externalEvents
    .map((row) => {
      const seedFields = [row.sourceId, row.externalId, row.title, row.description, row.raw, row.normalized];
      return seedFields.some(containsSeedMarker)
        ? { id: row.id, source: row.sourceId, title: row.title, reason: "seed/demo marker in ExternalEvent" }
        : null;
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const reportMatches = reports
    .map((row) => {
      const seedFields = [row.title, row.description, row.category, row.aiSummary];
      return seedFields.some(containsSeedMarker)
        ? { id: row.id, source: "Report", title: row.title, reason: "seed/demo marker in Report" }
        : null;
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const helpMatches = helpRequests
    .map((row) => {
      const seedFields = [row.title, row.description, row.category, row.aiSummary];
      return seedFields.some(containsSeedMarker)
        ? { id: row.id, source: "HelpRequest", title: row.title, reason: "seed/demo marker in HelpRequest" }
        : null;
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  printSection("KnowledgeIncident candidates", incidentMatches);
  printSection("ExternalEvent candidates", externalMatches);
  printSection("Report candidates", reportMatches);
  printSection("HelpRequest candidates", helpMatches);

  const total = incidentMatches.length + externalMatches.length + reportMatches.length + helpMatches.length;
  console.log(`\nTotal candidates: ${total}`);
  console.log("Next step must be manual review. This script does not delete or update production data.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

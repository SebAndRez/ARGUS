import { PrismaClient } from "@prisma/client";
import {
  downgradePersistedGdacsGreenIfNeeded,
  isGdacsSource,
} from "../src/lib/vigia/gdacsSeverity";

/**
 * ARGUS v1.0.3.2 — GDACS Green severity canonicalization: historical repair.
 *
 * The read-time canonicalization in `vigiaIncidentToArgusEvent.ts` and
 * `notificationCenterEngine.ts` already stops already-persisted stale rows
 * from ever showing as critical to API consumers. This script is the
 * complementary, opt-in DB backfill: it corrects the *stored* value so the
 * row is right at rest too, not just when read through those two mappers.
 *
 * Safe by construction:
 *   - Read-only by default. Requires --apply to write anything.
 *   - Only ever downgrades (see `downgradePersistedGdacsGreenIfNeeded`) —
 *     never raises a severity, never touches non-GDACS or non-Green rows.
 *   - Never deletes. Only updates severity/tags/technicalFactorsJson, and
 *     keeps a full audit trail of what the row used to say.
 *
 * Usage:
 *   npm run repair:gdacs-green -- --dry-run   (default if no flag given)
 *   npm run repair:gdacs-green -- --apply
 */

const CORRECTED_BY = "ARGUS v1.0.3.2 GDACS severity canonicalization";

const prisma = new PrismaClient();

type Row = Awaited<ReturnType<typeof fetchCandidateRows>>[number];

async function fetchCandidateRows() {
  return prisma.knowledgeIncident.findMany({
    where: {
      OR: [
        { sourceId: { equals: "gdacs", mode: "insensitive" } },
        { sourceName: { contains: "gdacs", mode: "insensitive" } },
      ],
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 2000,
  });
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function printTable(
  rows: Array<{
    id: string;
    title: string;
    oldSeverity: string;
    newSeverity: string;
    oldStatus: string;
    tags: string[];
    updatedAt: Date;
    reason: string;
  }>
) {
  if (rows.length === 0) {
    console.log("(no candidates found)");
    return;
  }
  console.log(
    "id".padEnd(28) +
      "oldSeverity".padEnd(13) +
      "newSeverity".padEnd(13) +
      "oldStatus".padEnd(16) +
      "updatedAt".padEnd(22) +
      "title / reason"
  );
  console.log("-".repeat(140));
  for (const row of rows) {
    console.log(
      truncate(row.id, 26).padEnd(28) +
        row.oldSeverity.padEnd(13) +
        row.newSeverity.padEnd(13) +
        truncate(row.oldStatus, 14).padEnd(16) +
        row.updatedAt.toISOString().padEnd(22) +
        `${truncate(row.title, 60)} | tags=[${row.tags.join(",")}] | ${row.reason}`
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const dryRun = !apply || args.includes("--dry-run");

  console.log(`ARGUS repair:gdacs-green — mode: ${dryRun ? "DRY-RUN (no changes will be written)" : "APPLY (writing changes)"}`);
  if (!dryRun) {
    console.log(`Corrected by: ${CORRECTED_BY}`);
  }

  const candidates: Row[] = await fetchCandidateRows();
  console.log(`\nFetched ${candidates.length} row(s) with a GDACS sourceId/sourceName signal.`);

  const proposals: Array<{
    id: string;
    title: string;
    oldSeverity: string;
    newSeverity: string;
    oldStatus: string;
    tags: string[];
    updatedAt: Date;
    reason: string;
  }> = [];
  const skippedNotGreen: string[] = [];
  const skippedNoChange: string[] = [];

  for (const row of candidates) {
    const tags = Array.isArray(row.tagsJson) ? (row.tagsJson as unknown[]).map(String) : [];
    const input = {
      sourceId: row.sourceId,
      sourceName: row.sourceName,
      tags,
      title: row.title,
      description: row.summary,
      severity: row.severity,
      technicalFactors: (row.technicalFactorsJson as Record<string, unknown> | null) ?? undefined,
      impact: (row.impactJson as { peopleAffected?: number } | null) ?? undefined,
      casualties: (row.casualtiesJson as { deaths?: number; displaced?: number } | null) ?? undefined,
    };

    if (!isGdacsSource(input)) continue; // defensive; the DB query above should already guarantee this

    const decision = downgradePersistedGdacsGreenIfNeeded(input);
    if (!decision) {
      skippedNotGreen.push(row.id);
      continue;
    }
    if (!decision.shouldUpdate) {
      skippedNoChange.push(row.id);
      continue;
    }

    proposals.push({
      id: row.id,
      title: row.title,
      oldSeverity: decision.from,
      newSeverity: decision.to,
      oldStatus: row.reviewStatus,
      tags,
      updatedAt: row.updatedAt,
      reason: decision.reason,
    });
  }

  console.log(`GDACS Green candidates evaluated: ${candidates.length - skippedNotGreen.length}`);
  console.log(`Not Green (or color undetectable) — left untouched: ${skippedNotGreen.length}`);
  console.log(`Already correct / would escalate — left untouched: ${skippedNoChange.length}`);
  console.log(`\nProposed severity downgrades: ${proposals.length}`);
  printTable(proposals);

  if (proposals.length === 0) {
    console.log("\nNothing to do.");
    return;
  }

  if (dryRun) {
    console.log(
      `\nDry-run only — no rows were modified. Re-run with --apply to write these ${proposals.length} correction(s).`
    );
    return;
  }

  console.log(`\nApplying ${proposals.length} correction(s)...`);
  let updated = 0;
  for (const proposal of proposals) {
    const existing = candidates.find((row) => row.id === proposal.id)!;
    const existingTechnicalFactors = (existing.technicalFactorsJson as Record<string, unknown> | null) ?? {};
    const newTags = [...new Set([...proposal.tags, "severity:canonicalized", "gdacs-green-corrected"])];

    await prisma.knowledgeIncident.update({
      where: { id: proposal.id },
      data: {
        severity: proposal.newSeverity,
        tagsJson: newTags,
        technicalFactorsJson: {
          ...existingTechnicalFactors,
          severityCorrection: {
            previousSeverity: proposal.oldSeverity,
            canonicalSeverity: proposal.newSeverity,
            reason: proposal.reason,
            correctedAt: new Date().toISOString(),
            correctedBy: CORRECTED_BY,
          },
        },
      },
    });
    updated += 1;
  }
  console.log(`Done. ${updated} row(s) updated. No rows were deleted.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

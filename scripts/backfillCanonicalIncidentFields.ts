import { PrismaClient } from "@prisma/client";
import { computeCanonicalFields } from "../src/lib/incidents/canonicalFieldsSync";

/**
 * ARGUS — Fase C (`docs/architecture/ARGUS_INCIDENT_MIGRATION_PLAN.md` §3):
 * backfill de las columnas canónicas nuevas de `KnowledgeIncident` para filas
 * ya persistidas antes de que existieran (status/effectiveSeverity/
 * confidenceLevel/verificationStatus/scope/isOfficial/canonicalKey/
 * startedAt/confirmedAt/resolvedAt/archivedAt/sourceCount/evidenceCount).
 *
 * Reutiliza literalmente `computeCanonicalFields` — la misma función que el
 * dual-write de `knowledgePersistenceService.ts` usa hacia adelante — para
 * que backfill y escritura en vivo nunca diverjan en su lógica de derivación.
 *
 * Safe by construction (mismo patrón que `repairGdacsGreenSeverity.ts`):
 *   - Read-only por defecto. Requiere --apply para escribir.
 *   - Idempotente: si una fila ya tiene TODAS las columnas canónicas
 *     pobladas, se omite sin recalcular ni sobreescribir.
 *   - Nunca borra, nunca toca las columnas legacy (severity/reviewStatus/
 *     technicalFactorsJson) — solo puebla las columnas nuevas, aditivas.
 *
 * Uso:
 *   npm run backfill:canonical-fields -- --dry-run   (default si no hay flag)
 *   npm run backfill:canonical-fields -- --apply
 */

const prisma = new PrismaClient();

const BATCH_SIZE = 200;

function isFullyBackfilled(row: {
  status: string | null;
  effectiveSeverity: string | null;
  confidenceLevel: string | null;
  verificationStatus: string | null;
  scope: string | null;
  isOfficial: boolean | null;
  canonicalKey: string | null;
}): boolean {
  return (
    row.status !== null &&
    row.effectiveSeverity !== null &&
    row.confidenceLevel !== null &&
    row.verificationStatus !== null &&
    row.scope !== null &&
    row.isOfficial !== null &&
    row.canonicalKey !== null
  );
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const dryRun = !apply || args.includes("--dry-run");

  console.log(`ARGUS backfill:canonical-fields — mode: ${dryRun ? "DRY-RUN (no changes will be written)" : "APPLY (writing changes)"}`);

  let cursor: string | undefined;
  let scanned = 0;
  let alreadyBackfilled = 0;
  let updated = 0;
  const errors: string[] = [];

  for (;;) {
    const rows = await prisma.knowledgeIncident.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;

    for (const row of rows) {
      scanned += 1;
      if (isFullyBackfilled(row)) {
        alreadyBackfilled += 1;
        continue;
      }

      try {
        const evidenceCount = await prisma.knowledgeEvidence.count({ where: { incidentId: row.id } });
        const canonical = computeCanonicalFields(
          {
            sourceId: row.sourceId,
            domain: row.domain,
            subtype: row.subtype,
            severity: row.severity,
            confidenceScore: row.confidenceScore,
            country: row.country,
            region: row.region,
            latitude: row.latitude,
            longitude: row.longitude,
            occurredAt: row.occurredAt,
            detectedAt: row.detectedAt,
            technicalFactorsJson: row.technicalFactorsJson,
            reviewStatus: row.reviewStatus,
          },
          { sourceIds: [row.sourceId], evidenceCount: Math.max(evidenceCount, 1) },
          {
            confirmedAt: row.confirmedAt,
            resolvedAt: row.resolvedAt,
            archivedAt: row.archivedAt,
            sourceCount: row.sourceCount,
          },
          row.updatedAt
        );

        if (!dryRun) {
          await prisma.knowledgeIncident.update({
            where: { id: row.id },
            data: {
              status: row.status ?? canonical.status,
              effectiveSeverity: row.effectiveSeverity ?? canonical.effectiveSeverity,
              confidenceLevel: row.confidenceLevel ?? canonical.confidenceLevel,
              verificationStatus: row.verificationStatus ?? canonical.verificationStatus,
              scope: row.scope ?? canonical.scope,
              isOfficial: row.isOfficial ?? canonical.isOfficial,
              canonicalKey: row.canonicalKey ?? canonical.canonicalKey,
              startedAt: row.startedAt ?? canonical.startedAt,
              confirmedAt: row.confirmedAt ?? canonical.confirmedAt,
              resolvedAt: row.resolvedAt ?? canonical.resolvedAt,
              archivedAt: row.archivedAt ?? canonical.archivedAt,
              sourceCount: row.sourceCount ?? canonical.sourceCount,
              evidenceCount: row.evidenceCount ?? canonical.evidenceCount,
            },
          });
        }
        updated += 1;
      } catch (error) {
        errors.push(`${row.id}: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }

    console.log(`...scanned ${scanned} row(s) so far (already backfilled: ${alreadyBackfilled}, ${dryRun ? "would update" : "updated"}: ${updated})`);
  }

  console.log("\n--- Resumen ---");
  console.log(`Filas escaneadas: ${scanned}`);
  console.log(`Ya con columnas canónicas completas (sin cambios): ${alreadyBackfilled}`);
  console.log(`${dryRun ? "Se actualizarían" : "Actualizadas"}: ${updated}`);
  if (errors.length > 0) {
    console.log(`Errores: ${errors.length}`);
    errors.slice(0, 20).forEach((message) => console.log(`  - ${message}`));
  }
  if (dryRun) {
    console.log("\nDry-run only — no se escribió ninguna fila. Re-ejecutar con --apply para aplicar.");
  } else {
    console.log("\nListo.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

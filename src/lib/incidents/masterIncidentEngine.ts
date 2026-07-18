import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  MASTER_INCIDENT_PARENT_DOMAIN,
  MASTER_INCIDENT_RULES,
  MASTER_INCIDENT_SOURCE_ID,
  MASTER_INCIDENT_SOURCE_NAME,
  severityAtLeast,
  type MasterIncidentRule,
} from "@/lib/incidents/masterIncidentRules";
import { computeRecommendedModules, recordModuleActivationRecommendation } from "@/lib/modules/moduleActivationEngine";

/**
 * ARGUS Fusion Engine — correlación cross-amenaza ("incidente maestro").
 *
 * Corre como paso nuevo al final de `runGlobalWatch()` (después del sweep de
 * lifecycle existente), sobre `KnowledgeIncident` ya persistido — no fetchea
 * ninguna fuente nueva, no reemplaza `mergeCorroboratingEvents`/
 * `wildfireCorrelationEngine.ts` (esos siguen resolviendo "misma amenaza,
 * varias fuentes"; esto resuelve "amenazas distintas, mismo evento real").
 *
 * Cada grupo (ancla + acompañantes) se enlaza a UN incidente padre sintético
 * (`domain: "multi_hazard_event"`, fuente `argus_fusion_engine`) vía
 * `IncidentRelation(kind: "child_of")` — nunca fusiona las filas hijas, cada
 * una conserva su severidad/evidencia/lifecycle propios (diseño
 * `ARGUS_CANONICAL_INCIDENT_DESIGN.md` §7.3, "se crea un incidente padre").
 *
 * Idempotencia: el `externalId` del padre es `${rule.id}:${anchor.id}` — fijo
 * por ancla, así que re-ejecutar la corrida de 15 min sobre el mismo evento
 * en curso reutiliza el mismo padre (upsert) en vez de crear uno nuevo cada
 * vez, y las relaciones ya creadas no se duplican (se verifica existencia
 * antes de insertar).
 *
 * Alcance de esta primera entrega — deliberadamente NO incluye:
 * - Albergues (Código Azul) como `IncidentRelation` real: `CriticalPoi`/
 *   `CriticalPoiOperationalStatus` son una tabla con identidad y lifecycle
 *   propios, sin equivalente de severidad/confianza comparable a
 *   `KnowledgeIncident` todavía — en vez de forzar una relación de esquema
 *   incompatible, se enriquece el resumen del padre con un conteo de
 *   albergues activos en la misma región (contexto de lectura, no relación
 *   persistida). Formalizarlo como relación real queda en el backlog.
 * - Cortes eléctricos: no existe ninguna fuente/tabla en el repo hoy (ver
 *   auditoría) — no hay nada que correlacionar todavía.
 */

export type MasterIncidentSummary = {
  groupsEvaluated: number;
  parentsCreated: number;
  parentsUpdated: number;
  relationsCreated: number;
  sheltersLinked: number;
  moduleActivationsLogged: number;
  errors: string[];
};

type IncidentRow = {
  id: string;
  domain: string;
  severity: string;
  effectiveSeverity: string | null;
  confidenceScore: number;
  actionabilityScore: number;
  sourceReliabilityScore: number;
  title: string;
  sourceName: string;
  country: string | null;
  region: string | null;
  locality: string | null;
  latitude: number | null;
  longitude: number | null;
  occurredAt: Date | null;
  detectedAt: Date | null;
  createdAt: Date;
  status: string | null;
};

function toJson(value: Record<string, unknown> | unknown[]): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function referenceTime(row: Pick<IncidentRow, "occurredAt" | "detectedAt" | "createdAt">): Date {
  return row.occurredAt ?? row.detectedAt ?? row.createdAt;
}

function withinWindow(a: Date, b: Date, windowHours: number): boolean {
  return Math.abs(a.getTime() - b.getTime()) <= windowHours * 60 * 60 * 1000;
}

async function findAnchors(rule: MasterIncidentRule, now: Date): Promise<IncidentRow[]> {
  const lookback = new Date(now.getTime() - rule.windowHours * 2 * 60 * 60 * 1000);
  const rows = await prisma.knowledgeIncident.findMany({
    where: {
      domain: { in: rule.anchorDomains },
      updatedAt: { gte: lookback },
      country: { not: null },
      region: { not: null },
      NOT: { status: { in: ["resolved", "archived"] } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return rows.filter((row) => severityAtLeast(row.effectiveSeverity ?? row.severity, rule.anchorMinSeverity));
}

async function findCompanions(rule: MasterIncidentRule, anchor: IncidentRow): Promise<IncidentRow[]> {
  const anchorTime = referenceTime(anchor);
  const from = new Date(anchorTime.getTime() - rule.windowHours * 60 * 60 * 1000);
  const to = new Date(anchorTime.getTime() + rule.windowHours * 60 * 60 * 1000);

  const candidates = await prisma.knowledgeIncident.findMany({
    where: {
      id: { not: anchor.id },
      country: anchor.country,
      region: anchor.region,
      domain: { notIn: [MASTER_INCIDENT_PARENT_DOMAIN, anchor.domain] },
      NOT: { status: { in: ["resolved", "archived"] } },
      OR: [
        { occurredAt: { gte: from, lte: to } },
        { AND: [{ occurredAt: null }, { detectedAt: { gte: from, lte: to } }] },
        { AND: [{ occurredAt: null }, { detectedAt: null }, { createdAt: { gte: from, lte: to } }] },
      ],
    },
    take: 50,
  });

  return candidates.filter((row) => {
    if (rule.companionDomains !== "any" && !rule.companionDomains.includes(row.domain)) return false;
    return withinWindow(referenceTime(row), anchorTime, rule.windowHours);
  });
}

function buildParentSummary(rule: MasterIncidentRule, anchor: IncidentRow, companions: IncidentRow[]): string {
  const children = [anchor, ...companions];
  const lines = children.map((child) => `- ${child.title} (${child.domain}, ${child.sourceName})`);
  return [
    `Incidente maestro generado automáticamente por la regla "${rule.id}" del ARGUS Fusion Engine.`,
    `Agrupa ${children.length} incidente(s) relacionado(s) en ${anchor.region ?? anchor.country ?? "región no identificada"}:`,
    ...lines,
  ].join("\n");
}

async function linkShelterContext(parentId: string, anchor: IncidentRow): Promise<number> {
  if (!anchor.country && !anchor.region) return 0;
  const shelters = await prisma.criticalPoi.findMany({
    where: {
      category: "shelter",
      ...(anchor.country ? { countryCode: anchor.country } : {}),
      ...(anchor.region ? { adminLevel1: anchor.region } : {}),
    },
    include: { operationalStatus: true },
    take: 100,
  });
  const active = shelters.filter((shelter) => shelter.operationalStatus && shelter.operationalStatus.shelterStatus !== "closed");
  if (active.length === 0) return 0;

  const parent = await prisma.knowledgeIncident.findUnique({ where: { id: parentId } });
  const existingFactors = (parent?.technicalFactorsJson as Record<string, unknown> | null) ?? {};
  await prisma.knowledgeIncident.update({
    where: { id: parentId },
    data: {
      technicalFactorsJson: toJson({
        ...existingFactors,
        linkedShelters: active.map((shelter) => ({ id: shelter.id, name: shelter.name, status: shelter.operationalStatus?.shelterStatus })),
        linkedSheltersCount: active.length,
      }),
    },
  });
  return active.length;
}

async function upsertParentIncident(
  rule: MasterIncidentRule,
  anchor: IncidentRow,
  companions: IncidentRow[]
): Promise<{ id: string; created: boolean }> {
  const externalId = `${rule.id}:${anchor.id}`;
  const childIds = [anchor.id, ...companions.map((c) => c.id)];
  const summary = buildParentSummary(rule, anchor, companions);
  const technicalFactors = {
    lifecycle: "active",
    masterIncidentRuleId: rule.id,
    childIncidentIds: childIds,
    childCount: childIds.length,
  };

  const existing = await prisma.knowledgeIncident.findUnique({
    where: { sourceId_externalId: { sourceId: MASTER_INCIDENT_SOURCE_ID, externalId } },
  });

  if (existing) {
    await prisma.knowledgeIncident.update({
      where: { id: existing.id },
      data: {
        summary,
        severity: anchor.severity,
        effectiveSeverity: anchor.effectiveSeverity ?? anchor.severity,
        confidenceScore: anchor.confidenceScore,
        technicalFactorsJson: toJson(technicalFactors),
        tagsJson: toJson(["multi_hazard_event", rule.id]),
      },
    });
    return { id: existing.id, created: false };
  }

  const created = await prisma.knowledgeIncident.create({
    data: {
      externalId,
      sourceId: MASTER_INCIDENT_SOURCE_ID,
      sourceName: MASTER_INCIDENT_SOURCE_NAME,
      title: rule.parentTitle(anchor.region, anchor.country),
      summary,
      domain: MASTER_INCIDENT_PARENT_DOMAIN,
      subtype: rule.id,
      severity: anchor.severity,
      effectiveSeverity: anchor.effectiveSeverity ?? anchor.severity,
      confidenceScore: anchor.confidenceScore,
      actionabilityScore: anchor.actionabilityScore,
      sourceReliabilityScore: anchor.sourceReliabilityScore,
      occurredAt: anchor.occurredAt,
      detectedAt: anchor.detectedAt,
      country: anchor.country,
      region: anchor.region,
      locality: anchor.locality,
      latitude: anchor.latitude,
      longitude: anchor.longitude,
      technicalFactorsJson: toJson(technicalFactors),
      tagsJson: toJson(["multi_hazard_event", rule.id]),
      rawEvidenceRefsJson: toJson([]),
      reviewStatus: "auto_accepted",
      status: "active",
      verificationStatus: "CORROBORATED",
      scope: anchor.region ? "regional" : "national",
      isOfficial: false,
      sourceCount: childIds.length,
      evidenceCount: 0,
    },
  });
  return { id: created.id, created: true };
}

async function linkChildRelations(parentId: string, children: IncidentRow[], ruleId: string): Promise<number> {
  let created = 0;
  for (const child of children) {
    const existingRelation = await prisma.incidentRelation.findFirst({
      where: { fromIncidentId: child.id, toIncidentId: parentId, kind: "child_of" },
    });
    if (existingRelation) continue;
    await prisma.incidentRelation.create({
      data: {
        fromIncidentId: child.id,
        toIncidentId: parentId,
        kind: "child_of",
        // Correlación por regla automática (no verificación humana) — 70 es
        // el mismo piso usado como "corroborado, no oficial" en otras partes
        // del motor (ver ArgusConfidence "medium_high" ~65-78 en el mapeador
        // canónico); documentado aquí, no reinventa una escala nueva.
        confidence: 70,
        explanation: `Agrupado automáticamente por la regla "${ruleId}" del ARGUS Fusion Engine (misma región/ventana temporal, amenaza distinta).`,
      },
    });
    created += 1;
  }
  return created;
}

async function runRule(rule: MasterIncidentRule, now: Date, summary: MasterIncidentSummary): Promise<void> {
  const anchors = await findAnchors(rule, now);
  const consideredAnchorIds = new Set<string>();

  for (const anchor of anchors) {
    if (consideredAnchorIds.has(anchor.id)) continue;
    consideredAnchorIds.add(anchor.id);

    const companions = await findCompanions(rule, anchor);
    summary.groupsEvaluated += 1;
    if (companions.length === 0) continue;

    const parent = await upsertParentIncident(rule, anchor, companions);
    if (parent.created) summary.parentsCreated += 1;
    else summary.parentsUpdated += 1;

    summary.relationsCreated += await linkChildRelations(parent.id, [anchor, ...companions], rule.id);

    try {
      summary.sheltersLinked += await linkShelterContext(parent.id, anchor);
    } catch (error) {
      summary.errors.push(`shelter-context ${anchor.id}: ${error instanceof Error ? error.message : "unknown error"}`);
    }

    // Unión de recomendaciones por cada hijo (clasificado por su propia
    // amenaza real) más el bono transversal de "padre multi-amenaza" — el
    // dominio sintético del padre (`multi_hazard_event`) no clasifica a
    // ninguna amenaza conocida por sí solo, así que evaluarlo aislado
    // perdería HERMES/ARCA por la inundación/daño a infraestructura y solo
    // dejaría ATLAS/VESTA.
    const recommendedModules = [
      ...new Set(
        [anchor, ...companions].flatMap((child) =>
          computeRecommendedModules({
            domain: child.domain,
            subtype: null,
            effectiveSeverity: child.effectiveSeverity ?? child.severity,
            severity: child.severity,
          })
        )
      ),
      ...computeRecommendedModules({
        domain: MASTER_INCIDENT_PARENT_DOMAIN,
        subtype: rule.id,
        effectiveSeverity: anchor.effectiveSeverity ?? anchor.severity,
        severity: anchor.severity,
      }),
    ];
    if (await recordModuleActivationRecommendation(parent.id, [...new Set(recommendedModules)])) {
      summary.moduleActivationsLogged += 1;
    }
  }
}

export async function runMasterIncidentCorrelation(now: Date = new Date()): Promise<MasterIncidentSummary> {
  const summary: MasterIncidentSummary = {
    groupsEvaluated: 0,
    parentsCreated: 0,
    parentsUpdated: 0,
    relationsCreated: 0,
    sheltersLinked: 0,
    moduleActivationsLogged: 0,
    errors: [],
  };

  for (const rule of MASTER_INCIDENT_RULES) {
    try {
      await runRule(rule, now, summary);
    } catch (error) {
      summary.errors.push(`${rule.id}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  return summary;
}

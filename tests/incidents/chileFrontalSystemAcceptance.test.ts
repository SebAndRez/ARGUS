import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tarea 10 del mandato — prueba de aceptación con el caso del sistema
 * frontal de Chile. Reconstruye, con el fixture realista de
 * `src/data/chileFrontalSystemFixture.ts`, lo que el ARGUS Fusion Engine
 * detecta HOY que la arquitectura anterior no detectaba: tres
 * `KnowledgeIncident` de dominios distintos (alerta SENAPRED + inundación +
 * daño a infraestructura) en la misma región/ventana se agrupan en UN
 * incidente maestro, con módulos recomendados y contexto de albergues.
 *
 * Integración ligera (mismo patrón que
 * `tests/vigia/wildfireCorrelationEngine.integration.test.ts`): solo se
 * mockea el límite de I/O real (Prisma) — la lógica real de
 * `masterIncidentEngine`/`moduleActivationEngine` corre sin mockear.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    knowledgeIncident: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    incidentRelation: { findFirst: vi.fn(), create: vi.fn() },
    criticalPoi: { findMany: vi.fn() },
    auditLog: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { runMasterIncidentCorrelation } from "@/lib/incidents/masterIncidentEngine";
import {
  CHILE_FRONTAL_SYSTEM_ANCHOR,
  CHILE_FRONTAL_SYSTEM_COMPANIONS,
  CHILE_FRONTAL_SYSTEM_SHELTER,
} from "@/data/chileFrontalSystemFixture";

const findMany = vi.mocked(prisma.knowledgeIncident.findMany);
const findUnique = vi.mocked(prisma.knowledgeIncident.findUnique);
const create = vi.mocked(prisma.knowledgeIncident.create);
const relationCreate = vi.mocked(prisma.incidentRelation.create);
const criticalPoiFindMany = vi.mocked(prisma.criticalPoi.findMany);
const auditLogFindFirst = vi.mocked(prisma.auditLog.findFirst);
const auditLogCreate = vi.mocked(prisma.auditLog.create);

const NOW = new Date("2026-07-16T20:00:00.000Z");

beforeEach(() => {
  findMany.mockReset();
  findUnique.mockReset();
  create.mockReset();
  relationCreate.mockReset();
  criticalPoiFindMany.mockReset();
  auditLogFindFirst.mockReset();
  auditLogCreate.mockReset();

  findMany.mockImplementation((async (args: { where?: { domain?: Record<string, unknown> } }) => {
    const where = args.where ?? {};
    if (where.domain && "in" in where.domain) return [CHILE_FRONTAL_SYSTEM_ANCHOR];
    if (where.domain && "notIn" in where.domain) return CHILE_FRONTAL_SYSTEM_COMPANIONS;
    return [];
  }) as never);
  findUnique.mockResolvedValue(null as never);
  create.mockResolvedValue({ id: "master-incident-1" } as never);
  vi.mocked(prisma.incidentRelation.findFirst).mockResolvedValue(null as never);
  relationCreate.mockResolvedValue({} as never);
  criticalPoiFindMany.mockResolvedValue([CHILE_FRONTAL_SYSTEM_SHELTER] as never);
  auditLogFindFirst.mockResolvedValue(null as never);
  auditLogCreate.mockResolvedValue({} as never);
});

describe("Sistema frontal de Chile — reconstrucción con el ARGUS Fusion Engine", () => {
  it("agrupa la alerta SENAPRED + inundación + daño a infraestructura en un único incidente maestro", async () => {
    const summary = await runMasterIncidentCorrelation(NOW);

    // Lo que ARGUS detectó: 1 incidente maestro con 3 hijos enlazados.
    expect(summary.parentsCreated).toBe(1);
    expect(summary.relationsCreated).toBe(3);
    expect(summary.errors).toEqual([]);

    const createArgs = create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(createArgs.data.domain).toBe("multi_hazard_event");
    expect(String(createArgs.data.summary)).toContain("Alerta Roja");
    expect(String(createArgs.data.summary)).toContain("Desborde de cauce");
    expect(String(createArgs.data.summary)).toContain("Caída de árboles");

    const linkedIds = relationCreate.mock.calls
      .map((call) => (call[0] as { data: { fromIncidentId: string } }).data.fromIncidentId)
      .sort();
    expect(linkedIds).toEqual(["chile-frontal-anchor", "chile-frontal-flood", "chile-frontal-infrastructure"]);
  });

  it("enlaza el contexto de albergues Código Azul activos en la misma región", async () => {
    const summary = await runMasterIncidentCorrelation(NOW);
    expect(summary.sheltersLinked).toBe(1);
    expect(criticalPoiFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ category: "shelter", countryCode: "CL", adminLevel1: "Valparaiso" }) })
    );
  });

  it("recomienda módulos operacionales para el incidente maestro (HERMES/ARCA por inundación+infraestructura, ATLAS/VESTA por ser padre multi-amenaza)", async () => {
    await runMasterIncidentCorrelation(NOW);
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const logged = JSON.parse((auditLogCreate.mock.calls[0][0] as { data: { metadata: string } }).data.metadata);
    expect(logged.modules).toEqual(expect.arrayContaining(["atlas", "vesta", "hermes", "arca"]));
  });

  it("documenta lo que ARGUS NO detecta hoy: sin CSN/SHOA/SERNAGEOMIN/DGA/MOP/CONAF ni cortes eléctricos, esas dimensiones del evento simplemente no existen como incidentes que correlacionar", async () => {
    // Este test no ejercita código nuevo — es la aserción negativa que
    // documenta el hallazgo de la auditoría (Tarea 6/10 del mandato): el
    // fixture solo puede representar lo que el pipeline real produce hoy
    // (SENAPRED/ReliefWeb/GDACS), porque no existe ningún adaptador para
    // sismología (CSN), tsunami/marejadas (SHOA), volcanes (SERNAGEOMIN),
    // cortes de ruta (MOP), nivel de ríos (DGA), incendios (CONAF) ni cortes
    // eléctricos en todo el repositorio — confirmado por grep exhaustivo en
    // la auditoría, no supuesto aquí.
    const domains = [CHILE_FRONTAL_SYSTEM_ANCHOR, ...CHILE_FRONTAL_SYSTEM_COMPANIONS].map((row) => row.domain);
    expect(domains).toEqual(["storm", "flood", "infrastructure_damage"]);
    expect(domains).not.toContain("seismology");
    expect(domains).not.toContain("power_outage");
  });
});

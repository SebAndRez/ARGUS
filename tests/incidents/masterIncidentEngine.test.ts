import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    knowledgeIncident: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    incidentRelation: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    criticalPoi: {
      findMany: vi.fn(),
    },
    auditLog: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { runMasterIncidentCorrelation } from "@/lib/incidents/masterIncidentEngine";

const findMany = vi.mocked(prisma.knowledgeIncident.findMany);
const findUnique = vi.mocked(prisma.knowledgeIncident.findUnique);
const create = vi.mocked(prisma.knowledgeIncident.create);
const update = vi.mocked(prisma.knowledgeIncident.update);
const relationFindFirst = vi.mocked(prisma.incidentRelation.findFirst);
const relationCreate = vi.mocked(prisma.incidentRelation.create);
const criticalPoiFindMany = vi.mocked(prisma.criticalPoi.findMany);
const auditLogFindFirst = vi.mocked(prisma.auditLog.findFirst);
const auditLogCreate = vi.mocked(prisma.auditLog.create);

const NOW = new Date("2026-07-17T12:00:00.000Z");

function buildRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "anchor-1",
    domain: "storm",
    severity: "high",
    effectiveSeverity: "high",
    confidenceScore: 85,
    actionabilityScore: 80,
    sourceReliabilityScore: 90,
    title: "Sistema frontal severo",
    sourceName: "SENAPRED",
    country: "CL",
    region: "Valparaiso",
    locality: null,
    latitude: -33.05,
    longitude: -71.62,
    occurredAt: new Date("2026-07-17T08:00:00.000Z"),
    detectedAt: new Date("2026-07-17T08:05:00.000Z"),
    createdAt: new Date("2026-07-17T08:05:00.000Z"),
    status: "active",
    ...overrides,
  };
}

function mockFindManyDispatch(anchors: unknown[], companions: unknown[]) {
  findMany.mockImplementation((async (args: { where?: { domain?: Record<string, unknown> } }) => {
    const where = args.where ?? {};
    if (where.domain && "in" in where.domain) return anchors;
    if (where.domain && "notIn" in where.domain) return companions;
    return [];
  }) as never);
}

beforeEach(() => {
  findMany.mockReset();
  findUnique.mockReset();
  create.mockReset();
  update.mockReset();
  relationFindFirst.mockReset();
  relationCreate.mockReset();
  criticalPoiFindMany.mockReset();
  auditLogFindFirst.mockReset();
  auditLogCreate.mockReset();

  findUnique.mockResolvedValue(null as never);
  create.mockResolvedValue({ id: "parent-1" } as never);
  update.mockResolvedValue({ id: "parent-1" } as never);
  relationFindFirst.mockResolvedValue(null as never);
  relationCreate.mockResolvedValue({} as never);
  criticalPoiFindMany.mockResolvedValue([] as never);
  auditLogFindFirst.mockResolvedValue(null as never);
  auditLogCreate.mockResolvedValue({} as never);
});

describe("runMasterIncidentCorrelation", () => {
  it("groups a severe-weather anchor with a different-domain companion into one parent incident", async () => {
    const anchor = buildRow();
    const companion = buildRow({ id: "companion-1", domain: "flood", title: "Inundacion Valparaiso" });
    mockFindManyDispatch([anchor], [companion]);

    const summary = await runMasterIncidentCorrelation(NOW);

    expect(summary.parentsCreated).toBe(1);
    expect(summary.parentsUpdated).toBe(0);
    expect(summary.relationsCreated).toBe(2);
    expect(summary.sheltersLinked).toBe(0);
    expect(summary.errors).toEqual([]);

    expect(create).toHaveBeenCalledTimes(1);
    const createArgs = create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(createArgs.data.domain).toBe("multi_hazard_event");
    expect(createArgs.data.externalId).toBe("severe_weather_system:anchor-1");

    expect(relationCreate).toHaveBeenCalledTimes(2);
    const linkedIds = relationCreate.mock.calls.map((call) => (call[0] as { data: { fromIncidentId: string } }).data.fromIncidentId);
    expect(linkedIds.sort()).toEqual(["anchor-1", "companion-1"]);
  });

  it("does not create a parent when no companion exists in the same region/window", async () => {
    const anchor = buildRow();
    mockFindManyDispatch([anchor], []);

    const summary = await runMasterIncidentCorrelation(NOW);

    expect(summary.parentsCreated).toBe(0);
    expect(summary.relationsCreated).toBe(0);
    expect(create).not.toHaveBeenCalled();
  });

  it("does not treat two same-domain incidents as anchor+companion (already handled by same-hazard dedup elsewhere)", async () => {
    const anchor = buildRow();
    // Companion query filters domain notIn [parent, anchor.domain] server-side;
    // this test asserts the engine issues that filter rather than grouping
    // same-domain rows itself.
    findMany.mockImplementation((async (args: { where?: { domain?: Record<string, unknown> } }) => {
      const where = args.where ?? {};
      if (where.domain && "in" in where.domain) return [anchor];
      if (where.domain && "notIn" in where.domain) {
        expect((where.domain as { notIn: string[] }).notIn).toContain("storm");
        return [];
      }
      return [];
    }) as never);

    await runMasterIncidentCorrelation(NOW);
    expect(create).not.toHaveBeenCalled();
  });

  it("reuses the existing parent on a second run instead of creating a duplicate (idempotency)", async () => {
    const anchor = buildRow();
    const companion = buildRow({ id: "companion-1", domain: "flood" });
    mockFindManyDispatch([anchor], [companion]);
    findUnique.mockResolvedValue({ id: "parent-1", technicalFactorsJson: {} } as never);
    relationFindFirst.mockResolvedValue({ id: "existing-relation" } as never);
    auditLogFindFirst.mockResolvedValue({ metadata: JSON.stringify({ modules: ["hermes", "arca", "atlas", "vesta"] }) } as never);

    const summary = await runMasterIncidentCorrelation(NOW);

    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(summary.parentsCreated).toBe(0);
    expect(summary.parentsUpdated).toBe(1);
    expect(summary.relationsCreated).toBe(0);
    expect(relationCreate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });
});

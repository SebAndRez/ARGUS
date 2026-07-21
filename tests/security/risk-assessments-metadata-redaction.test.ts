import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `RiskAssessment.metadata` se escribe como una copia completa del
 * assessment (`persistAssessment` -> `riskAssessmentToJson({ ...assessment, ... })`),
 * y `mapStoredAssessment` antes hacia `...(metadata as Partial<ArgusRiskAssessment>)`
 * — un spread sin validar de todo lo que hubiera en esa columna JSON.
 * Regresion de la auditoria Fase 2B: ahora solo se extrae `historicalContext`
 * (el unico campo de `ArgusRiskAssessment` sin columna propia), con
 * validacion de forma explicita — cualquier otra clave presente en
 * `metadata` (conocida o no) queda afuera de la respuesta publica.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    riskAssessment: { findMany: vi.fn() },
    report: { findUnique: vi.fn() },
  },
}));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { GET as riskAssessmentsGet } from "@/app/api/risk-assessments/route";

const findManyMock = vi.mocked(prisma.riskAssessment.findMany);

const BASE_ASSESSMENT = {
  id: "risk-1",
  riskType: "fire_smoke",
  status: "probable",
  probabilityBand: "medium",
  probabilityScore: 60,
  confidence: 70,
  severity: "HIGH",
  title: "Riesgo de incendio forestal",
  summary: "Resumen del riesgo evaluado.",
  recommendedAction: "Monitorear evolucion.",
  timeframe: "24h",
  relatedExternalEventIds: ["event-1"],
  evidence: [],
  createdAt: new Date("2026-07-18T00:00:00.000Z"),
  updatedAt: new Date("2026-07-18T00:00:00.000Z"),
  nextReviewAt: null,
};

function requestForEvent(externalEventId: string) {
  return new NextRequest(`http://localhost/api/risk-assessments?externalEventId=${externalEventId}`);
}

beforeEach(() => {
  findManyMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/risk-assessments — redaccion de metadata (allowlist, no spread)", () => {
  it("nunca expone claves desconocidas de metadata, pero SI conserva historicalContext valido", async () => {
    findManyMock.mockResolvedValue([
      {
        ...BASE_ASSESSMENT,
        metadata: {
          // Copia parcial de campos ya provistos por columnas propias —
          // deben ser ignorados aunque esten presentes aca tambien.
          id: "risk-1-DIFERENTE-EN-METADATA",
          title: "Titulo distinto en metadata, nunca deberia ganar",
          // Clave arbitraria que nunca estuvo en ningun allowlist/denylist.
          internalDebugNote: "nota interna que nunca deberia salir",
          rawSourcePayload: { secretish: "dato interno sin validar" },
          historicalContext: {
            explanation: "Explicacion historica valida.",
            facts: [],
            documents: [],
          },
        },
      },
    ] as never);

    const response = await riskAssessmentsGet(requestForEvent("event-1"));
    expect(response.status).toBe(200);
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(body.assessments).toHaveLength(1);
    const assessment = body.assessments[0];

    // Las columnas propias ganan siempre, nunca lo que diga metadata.
    expect(assessment.id).toBe("risk-1");
    expect(assessment.title).toBe("Riesgo de incendio forestal");

    // Ninguna clave no reconocida de metadata sobrevive.
    expect(assessment.internalDebugNote).toBeUndefined();
    expect(assessment.rawSourcePayload).toBeUndefined();
    expect(serialized).not.toContain("internalDebugNote");
    expect(serialized).not.toContain("nota interna que nunca deberia salir");
    expect(serialized).not.toContain("rawSourcePayload");
    expect(serialized).not.toContain("dato interno sin validar");

    // El unico campo real que vive solo en metadata SI se recupera.
    expect(assessment.historicalContext).toEqual({
      explanation: "Explicacion historica valida.",
      facts: [],
      documents: [],
    });
  });

  it("historicalContext con forma invalida -> se descarta, no revienta ni se expone parcialmente", async () => {
    findManyMock.mockResolvedValue([
      {
        ...BASE_ASSESSMENT,
        metadata: {
          historicalContext: { explanation: 12345, facts: "no-es-array", documents: null },
        },
      },
    ] as never);

    const response = await riskAssessmentsGet(requestForEvent("event-1"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.assessments[0].historicalContext).toBeUndefined();
  });

  it("metadata ausente (null) -> historicalContext ausente, resto de campos intacto", async () => {
    findManyMock.mockResolvedValue([{ ...BASE_ASSESSMENT, metadata: null }] as never);

    const response = await riskAssessmentsGet(requestForEvent("event-1"));
    const body = await response.json();
    expect(body.assessments[0].historicalContext).toBeUndefined();
    expect(body.assessments[0].id).toBe("risk-1");
  });
});

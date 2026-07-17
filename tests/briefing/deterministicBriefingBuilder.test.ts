import { describe, expect, it } from "vitest";
import { buildDeterministicBriefing } from "@/lib/briefing/deterministicBriefingBuilder";
import { compareBriefingContexts } from "@/lib/briefing/briefingComparison";
import type { OperationalBriefingContext } from "@/types/operationalBriefing";

/**
 * ARGUS Prompt 8 — pure unit tests for the deterministic briefing builder
 * and context comparison. No mocking needed: both functions are pure over
 * an already-constructed `OperationalBriefingContext`.
 */

function makeContext(overrides: Partial<OperationalBriefingContext> = {}): OperationalBriefingContext {
  return {
    incident: {
      id: "incident-1",
      title: "Sismo 6.5",
      type: "EARTHQUAKE",
      severity: "high",
      confidence: "high",
      lifecycle: "active",
      verificationStatus: "official",
      primarySource: "usgs_earthquake",
      sourceCount: 1,
      startedAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      isDemo: false,
      ...overrides.incident,
    },
    territory: {
      countryCode: "CL",
      regionCode: "RM",
      latitude: -33.45,
      longitude: -70.66,
      intersectedAdministrativeAreas: ["Región Metropolitana"],
      spansMultipleAdministrativeAreas: false,
      resolutionMethod: "administrative_geometry",
      confidence: "high",
      ...overrides.territory,
    },
    relatedIncidents: overrides.relatedIncidents ?? [],
    infrastructure: overrides.infrastructure ?? [],
    infrastructureDataState: overrides.infrastructureDataState ?? "CALCULATED",
    populationAvailable: overrides.populationAvailable ?? false,
    populationReason: overrides.populationReason ?? "Sin fuente censal real conectada.",
    relations: overrides.relations ?? [],
    suggestedActions: overrides.suggestedActions ?? [],
    priority: overrides.priority ?? { level: "high", score: 60, methodology: "test" },
    gaps: overrides.gaps ?? ["Población: sin fuente real."],
    overallDossierStatus: overrides.overallDossierStatus ?? "PARTIAL",
    truncation: overrides.truncation ?? {
      contextTruncated: false,
      omittedRelatedIncidentCount: 0,
      omittedInfrastructureCount: 0,
      omittedRelationCount: 0,
    },
    contextHash: overrides.contextHash ?? "hash-1",
    generatedAt: overrides.generatedAt ?? new Date(0).toISOString(),
  };
}

describe("buildDeterministicBriefing — never recalculates canonical fields", () => {
  it("passes severity and confidence through unchanged, never recomputing them", () => {
    const context = makeContext({ incident: { severity: "critical", confidence: "verified" } as never });
    const briefing = buildDeterministicBriefing(context);

    expect(briefing.status.severity).toBe("critical");
    expect(briefing.status.confidence).toBe("verified");
    expect(briefing.evidence.incidentConfidence).toBe("verified");
  });

  it("keeps briefing confidence separate from and not equal to the incident's own confidence label", () => {
    const context = makeContext();
    const briefing = buildDeterministicBriefing(context);

    // briefingConfidence is a 0-100 number computed by its own transparent
    // rule, never a copy/mirroring of the incident's ArgusConfidence label.
    expect(typeof briefing.evidence.briefingConfidence).toBe("number");
    expect(briefing.evidence.briefingConfidence).toBeGreaterThanOrEqual(0);
    expect(briefing.evidence.briefingConfidence).toBeLessThanOrEqual(100);
  });
});

describe("buildDeterministicBriefing — composite risk rule", () => {
  it("flags elevated risk only when severity is high/critical AND real infrastructure is inside/border", () => {
    const context = makeContext({
      incident: { severity: "critical" } as never,
      infrastructure: [
        {
          poiId: "h1",
          name: "Hospital A",
          category: "hospital",
          priority: "P1",
          spatialRelation: "INSIDE",
          distanceKm: 0,
          verificationRecommendation: "test",
        },
      ],
    });
    const briefing = buildDeterministicBriefing(context);

    expect(briefing.compositeRisks).toHaveLength(1);
    expect(briefing.compositeRisks[0].level).toBe("high");
    expect(briefing.compositeRisks[0].conditionsMissing).toHaveLength(0);
  });

  it("does not fabricate a physical correlation rule (rain+soil+slope) that has no real data source", () => {
    const context = makeContext({ incident: { severity: "critical" } as never });
    const briefing = buildDeterministicBriefing(context);

    // Only the one rule this pass can derive from real signals should ever
    // appear — with no infrastructure, it should show missing conditions,
    // never invent an unrelated hazard-specific rule.
    for (const risk of briefing.compositeRisks) {
      expect(risk.rule).toContain("Severidad alta/crítica");
    }
  });

  it("emits no composite risk at all for low/medium severity", () => {
    const context = makeContext({ incident: { severity: "low" } as never });
    const briefing = buildDeterministicBriefing(context);
    expect(briefing.compositeRisks).toHaveLength(0);
  });
});

describe("buildDeterministicBriefing — actions never become orders", () => {
  it("maps suggested actions to RECOMENDACION/ACCION_PENDIENTE, never DECISION_REGISTRADA (no decision source exists yet)", () => {
    const context = makeContext({
      suggestedActions: [
        { action: "Verificar hospital", reason: "test", priority: "high", status: "SUGGESTED", relatedAssetIds: ["h1"] },
        { action: "Escalar", reason: "test", priority: "critical", status: "PENDING_VALIDATION" },
      ],
    });
    const briefing = buildDeterministicBriefing(context);

    expect(briefing.actions.map((action) => action.status)).toEqual(["RECOMENDACION", "ACCION_PENDIENTE"]);
    expect(briefing.actions.every((action) => action.status !== "DECISION_REGISTRADA")).toBe(true);
  });
});

describe("buildDeterministicBriefing — freshness and trend", () => {
  it("derives freshness from the dossier's overall status, never from the incident date alone", () => {
    expect(buildDeterministicBriefing(makeContext({ overallDossierStatus: "COMPLETE" })).freshness).toBe("FRESH");
    expect(buildDeterministicBriefing(makeContext({ overallDossierStatus: "PARTIAL" })).freshness).toBe("PARTIAL");
    expect(buildDeterministicBriefing(makeContext({ overallDossierStatus: "FAILED" })).freshness).toBe("DEGRADED");
  });

  it("never calls a single-snapshot comparison a prediction — trend defaults to SIN_DATOS_SUFICIENTES", () => {
    const briefing = buildDeterministicBriefing(makeContext());
    expect(briefing.trend).toBe("SIN_DATOS_SUFICIENTES");
    expect(briefing.recentChanges).toEqual([]);
  });
});

describe("buildDeterministicBriefing — evidence and gaps", () => {
  it("cites the incident id and every infrastructure asset id shown", () => {
    const context = makeContext({
      infrastructure: [
        { poiId: "h1", name: "H1", category: "hospital", priority: "P1", spatialRelation: "INSIDE", distanceKm: 0, verificationRecommendation: "x" },
      ],
    });
    const briefing = buildDeterministicBriefing(context);
    expect(briefing.evidence.citedIds).toContain("incident-1");
    expect(briefing.evidence.citedIds).toContain("h1");
  });

  it("surfaces every gap from the context, never silently dropping one", () => {
    const context = makeContext({ gaps: ["Población: sin fuente real.", "Rutas: sin registro."] });
    const briefing = buildDeterministicBriefing(context);
    expect(briefing.gaps).toHaveLength(2);
  });
});

describe("compareBriefingContexts", () => {
  it("reports no changes for a first version (no previous context)", () => {
    const result = compareBriefingContexts(null, makeContext());
    expect(result.hasMaterialChanges).toBe(false);
    expect(result.entries).toEqual([]);
  });

  it("reports no changes when the context hash is identical, without inspecting fields", () => {
    const context = makeContext({ contextHash: "same" });
    const result = compareBriefingContexts(makeContext({ contextHash: "same" }), context);
    expect(result.hasMaterialChanges).toBe(false);
  });

  it("detects a severity increase as INCREASED with correct from/to", () => {
    const previous = makeContext({ contextHash: "a", incident: { severity: "high" } as never });
    const current = makeContext({ contextHash: "b", incident: { severity: "critical" } as never });
    const result = compareBriefingContexts(previous, current);

    const severityChange = result.entries.find((entry) => entry.field === "severity");
    expect(severityChange).toEqual({ field: "severity", kind: "INCREASED", from: "high", to: "critical" });
    expect(result.hasMaterialChanges).toBe(true);
  });

  it("detects new and removed territories separately, and affected-infrastructure count deltas", () => {
    const previous = makeContext({
      contextHash: "a",
      territory: { intersectedAdministrativeAreas: ["Comuna A"] } as never,
      infrastructure: [],
    });
    const current = makeContext({
      contextHash: "b",
      territory: { intersectedAdministrativeAreas: ["Comuna A", "Comuna B"] } as never,
      infrastructure: [
        { poiId: "h1", name: "H1", category: "hospital", priority: "P1", spatialRelation: "INSIDE", distanceKm: 0, verificationRecommendation: "x" },
      ],
    });
    const result = compareBriefingContexts(previous, current);

    expect(result.entries).toContainEqual({ field: "territory", kind: "ADDED", from: null, to: "Comuna B" });
    expect(result.entries).toContainEqual({ field: "affectedInfrastructureCount", kind: "INCREASED", from: "0", to: "1" });
  });

  it("compares the structured context, not the rendered text", () => {
    // Same severity/territory/infrastructure but different contextHash and
    // incident title/text — no entries should reference "text" at all.
    const previous = makeContext({ contextHash: "a", incident: { title: "Old title" } as never });
    const current = makeContext({ contextHash: "b", incident: { title: "New title" } as never });
    const result = compareBriefingContexts(previous, current);

    expect(result.entries.every((entry) => entry.field !== "title")).toBe(true);
  });
});

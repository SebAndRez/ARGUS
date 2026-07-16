import { describe, expect, it } from "vitest";
import { normalizeKnowledgeInput } from "@/lib/knowledge-intake/incidentNormalizer";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/knowledge-intake/__tests__/incidentNormalizer.test.ts` (a
 * `runIncidentNormalizerTest()` export Vitest never ran).
 */
describe("normalizeKnowledgeInput", () => {
  const incident = normalizeKnowledgeInput({
    id: "test-normalizer",
    inputType: "manual_admin",
    sourceId: "csb",
    sourceName: "CSB test",
    ingestionMode: "manual",
    rawText: "Explosion industrial con chlorine, heridos y ruta afectada en Chile 2024-01-01.",
    language: "es",
    country: "CL",
    receivedAt: "2026-07-02T00:00:00.000Z",
    processingStatus: "normalized",
    tags: ["test"],
  });

  it("classifies an industrial chlorine explosion as chemical_accident or explosion", () => {
    expect(["chemical_accident", "explosion"]).toContain(incident.domain);
  });
});

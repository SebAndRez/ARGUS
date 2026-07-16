import { describe, expect, it } from "vitest";
import { demoKnowledgeIncidents } from "@/data/knowledgeIntakeDemo";
import { findSimilarIncidents } from "@/lib/knowledge-intake/similarityEngine";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/knowledge-intake/__tests__/similarityEngine.test.ts` (a
 * `runSimilarityEngineTest()` export Vitest never ran — this repo's
 * `vitest.config.ts` only includes `tests/**`). Every assertion below is
 * preserved from the original.
 */
describe("findSimilarIncidents", () => {
  const similar = findSimilarIncidents(demoKnowledgeIncidents[0], 3);

  it("returns at least one similar incident for the first demo incident", () => {
    expect(similar.length).toBeGreaterThan(0);
  });

  it("every returned match has a positive similarity score", () => {
    expect(similar.every((item) => item.similarityScore > 0)).toBe(true);
  });
});

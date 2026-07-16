import { describe, expect, it } from "vitest";
import {
  buildGvpEruptionEvidence,
  buildGvpVolcanoEvidence,
  dedupeGvpEruptions,
  dedupeGvpVolcanoes,
  normalizeGvpEruption,
  normalizeGvpVolcano,
} from "@/lib/knowledge-intake/adapters/smithsonianGvpAdapter";
import { gvpLayerRegistry } from "@/lib/gvp/gvpLayerRegistry";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/knowledge-intake/__tests__/smithsonianGvpAdapter.test.ts`. That
 * file already used describe/it/expect syntax, but declared `describe`/
 * `it`/`expect` as local ambient stubs instead of importing them from a real
 * test runner, so Vitest never executed it (this repo's `vitest.config.ts`
 * only includes `tests/**`). Every assertion below is preserved, split one
 * per `it` for clarity.
 */
describe("smithsonianGvpAdapter", () => {
  it("registers the current Holocene volcanoes WFS layer candidate", () => {
    expect(gvpLayerRegistry.holocene_volcanoes.typeNameCandidates).toContain(
      "GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes",
    );
  });

  it("registers the current Holocene eruptions WFS layer candidate", () => {
    expect(gvpLayerRegistry.holocene_eruptions.typeNameCandidates).toContain(
      "GVP-VOTW:Smithsonian_VOTW_Holocene_Eruptions",
    );
  });

  describe("volcano baseline evidence", () => {
    const context = normalizeGvpVolcano({
      type: "Feature",
      properties: { Volcano_Number: "360010", Volcano_Name: "Saba", Country: "Netherlands", Primary_Volcano_Type: "Stratovolcano" },
      geometry: { type: "Point", coordinates: [-63.23, 17.63] },
    });

    it("normalizes the volcano number", () => {
      expect(context?.volcanoNumber).toBe("360010");
    });

    it("builds baseline evidence without incident semantics", () => {
      const evidence = buildGvpVolcanoEvidence(context!);
      expect(evidence.evidenceType).toBe("volcano_baseline_context");
    });
  });

  describe("eruption history evidence", () => {
    const context = normalizeGvpEruption({
      type: "Feature",
      properties: { Eruption_Number: "12345", Volcano_Number: "360010", Volcano_Name: "Saba", VEI: "2", Start_Date: "1640" },
    });

    it("normalizes the VEI as a number", () => {
      expect(context?.vei).toBe(2);
    });

    it("dedupes eruptions by eruption id", () => {
      expect(dedupeGvpEruptions([context!, context!]).length).toBe(1);
    });

    it("dedupes volcanoes by volcano number", () => {
      const first = normalizeGvpVolcano({ properties: { Volcano_Number: "1", Volcano_Name: "A" } })!;
      const second = normalizeGvpVolcano({ properties: { Volcano_Number: "1", Volcano_Name: "A" } })!;
      expect(dedupeGvpVolcanoes([first, second]).length).toBe(1);
    });

    it("builds eruption history evidence", () => {
      expect(buildGvpEruptionEvidence(context!).evidenceType).toBe("eruption_history_context");
    });
  });
});

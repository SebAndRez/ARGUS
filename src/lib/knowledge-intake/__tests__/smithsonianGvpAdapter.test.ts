import {
  buildGvpEruptionEvidence,
  buildGvpVolcanoEvidence,
  dedupeGvpEruptions,
  dedupeGvpVolcanoes,
  normalizeGvpEruption,
  normalizeGvpVolcano,
} from "@/lib/knowledge-intake/adapters/smithsonianGvpAdapter";
import { gvpLayerRegistry } from "@/lib/gvp/gvpLayerRegistry";

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: {
  (value: unknown): {
    toBe: (expected: unknown) => void;
    toContain: (expected: unknown) => void;
  };
};

describe("smithsonianGvpAdapter", () => {
  it("registers current WFS layer candidates", () => {
    expect(gvpLayerRegistry.holocene_volcanoes.typeNameCandidates).toContain("GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes");
    expect(gvpLayerRegistry.holocene_eruptions.typeNameCandidates).toContain("GVP-VOTW:Smithsonian_VOTW_Holocene_Eruptions");
  });

  it("normalizes volcano baseline evidence without incident semantics", () => {
    const context = normalizeGvpVolcano({
      type: "Feature",
      properties: { Volcano_Number: "360010", Volcano_Name: "Saba", Country: "Netherlands", Primary_Volcano_Type: "Stratovolcano" },
      geometry: { type: "Point", coordinates: [-63.23, 17.63] },
    });
    expect(context?.volcanoNumber).toBe("360010");
    const evidence = buildGvpVolcanoEvidence(context!);
    expect(evidence.evidenceType).toBe("volcano_baseline_context");
  });

  it("normalizes eruption history evidence and dedupes by eruption id", () => {
    const context = normalizeGvpEruption({
      type: "Feature",
      properties: { Eruption_Number: "12345", Volcano_Number: "360010", Volcano_Name: "Saba", VEI: "2", Start_Date: "1640" },
    });
    expect(context?.vei).toBe(2);
    expect(dedupeGvpEruptions([context!, context!]).length).toBe(1);
    expect(dedupeGvpVolcanoes([normalizeGvpVolcano({ properties: { Volcano_Number: "1", Volcano_Name: "A" } })!, normalizeGvpVolcano({ properties: { Volcano_Number: "1", Volcano_Name: "A" } })!]).length).toBe(1);
    expect(buildGvpEruptionEvidence(context!).evidenceType).toBe("eruption_history_context");
  });
});

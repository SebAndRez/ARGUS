import { describe, expect, it } from "vitest";
import { getIncidentCreationDecision } from "@/lib/source-governance/incidentGuardrails";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/source-governance/__tests__/incidentGuardrails.test.ts` (a
 * `runIncidentGuardrailsTest()` export Vitest never ran). Every assertion
 * below is preserved from the original.
 */
describe("getIncidentCreationDecision", () => {
  const gdelt = getIncidentCreationDecision("gdelt");
  const glofas = getIncidentCreationDecision("copernicus-glofas", { hasAoi: true });
  const gfmNoContext = getIncidentCreationDecision("copernicus-gfm");
  const gfmWithContext = getIncidentCreationDecision("copernicus-gfm", {
    hasAoi: true,
    hasSelectedIncident: true,
  });

  it("gdelt creates a candidate", () => {
    expect(gdelt.action).toBe("create_candidate");
  });

  it("gdelt requires review", () => {
    expect(gdelt.requiresReview).toBeTruthy();
  });

  it("copernicus-glofas with an AOI creates a candidate", () => {
    expect(glofas.action).toBe("create_candidate");
  });

  it("copernicus-gfm with no context creates a candidate", () => {
    expect(gfmNoContext.action).toBe("create_candidate");
  });

  it("copernicus-gfm with AOI + selected incident context creates a full incident", () => {
    expect(gfmWithContext.action).toBe("create_incident");
  });

  it("copernicus-gfm with full context still requires review", () => {
    expect(gfmWithContext.requiresReview).toBeTruthy();
  });
});

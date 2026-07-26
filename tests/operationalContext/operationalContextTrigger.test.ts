import { describe, expect, it } from "vitest";
import { evaluateOperationalContextTrigger } from "@/data/operationalContextTriggerRules";

/**
 * Fase Trigger — reglas configurables, no `if (source === "senapred")`.
 * Cubre exactamente los casos del mandato: severidad crítica siempre
 * activa, alta siempre activa, media solo si la fuente es oficial (cubre
 * "SENAPRED Amarilla"/"GDACS Orange" sin depender de un campo de color que
 * `ModuleIncidentSummary` no expone — ver el comentario del registro).
 */
describe("evaluateOperationalContextTrigger", () => {
  it("activates on critical severity regardless of source", () => {
    const result = evaluateOperationalContextTrigger({ severity: "critical", sourceSummary: { isOfficial: false } });
    expect(result).toEqual({ activated: true, ruleId: "critical_any_source" });
  });

  it("activates on high severity regardless of source", () => {
    const result = evaluateOperationalContextTrigger({ severity: "high", sourceSummary: { isOfficial: false } });
    expect(result).toEqual({ activated: true, ruleId: "high_any_source" });
  });

  it("activates on medium severity when the source is official", () => {
    const result = evaluateOperationalContextTrigger({ severity: "medium", sourceSummary: { isOfficial: true } });
    expect(result).toEqual({ activated: true, ruleId: "official_medium" });
  });

  it("does not activate on medium severity from a non-official source", () => {
    const result = evaluateOperationalContextTrigger({ severity: "medium", sourceSummary: { isOfficial: false } });
    expect(result).toEqual({ activated: false });
  });

  it("never activates on low or info severity", () => {
    expect(evaluateOperationalContextTrigger({ severity: "low", sourceSummary: { isOfficial: true } })).toEqual({ activated: false });
    expect(evaluateOperationalContextTrigger({ severity: "info", sourceSummary: { isOfficial: true } })).toEqual({ activated: false });
  });
});

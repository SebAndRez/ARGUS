import { describe, expect, it } from "vitest";
import { argusModules, getModuleById } from "../../src/data/argusModules";
import type { ModuleMaturity } from "../../src/types/argusModule";

/**
 * ARGUS Prompt 18 §7/§26 — the module registry must be the single source of
 * truth for capability-truth labeling. Any module that declares `maturity`
 * must use one of the six canonical values and explain itself via
 * `maturityNotes` — no silent/unlabeled classification.
 */

const CANONICAL_MATURITY_VALUES: ModuleMaturity[] = [
  "operational",
  "partially_operational",
  "restricted",
  "preview",
  "planned",
  "disabled",
];

const STABILIZED_MODULE_IDS = ["argus-hermes", "argus-arca", "argus-aura", "argus-custos", "argus-nexus"];

describe("Registro de módulos — vocabulario de madurez", () => {
  it("todo módulo con `maturity` definido usa uno de los 6 valores canónicos", () => {
    for (const entry of argusModules) {
      if (entry.maturity) {
        expect(CANONICAL_MATURITY_VALUES).toContain(entry.maturity);
      }
    }
  });

  it.each(STABILIZED_MODULE_IDS)("%s tiene maturity y maturityNotes no vacíos", (moduleId) => {
    const entry = getModuleById(moduleId);
    expect(entry?.maturity).toBeDefined();
    expect(entry?.maturityNotes?.length ?? 0).toBeGreaterThan(0);
  });

  it("la clasificación de cada módulo coincide con la evidencia auditada (Prompt 18)", () => {
    expect(getModuleById("argus-hermes")?.maturity).toBe("partially_operational");
    expect(getModuleById("argus-arca")?.maturity).toBe("preview");
    expect(getModuleById("argus-aura")?.maturity).toBe("partially_operational");
    expect(getModuleById("argus-custos")?.maturity).toBe("preview");
    expect(getModuleById("argus-nexus")?.maturity).toBe("planned");
  });
});

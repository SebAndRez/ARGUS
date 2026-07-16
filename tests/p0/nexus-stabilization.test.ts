import { statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getModuleById } from "../../src/data/argusModules";

/**
 * ARGUS Prompt 18 — NEXUS stabilization; Prompt 20 — cleanup. NEXUS has zero
 * implementation beyond its registry entry and the generic
 * `ModulePlaceholder` — it must classify as `planned`. The four speculative
 * `*NexusBridge.ts` stub files (written ahead of a module that never got
 * built) had zero importers anywhere in the repo (verified in Prompt 18 and
 * re-verified in Prompt 20) and were deleted outright rather than kept as
 * unreferenced dead code — this test now asserts they're gone, not merely
 * unimported.
 */

const SRC_ROOT = resolve(__dirname, "../../src");

const removedNexusBridgeFiles = [
  "modules/fenix/fenixNexusBridge.ts",
  "modules/aura/auraNexusBridge.ts",
  "modules/arca/arcaNexusBridge.ts",
  "modules/hermes/hermesNexusBridge.ts",
];

function fileExists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

describe("NEXUS — clasificación del registro refleja la ausencia real de implementación", () => {
  it("argus-nexus está clasificado como 'planned'", () => {
    const nexusModule = getModuleById("argus-nexus");
    expect(nexusModule?.maturity).toBe("planned");
  });

  it("no existe un directorio de módulo propio (src/modules/nexus)", () => {
    expect(fileExists(resolve(SRC_ROOT, "modules/nexus"))).toBe(false);
  });
});

describe("NEXUS — los 4 puentes (*NexusBridge.ts) fueron retirados (Prompt 20)", () => {
  it.each(removedNexusBridgeFiles)("%s ya no existe en disco", (relativePath) => {
    expect(fileExists(resolve(SRC_ROOT, relativePath))).toBe(false);
  });
});

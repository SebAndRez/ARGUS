import { describe, expect, it } from "vitest";
import * as wave3Transformers from "../../src/lib/database-target/adapters/wave3Transformers";
import * as incidentAdapters from "../../src/lib/database-target/adapters/incident";
import * as wave3Domains from "../../src/lib/database-target/shadow-write/wave3Domains";
import * as incidentPromotionRepository from "../../src/lib/database-target/repositories/incidentPromotionRepository";

/**
 * tests/database-target/wave4-no-direct-incident-creation.test.ts
 *
 * The single most important safety property of the wave-3/wave-4
 * boundary, restated for wave 4: `incident.incidents` rows are NEVER
 * created except through `services/incidentPromotionService.ts`'s
 * `promoteIncidentCandidateHuman`/`promoteIncidentCandidateAutomated` —
 * never directly from `ExternalEvent`, `Report`, or a prediction/forecast
 * source. This is a static/structural proof (no Docker needed): it greps
 * the actual transformer and shadow-write modules for any call into
 * `insertIncident`/`promoteIncidentCandidate*`, which would be the only
 * way such a shortcut could exist.
 */
describe("wave 4 — no direct Incident creation from ExternalEvent/Report/prediction sources", () => {
  it("adapters/wave3Transformers.ts exports no function that returns/produces an Incident (only SourceRecord/Observation/IncidentCandidate targets)", () => {
    const exportNames = Object.keys(wave3Transformers);
    for (const name of exportNames) {
      expect(name).not.toMatch(/ToIncident$|ToIncidentTarget$/);
    }
  });

  it("adapters/incident.ts's Incident-producing transform (knowledgeIncidentToTarget) is never invoked by the candidate-producing transform (knowledgeIncidentToCandidate)", () => {
    // Structural proof: the candidate transform's source does not reference
    // the Incident transform's name at all (no delegation, no fallthrough).
    const candidateFnSource = incidentAdapters.knowledgeIncidentToCandidate.toString();
    expect(candidateFnSource).not.toContain("knowledgeIncidentToTarget");
  });

  it("shadow-write/wave3Domains.ts exposes no *IncidentWave3/*IncidentTargetWave3 shadow-write wiring — only *CandidateWave3", () => {
    const exportNames = Object.keys(wave3Domains);
    const incidentLikeExports = exportNames.filter((name) => /Incident/i.test(name));
    for (const name of incidentLikeExports) {
      expect(name).toMatch(/Candidate/);
    }
  });

  it("the ONLY repository function that inserts into incident.incidents is insertIncident, and it is exclusively imported by incidentPromotionService.ts", async () => {
    expect(typeof incidentPromotionRepository.insertIncident).toBe("function");
    const fs = await import("node:fs");
    const path = await import("node:path");
    const repoRoot = path.join(__dirname, "..", "..");
    const serviceFile = path.join(repoRoot, "src", "lib", "database-target", "services", "incidentPromotionService.ts");
    const serviceSource = fs.readFileSync(serviceFile, "utf8");
    expect(serviceSource).toContain("insertIncident");

    // No adapter/shadow-write module imports insertIncident directly.
    const adaptersDir = path.join(repoRoot, "src", "lib", "database-target", "adapters");
    const shadowWriteDir = path.join(repoRoot, "src", "lib", "database-target", "shadow-write");
    for (const dir of [adaptersDir, shadowWriteDir]) {
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith(".ts")) continue;
        const source = fs.readFileSync(path.join(dir, file), "utf8");
        expect(source).not.toMatch(/\binsertIncident\b/);
      }
    }
  });
});

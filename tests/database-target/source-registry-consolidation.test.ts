import { describe, expect, it } from "vitest";
import {
  buildCanonicalSourceDirectory,
  getCanonicalSourceEntry,
} from "../../src/lib/database-target/adapters/sourceRegistryConsolidation";
import { VIGIA_SOURCE_REGISTRY } from "../../src/lib/vigia/sourceRegistry";
import { getAllKnowledgeSources } from "../../src/lib/knowledge-intake/sourceRegistry";

/**
 * DUP-003 resolution: asserts a single canonical directory exists, that it
 * never loses a source from either upstream registry, never invents an
 * enabled/disabled state, and never silently resolves drift between the
 * two registries for an id present in both.
 */
describe("buildCanonicalSourceDirectory (DUP-003)", () => {
  it("loses zero sources — every Vigia id and every Knowledge Intake id appears exactly once", () => {
    const directory = buildCanonicalSourceDirectory();
    const directoryIds = new Set(directory.map((e) => e.id));

    for (const source of VIGIA_SOURCE_REGISTRY) {
      expect(directoryIds.has(source.id)).toBe(true);
    }
    for (const source of getAllKnowledgeSources()) {
      expect(directoryIds.has(source.id)).toBe(true);
    }

    const ids = directory.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate rows
  });

  it("never changes an external id, endpoint, or cadence — vigia sub-record is passed through verbatim", () => {
    const gdacs = getCanonicalSourceEntry("gdacs");
    const rawGdacs = VIGIA_SOURCE_REGISTRY.find((s) => s.id === "gdacs")!;
    expect(gdacs).not.toBeNull();
    expect(gdacs!.vigia).toEqual(rawGdacs);
    expect(gdacs!.vigia!.endpoint).toBe(rawGdacs.endpoint);
    expect(gdacs!.vigia!.refreshIntervalMinutes).toBe(rawGdacs.refreshIntervalMinutes);
  });

  it("never activates a disabled source — enabled flag is carried verbatim, never flipped", () => {
    const directory = buildCanonicalSourceDirectory();
    for (const entry of directory) {
      if (entry.vigia) {
        const raw = VIGIA_SOURCE_REGISTRY.find((s) => s.id === entry.id)!;
        expect(entry.vigia.enabled).toBe(raw.enabled);
      }
    }
  });

  it("marks entries present in BOTH registries with both origins recorded", () => {
    const gdacs = getCanonicalSourceEntry("gdacs");
    expect(gdacs!.origins).toEqual(expect.arrayContaining(["vigia", "knowledge-intake"]));
    expect(gdacs!.vigia).not.toBeNull();
    expect(gdacs!.knowledgeIntake).not.toBeNull();
  });

  it("marks a vigia-only entry with a single origin and a null knowledgeIntake side", () => {
    const senapred = getCanonicalSourceEntry("senapred_eventos");
    expect(senapred).not.toBeNull();
    expect(senapred!.origins).toEqual(["vigia"]);
    expect(senapred!.knowledgeIntake).toBeNull();
  });

  it("marks a knowledge-intake-only entry with a single origin and a null vigia side", () => {
    const csn = getCanonicalSourceEntry("csn_chile");
    expect(csn).not.toBeNull();
    expect(csn!.origins).toEqual(["knowledge-intake"]);
    expect(csn!.vigia).toBeNull();
  });

  it("returns null for an id present in neither registry — never fabricates an entry", () => {
    expect(getCanonicalSourceEntry("does-not-exist")).toBeNull();
  });

  it("computes hasEnabledStateDrift only for ids present in both registries, comparing verbatim flags", () => {
    const directory = buildCanonicalSourceDirectory();
    const bothOrigins = directory.filter((e) => e.origins.length === 2);
    expect(bothOrigins.length).toBeGreaterThan(0);
    for (const entry of bothOrigins) {
      const expectedDrift =
        entry.vigia!.enabled !==
        (entry.knowledgeIntake!.status === "active" ||
          entry.knowledgeIntake!.status === "active_contextual" ||
          entry.knowledgeIntake!.status === "active_historical" ||
          entry.knowledgeIntake!.status === "active_institutional");
      expect(entry.hasEnabledStateDrift).toBe(expectedDrift);
    }
  });

  it("is a live view, not a cached copy — reflects the same data as the source registries on every call", () => {
    const first = buildCanonicalSourceDirectory();
    const second = buildCanonicalSourceDirectory();
    expect(first.map((e) => e.id)).toEqual(second.map((e) => e.id));
  });
});
